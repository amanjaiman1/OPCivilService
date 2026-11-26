-- Native and Web Push share the same row lock, sleep checks and snapshot
-- write. Only the channel-specific wrappers can invoke this helper.
create or replace function public.chronicle_commit_bedtime(p_owner uuid, p_night date, p_zone text, p_instant timestamptz)
returns text language plpgsql set search_path = '' as $$
declare
  state public.chronicle_state%rowtype;
  local_time timestamp;
  night_key text;
  bed text;
  life jsonb;
  journal jsonb;
  next_data jsonb;
begin
  local_time := p_instant at time zone p_zone;
  if local_time::time >= time '21:00' then
    night_key := (local_time::date + 1)::text;
  elsif local_time::time < time '04:00' then
    night_key := local_time::date::text;
  end if;
  if night_key is distinct from p_night::text then return 'unavailable'; end if;
  bed := to_char(local_time, 'HH24:MI');

  select * into state from public.chronicle_state where user_id = p_owner for update;
  if not found then return 'unavailable'; end if;
  if state.data #>> '{notify,enabled}' = 'false'
    or state.data #>> '{notify,deliver}' is distinct from 'true'
    or coalesce(state.data #> '{notify,mutedCategories}', '[]') ? 'life'
    or coalesce(state.data #> '{notify,mutedRules}', '[]') ? 'bedtime-reminder'
    or (state.data #>> '{profile,timezone}' is not null and state.data #>> '{profile,timezone}' <> p_zone)
  then return 'unavailable'; end if;

  life := coalesce(state.data -> 'lifeLog', '[]'::jsonb);
  if exists (select 1 from jsonb_array_elements(life) e
      where e ->> 'date' = night_key and nullif(e ->> 'bedtime', '') is not null)
    or exists (select 1 from jsonb_array_elements(coalesce(state.data -> 'journal', '[]')) e
      where e ->> 'date' = night_key and nullif(e ->> 'sleepTime', '') is not null)
  then
    return 'already_recorded';
  end if;
  if exists (select 1 from jsonb_array_elements(life || coalesce(state.data -> 'journal', '[]')) e
      where e ->> 'date' = night_key and nullif(e ->> 'wakeTime', '') is not null)
  then return 'unavailable'; end if;

  if exists (select 1 from jsonb_array_elements(life) e where e ->> 'date' = night_key) then
    select jsonb_agg(case when e ->> 'date' = night_key then e || jsonb_build_object('bedtime', bed, 'sleepTimezone', p_zone) else e end order by ord)
      into life from jsonb_array_elements(life) with ordinality as x(e, ord);
  else
    select jsonb_agg(e order by e ->> 'date') into life
      from jsonb_array_elements(life || jsonb_build_array(jsonb_build_object('id', 'life-' || night_key, 'date', night_key, 'bedtime', bed, 'sleepTimezone', p_zone))) e;
  end if;
  next_data := jsonb_set(state.data, '{lifeLog}', life, true);

  if jsonb_typeof(state.data -> 'journal') = 'array' then
    select coalesce(jsonb_agg(case when e ->> 'date' = night_key then e || jsonb_build_object('sleepTime', bed) else e end order by ord), '[]')
      into journal from jsonb_array_elements(state.data -> 'journal') with ordinality as x(e, ord);
    next_data := jsonb_set(next_data, '{journal}', journal);
  end if;

  perform public.chronicle_keep_copy(p_owner, state.version, state.data, 'checkpoint');
  -- The existing snapshot triggers increment the version and announce the change.
  update public.chronicle_state set data = next_data, schema_version = greatest(schema_version,19), last_device = 'sleep notification' where user_id = p_owner;
  return 'recorded';
end;
$$;
revoke all on function public.chronicle_commit_bedtime(uuid,date,text,timestamptz) from public, anon, authenticated, service_role;

create or replace function public.chronicle_record_push_bedtime(p_token_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  action public.chronicle_sleep_push_actions%rowtype;
  instant timestamptz := clock_timestamp();
  result text;
begin
  select * into action from public.chronicle_sleep_push_actions
    where token_hash = p_token_hash;
  if not found or action.expires_at <= instant then return 'unavailable'; end if;
  -- A subscription can be removed or reassigned when the device switches users.
  perform 1 from public.chronicle_push_subscriptions
    where id = action.subscription_id and user_id = action.user_id for share;
  if not found or not exists (
    select 1 from auth.users where id=action.user_id and (banned_until is null or banned_until<=instant)
  ) then return 'unavailable'; end if;
  select * into action from public.chronicle_sleep_push_actions
    where token_hash = p_token_hash for update;
  if not found or action.expires_at <= instant then return 'unavailable'; end if;
  if action.consumed_at is not null then return 'already_recorded'; end if;

  result := public.chronicle_commit_bedtime(action.user_id, action.night, action.timezone, instant);
  if result in ('recorded', 'already_recorded') then
    update public.chronicle_sleep_push_actions set consumed_at = instant where token_hash = p_token_hash;
  end if;
  return result;
end
$$;
revoke all on function public.chronicle_record_push_bedtime(text) from public, anon, authenticated;
grant execute on function public.chronicle_record_push_bedtime(text) to service_role;

create table if not exists public.chronicle_native_bedtime_actions (
  device_id uuid not null references public.chronicle_native_push(device_id) on delete cascade,
  night date not null,
  token uuid not null unique,
  timezone text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  primary key (device_id, night)
);
create index if not exists chronicle_native_bedtime_expiry on public.chronicle_native_bedtime_actions(expires_at);
alter table public.chronicle_native_bedtime_actions enable row level security;
revoke all on public.chronicle_native_bedtime_actions from public, anon, authenticated;
grant select, insert, delete on public.chronicle_native_bedtime_actions to service_role;

create or replace function public.chronicle_record_native_bedtime(p_device uuid, p_token uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := auth.uid();
  instant timestamptz := clock_timestamp();
  action public.chronicle_native_bedtime_actions%rowtype;
  result text;
begin
  if owner is null then return 'unavailable'; end if;
  -- Lock the registration first, the same order used by revocation and FK cascade.
  perform 1 from public.chronicle_native_push
    where device_id = p_device and user_id = owner for share;
  if not found or not exists (
    select 1 from auth.users where id = owner and (banned_until is null or banned_until <= instant)
  ) then return 'unavailable'; end if;

  select * into action from public.chronicle_native_bedtime_actions
    where device_id = p_device and token = p_token for update;
  if not found or action.expires_at <= instant then return 'unavailable'; end if;
  if action.consumed_at is not null then return 'already_recorded'; end if;

  result := public.chronicle_commit_bedtime(owner, action.night, action.timezone, instant);
  if result in ('recorded', 'already_recorded') then
    update public.chronicle_native_bedtime_actions set consumed_at = instant where token = p_token;
  end if;
  return result;
end
$$;
revoke all on function public.chronicle_record_native_bedtime(uuid,uuid) from public, anon, service_role;
grant execute on function public.chronicle_record_native_bedtime(uuid,uuid) to authenticated;
