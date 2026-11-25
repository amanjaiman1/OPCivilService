create or replace function public.platform_settings_defaults()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'review_min_days', 14,
    'review_min_usage_days', 5,
    'reviews_open', true,
    'review_invite_enabled', true,
    'review_invite_time', '19:00',
    'review_invite_frequency_days', 1,
    'review_invite_postpone_days', 14,
    'review_edit_policy', 'keep_previous',
    'review_aggregate_min', 5,
    'review_story_min_chars', 600,
    'verified_active_usage_days', 15,
    'established_member_days', 90,
    'testimonials_on_home', true,
    'testimonials_home_count', 3,
    'testimonials_on_feature_pages', true,
    'moderators_handle_feedback', false,
    'moderators_hide_reviews', true,
    'admins_read_audit', false,
    'support_email', '',
    'announcement_default_days', 14,
    'announcement_default_category', 'general',
    'app_notice', jsonb_build_object('enabled', false, 'message', '', 'tone', 'info')
  )
$$;

create or replace function public.platform_setting_problem(p_key text, p_value jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  n numeric;
begin
  if p_key in ('reviews_open', 'review_invite_enabled', 'testimonials_on_home', 'testimonials_on_feature_pages',
               'moderators_handle_feedback', 'moderators_hide_reviews', 'admins_read_audit') then
    return case when jsonb_typeof(p_value) = 'boolean' then null else 'Expected on or off.' end;
  end if;
  if p_key = 'review_invite_time' then
    return case when jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then null else 'Choose a local time.' end;
  end if;
  if p_key in ('review_invite_frequency_days', 'review_invite_postpone_days', 'review_min_days', 'review_min_usage_days', 'testimonials_home_count', 'announcement_default_days',
               'review_aggregate_min', 'review_story_min_chars', 'verified_active_usage_days', 'established_member_days') then
    if jsonb_typeof(p_value) <> 'number' then return 'Expected a whole number.'; end if;
    n := (p_value #>> '{}')::numeric;
    if n <> trunc(n) then return 'Expected a whole number.'; end if;
    return case
      when p_key in ('review_invite_frequency_days', 'review_invite_postpone_days') and n not between 1 and 90 then 'Between 1 and 90 days.'
      when p_key = 'review_min_days' and n not between 0 and 365 then 'Between 0 and 365 days.'
      when p_key = 'review_min_usage_days' and n not between 1 and 365 then 'Between 1 and 365 days.'
      when p_key = 'testimonials_home_count' and n not between 1 and 6 then 'Between 1 and 6 reviews.'
      when p_key = 'announcement_default_days' and n not between 1 and 90 then 'Between 1 and 90 days.'
      when p_key = 'review_aggregate_min' and n not between 1 and 50 then 'Between 1 and 50 reviews.'
      when p_key = 'review_story_min_chars' and n not between 200 and 3000 then 'Between 200 and 3000 characters.'
      when p_key = 'verified_active_usage_days' and n not between 1 and 365 then 'Between 1 and 365 days.'
      when p_key = 'established_member_days' and n not between 30 and 1095 then 'Between 30 and 1095 days.'
      else null end;
  end if;
  if p_key = 'review_edit_policy' then
    return case when jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') in ('keep_previous', 'remove_until_approved')
                then null else 'Unknown option.' end;
  end if;
  if p_key = 'support_email' then
    if jsonb_typeof(p_value) <> 'string' then return 'Expected an email address.'; end if;
    return case when (p_value #>> '{}') = '' or ((p_value #>> '{}') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
                     and char_length(p_value #>> '{}') <= 200) then null else 'That isn''t an email address.' end;
  end if;
  if p_key = 'announcement_default_category' then
    return case when (p_value #>> '{}') in ('product_update', 'new_feature', 'maintenance', 'important', 'general')
                     and jsonb_typeof(p_value) = 'string' then null else 'Unknown category.' end;
  end if;
  if p_key = 'app_notice' then
    if jsonb_typeof(p_value) <> 'object' or jsonb_typeof(p_value -> 'enabled') <> 'boolean'
       or jsonb_typeof(p_value -> 'message') <> 'string' or coalesce(p_value ->> 'tone', '') not in ('info', 'warning')
       or exists (select 1 from jsonb_object_keys(p_value) k where k not in ('enabled', 'message', 'tone')) then
      return 'Expected a notice with on or off, a message and a tone.';
    end if;
    if char_length(p_value ->> 'message') > 240 then return 'Keep the notice under 240 characters.'; end if;
    if (p_value ->> 'enabled')::boolean and char_length(btrim(p_value ->> 'message')) < 3 then
      return 'Write the notice before switching it on.';
    end if;
    return null;
  end if;
  return 'Unknown setting.';
end
$$;

alter table public.platform_review_invitations
  add column if not exists claim_id uuid,
  add column if not exists claim_until timestamptz,
  add column if not exists last_shown_at timestamptz,
  add column if not exists last_shown_day date,
  add column if not exists claim_answered boolean not null default false;

create or replace function public.platform_claim_review_invitation(p_action text, p_id uuid, p_zone text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  settings jsonb;
  row public.platform_review_invitations%rowtype;
  zone text;
  local_time timestamp;
  instant timestamptz := now();
  freq integer;
begin
  if uid is null or p_id is null or not exists (
    select 1 from auth.users where id = uid and (banned_until is null or banned_until <= instant)
  ) then return false; end if;
  if p_action is null or p_action not in ('reserve','show','release','postpone','dismiss') then return false; end if;
  settings := public.platform_settings_current();
  if p_action in ('reserve','show') then
    if not (settings ->> 'review_invite_enabled')::boolean or not (settings ->> 'reviews_open')::boolean then return false; end if;
    select data #>> '{profile,timezone}' into zone from public.chronicle_state where user_id = uid;
    if zone is null or not exists (select 1 from pg_timezone_names where name = zone) then zone := p_zone; end if;
    if zone is null or length(zone) > 100 or not exists (select 1 from pg_timezone_names where name = zone) then return false; end if;
    local_time := instant at time zone zone;
    if local_time::time < (settings ->> 'review_invite_time')::time then return false; end if;
  end if;

  -- Create a row only for a potentially eligible account. The lock serializes tabs and devices.
  if p_action = 'reserve' then
    if not exists (select 1 from public.platform_review_invitations where user_id=uid)
      and not public.platform_review_invite_due(uid) then return false; end if;
    insert into public.platform_review_invitations (user_id) values (uid) on conflict (user_id) do nothing;
  end if;
  select * into row from public.platform_review_invitations where user_id = uid for update;
  if not found then return false; end if;
  if p_action = 'release' then
    update public.platform_review_invitations set claim_id = null, claim_until = null
      where user_id = uid and claim_id = p_id and claim_until is not null;
    return true;
  end if;

  if p_action in ('postpone','dismiss') then
    if row.claim_id is distinct from p_id or row.claim_until is not null or row.last_shown_at is null then return false; end if;
    if row.claim_answered then return true; end if;
    update public.platform_review_invitations set
      claim_answered = true,
      postpone_count = postpone_count + case when p_action = 'postpone' then 1 else 0 end,
      postponed_until = case when p_action = 'postpone' then instant + make_interval(days => (settings ->> 'review_invite_postpone_days')::int) else postponed_until end,
      dismissed_at = case when p_action = 'dismiss' or postpone_count >= 2 then coalesce(dismissed_at, instant) else dismissed_at end,
      updated_at = instant
      where user_id = uid;
    return true;
  end if;

  freq := (settings ->> 'review_invite_frequency_days')::int;
  if row.last_shown_day >= local_time::date - (freq - 1)
    or row.last_shown_at > instant - make_interval(hours => greatest(20, 24 * (freq - 1)))
  then return false; end if;
  if not public.platform_review_invite_due(uid) then return false; end if;

  if p_action = 'reserve' then
    if row.claim_until > instant then return row.claim_id = p_id; end if;
    update public.platform_review_invitations set claim_id = p_id, claim_until = instant + interval '45 seconds', claim_answered = false
      where user_id = uid;
  else
    if row.claim_until is null or row.claim_until <= instant or row.claim_id is distinct from p_id then return false; end if;
    update public.platform_review_invitations set last_shown_at = instant, last_shown_day = local_time::date, claim_until = null
      where user_id = uid;
  end if;
  return true;
end
$$;
revoke all on function public.platform_claim_review_invitation(text,uuid,text) from public, anon, service_role;
grant execute on function public.platform_claim_review_invitation(text,uuid,text) to authenticated;

-- A suspended account may still have an old browser push subscription.
create or replace function public.platform_push_eligible_users(p_users uuid[])
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(id), '{}'::uuid[]) from auth.users
    where id = any(p_users) and (banned_until is null or banned_until <= now());
$$;
revoke all on function public.platform_push_eligible_users(uuid[]) from public, anon, authenticated;
grant execute on function public.platform_push_eligible_users(uuid[]) to service_role;
