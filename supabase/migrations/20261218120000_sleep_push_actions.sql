-- Private, single-purpose credentials. Only the delivery service can issue them.
create table if not exists public.chronicle_sleep_push_actions (
  token_hash text primary key,
  subscription_id uuid not null references public.chronicle_push_subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  night date not null,
  timezone text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  unique (subscription_id, night)
);
alter table public.chronicle_sleep_push_actions enable row level security;
revoke all on public.chronicle_sleep_push_actions from public, anon, authenticated;
grant select, insert, delete on public.chronicle_sleep_push_actions to service_role;
create index if not exists chronicle_sleep_push_actions_expiry_idx on public.chronicle_sleep_push_actions(expires_at);

create or replace function public.chronicle_record_push_bedtime(p_token_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  action public.chronicle_sleep_push_actions%rowtype;
  state public.chronicle_state%rowtype;
  instant timestamptz := clock_timestamp();
  local_time timestamp;
  night_key text;
  bed text;
  life jsonb;
  journal jsonb;
  next_data jsonb;
begin
  select * into action from public.chronicle_sleep_push_actions
    where token_hash = p_token_hash;
  if not found or action.expires_at <= instant then return 'unavailable'; end if;
  -- A subscription can be removed or reassigned when the device switches users.
  perform 1 from public.chronicle_push_subscriptions
    where id = action.subscription_id and user_id = action.user_id for share;
  if not found then return 'unavailable'; end if;
  select * into action from public.chronicle_sleep_push_actions
    where token_hash = p_token_hash for update;
  if not found or action.expires_at <= instant then return 'unavailable'; end if;
  if action.consumed_at is not null then return 'already_recorded'; end if;

  local_time := instant at time zone action.timezone;
  if local_time::time >= time '21:00' then
    night_key := (local_time::date + 1)::text;
  elsif local_time::time < time '04:00' then
    night_key := local_time::date::text;
  end if;
  if night_key is distinct from action.night::text then return 'unavailable'; end if;
  bed := to_char(local_time, 'HH24:MI');

  select * into state from public.chronicle_state where user_id = action.user_id for update;
  if not found then return 'unavailable'; end if;
  if state.data #>> '{notify,enabled}' = 'false'
    or state.data #>> '{notify,deliver}' is distinct from 'true'
    or coalesce(state.data #> '{notify,mutedCategories}', '[]') ? 'life'
    or coalesce(state.data #> '{notify,mutedRules}', '[]') ? 'bedtime-reminder'
    or (state.data #>> '{profile,timezone}' is not null and state.data #>> '{profile,timezone}' <> action.timezone)
  then return 'unavailable'; end if;

  life := coalesce(state.data -> 'lifeLog', '[]'::jsonb);
  if exists (select 1 from jsonb_array_elements(life) e
      where e ->> 'date' = night_key and nullif(e ->> 'bedtime', '') is not null)
    or exists (select 1 from jsonb_array_elements(coalesce(state.data -> 'journal', '[]')) e
      where e ->> 'date' = night_key and nullif(e ->> 'sleepTime', '') is not null)
  then
    update public.chronicle_sleep_push_actions set consumed_at = instant where token_hash = p_token_hash;
    return 'already_recorded';
  end if;
  if exists (select 1 from jsonb_array_elements(life || coalesce(state.data -> 'journal', '[]')) e
      where e ->> 'date' = night_key and nullif(e ->> 'wakeTime', '') is not null)
  then return 'unavailable'; end if;

  update public.chronicle_sleep_push_actions set consumed_at = instant where token_hash = p_token_hash;

  if exists (select 1 from jsonb_array_elements(life) e where e ->> 'date' = night_key) then
    select jsonb_agg(case when e ->> 'date' = night_key then e || jsonb_build_object('bedtime', bed, 'sleepTimezone', action.timezone) else e end order by ord)
      into life from jsonb_array_elements(life) with ordinality as x(e, ord);
  else
    select jsonb_agg(e order by e ->> 'date') into life
      from jsonb_array_elements(life || jsonb_build_array(jsonb_build_object('id', 'life-' || night_key, 'date', night_key, 'bedtime', bed, 'sleepTimezone', action.timezone))) e;
  end if;
  next_data := jsonb_set(state.data, '{lifeLog}', life, true);

  if jsonb_typeof(state.data -> 'journal') = 'array' then
    select coalesce(jsonb_agg(case when e ->> 'date' = night_key then e || jsonb_build_object('sleepTime', bed) else e end order by ord), '[]')
      into journal from jsonb_array_elements(state.data -> 'journal') with ordinality as x(e, ord);
    next_data := jsonb_set(next_data, '{journal}', journal);
  end if;

  perform public.chronicle_keep_copy(action.user_id, state.version, state.data, 'checkpoint');
  -- The existing snapshot triggers increment the version and announce the change.
  update public.chronicle_state set data = next_data, last_device = 'sleep notification' where user_id = action.user_id;
  return 'recorded';
end;
$$;
revoke all on function public.chronicle_record_push_bedtime(text) from public, anon, authenticated;
grant execute on function public.chronicle_record_push_bedtime(text) to service_role;
