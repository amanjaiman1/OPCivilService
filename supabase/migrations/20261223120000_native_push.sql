-- Native installations use a separate provider registration. Web Push records
-- and their signed bedtime actions keep their existing ownership and lifecycle.
create table if not exists public.chronicle_native_push (
  device_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  timezone text not null,
  updated_at timestamptz not null default now()
);
create index if not exists chronicle_native_push_user on public.chronicle_native_push(user_id);
create index if not exists chronicle_native_push_age on public.chronicle_native_push(updated_at);
alter table public.chronicle_native_push enable row level security;
revoke all on public.chronicle_native_push from public, anon, authenticated;
grant select, delete on public.chronicle_native_push to service_role;

create or replace function public.chronicle_register_native_push(
  p_device uuid, p_token text, p_platform text, p_timezone text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  changed int := 0;
begin
  if uid is null or p_device is null or p_token is null
    or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{12,120}\]$'
    or p_platform is null or p_platform not in ('android','ios')
    or p_timezone is null or length(p_timezone) > 100
    or not exists (select 1 from pg_timezone_names where name = p_timezone)
  then return false; end if;

  -- Serializes the bound on devices for one account and excludes bans.
  perform 1 from auth.users where id = uid and (banned_until is null or banned_until <= now()) for update;
  if not found then return false; end if;
  if not exists (select 1 from public.chronicle_native_push where device_id = p_device and user_id = uid)
    and (select count(*) from public.chronicle_native_push where user_id = uid) >= 10
  then return false; end if;

  begin
    insert into public.chronicle_native_push as d (device_id, user_id, token, platform, timezone)
    values (p_device, uid, p_token, p_platform, p_timezone)
    on conflict(device_id) do update set token=excluded.token, platform=excluded.platform,
      timezone=excluded.timezone, updated_at=now()
      where d.user_id=uid;
    get diagnostics changed = row_count;
  exception when unique_violation then
    -- A device must explicitly revoke the previous registration before moving a token.
    return false;
  end;
  return changed = 1;
end
$$;
revoke all on function public.chronicle_register_native_push(uuid,text,text,text) from public, anon, service_role;
grant execute on function public.chronicle_register_native_push(uuid,text,text,text) to authenticated;

create or replace function public.chronicle_revoke_native_push(p_device uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or p_device is null then return false; end if;
  delete from public.chronicle_native_push where user_id=uid and device_id=p_device;
  return true;
end
$$;
revoke all on function public.chronicle_revoke_native_push(uuid) from public, anon, service_role;
grant execute on function public.chronicle_revoke_native_push(uuid) to authenticated;

-- Provider receipts are private and short-lived. An old receipt can retire
-- only the exact recipient token that was used for that message.
create table if not exists public.chronicle_native_push_receipts (
  id text primary key,
  device_id uuid not null references public.chronicle_native_push(device_id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now()
);
create index if not exists chronicle_native_push_receipt_age on public.chronicle_native_push_receipts(created_at);
alter table public.chronicle_native_push_receipts enable row level security;
revoke all on public.chronicle_native_push_receipts from public, anon, authenticated;
grant select, insert, delete, update on public.chronicle_native_push_receipts to service_role;
