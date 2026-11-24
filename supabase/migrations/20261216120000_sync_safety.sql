-- ════════════════════════════════════════════════════════════════
-- Sync safety: no empty, stale or unverified copy can replace an account
--
-- Run after every earlier migration, in the Supabase SQL Editor, BEFORE the
-- app version that calls these functions is deployed. Additive and safe to
-- re-run: no row is rewritten, no policy is loosened, and devices still on
-- the previous app version keep working through `save_chronicle_state`
-- (now guarded the same way) until they reload.
--
-- What it adds
--   1. `chronicle_accounts`, a one-row-per-account ledger of "this account's
--      cloud copy has been created". Only `chronicle_init` creates a first
--      snapshot, and it refuses when the ledger says one existed before (the
--      row is missing: recovery, never a silent new account), or when an
--      older account with no ledger entry offers only an empty template.
--   2. A destructive-change guard on every save: a snapshot that would remove
--      a large share of the account's records, empty several lists at once or
--      undo first-run setup is not saved. The server keeps a short-lived hold
--      describing it, and only `chronicle_confirm_replace` with that hold's id
--      and the identical payload can apply it, after a copy of the current
--      data is kept.
--   3. `chronicle_state_history`: bounded recovery copies (a daily
--      checkpoint, plus a copy before every confirmed replacement or
--      restore), readable only by their owner, writable only here.
--      `chronicle_restore` puts one back, keeping the current data first.
--   4. A schema guard: a device on an older app version can no longer save
--      over a snapshot written by a newer one.
--   5. `chronicle_sync_events`: a small per-account diagnostic trail (event
--      names, versions, counts and device labels; never any of the words).
-- ════════════════════════════════════════════════════════════════

-- 1. What the row records about its last writer.
alter table public.chronicle_state
  add column if not exists schema_version integer not null default 0;
alter table public.chronicle_state
  add column if not exists last_device text;

-- ── Retention, in one place ──────────────────────────────────────
-- Edit these numbers to change how much is kept per account.
create or replace function public.chronicle_retention(p_kind text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'checkpoint' then 5   -- daily copies of the data as it was
    when 'protective' then 5   -- copies kept before a replacement or restore
    when 'events'     then 100 -- diagnostic events
    else 0
  end;
$$;

-- 2. The initialisation ledger.
create table if not exists public.chronicle_accounts (
  user_id        uuid        primary key references auth.users (id) on delete cascade,
  initialized_at timestamptz not null default now(),
  init_reason    text        not null default 'existing',
  init_device    text
);
alter table public.chronicle_accounts enable row level security;
drop policy if exists "chronicle_accounts_select_own" on public.chronicle_accounts;
create policy "chronicle_accounts_select_own"
  on public.chronicle_accounts for select
  using (auth.uid() = user_id);
revoke all on table public.chronicle_accounts from anon, authenticated;
grant select on table public.chronicle_accounts to authenticated;

-- Every account that already has a snapshot has, by definition, been set up.
insert into public.chronicle_accounts (user_id, initialized_at, init_reason)
select s.user_id, s.updated_at, 'existing'
  from public.chronicle_state s
on conflict (user_id) do nothing;

-- Whatever creates a row, the ledger hears of it.
create or replace function public.chronicle_state_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chronicle_accounts (user_id, init_reason)
  values (new.user_id, 'row')
  on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists chronicle_state_ledger on public.chronicle_state;
create trigger chronicle_state_ledger
  after insert on public.chronicle_state
  for each row execute function public.chronicle_state_ledger();
revoke all on function public.chronicle_state_ledger() from public, anon, authenticated;

-- 3. Recovery copies.
create table if not exists public.chronicle_state_history (
  id         bigint      generated always as identity primary key,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  version    bigint      not null,
  reason     text        not null check (reason in ('checkpoint', 'before_replace', 'before_restore')),
  data       jsonb       not null,
  counts     jsonb       not null default '{}'::jsonb,
  bytes      integer     not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists chronicle_state_history_user_idx
  on public.chronicle_state_history (user_id, id desc);
alter table public.chronicle_state_history enable row level security;
drop policy if exists "chronicle_history_select_own" on public.chronicle_state_history;
create policy "chronicle_history_select_own"
  on public.chronicle_state_history for select
  using (auth.uid() = user_id);
revoke all on table public.chronicle_state_history from anon, authenticated;
grant select on table public.chronicle_state_history to authenticated;

-- Holds: a save the guard stopped, waiting for an explicit decision. Reached
-- only through the functions below; no browser role can see or change them.
create table if not exists public.chronicle_holds (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  base_version bigint      not null,
  payload_md5  text        not null,
  summary      jsonb       not null,
  device       text,
  created_at   timestamptz not null default now()
);
create index if not exists chronicle_holds_user_idx on public.chronicle_holds (user_id);
alter table public.chronicle_holds enable row level security;
revoke all on table public.chronicle_holds from anon, authenticated;

-- 5. Diagnostics: metadata only.
create table if not exists public.chronicle_sync_events (
  id         bigint      generated always as identity primary key,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  event      text        not null,
  device     text,
  version    bigint,
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index if not exists chronicle_sync_events_user_idx
  on public.chronicle_sync_events (user_id, id desc);
alter table public.chronicle_sync_events enable row level security;
drop policy if exists "chronicle_events_select_own" on public.chronicle_sync_events;
create policy "chronicle_events_select_own"
  on public.chronicle_sync_events for select
  using (auth.uid() = user_id);
revoke all on table public.chronicle_sync_events from anon, authenticated;
grant select on table public.chronicle_sync_events to authenticated;

-- ── Helpers ──────────────────────────────────────────────────────

-- How many records each personal list holds, and how many syllabus topics
-- have been touched. Counts only: no content is read out.
create or replace function public.chronicle_counts(p_data jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(
           k,
           case when jsonb_typeof(p_data -> k) = 'array' then jsonb_array_length(p_data -> k) else 0 end
         ), '{}'::jsonb)
         || jsonb_build_object('topicsTouched', (
              select count(*)
                from jsonb_array_elements(
                       case when jsonb_typeof(p_data -> 'subjects') = 'array' then p_data -> 'subjects' else '[]'::jsonb end
                     ) sub,
                     jsonb_array_elements(
                       case when jsonb_typeof(sub -> 'topics') = 'array' then sub -> 'topics' else '[]'::jsonb end
                     ) t
               where case
                       when jsonb_typeof(t) <> 'object' then false
                       when coalesce(t ->> 'status', 'untouched') <> 'untouched' then true
                       when jsonb_typeof(t -> 'revisionCount') = 'number' then (t ->> 'revisionCount')::numeric > 0
                       else false
                     end
            ))
    from unnest(array[
      'journal', 'lifeLog', 'goals', 'habits', 'reflections', 'revisions', 'plans',
      'milestones', 'mocks', 'mistakes', 'currentAffairs', 'reviews', 'sleep',
      'exercise', 'accomplished'
    ]) as k;
$$;

-- An untouched template: setup never finished and nothing personal recorded
-- (the template's suggested habits don't count).
create or replace function public.chronicle_is_blank(p_data jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select nullif(p_data #>> '{profile,onboardedAt}', '') is null
     and not exists (
       select 1
         from jsonb_each_text(public.chronicle_counts(p_data) - 'habits') c
        where c.value::numeric > 0
     );
$$;

-- Whether replacing `p_old` with `p_new` would destroy a large share of the
-- account. Null when it looks like ordinary editing; otherwise what would be
-- lost, list by list, as counts.
create or replace function public.chronicle_destructive_summary(p_old jsonb, p_new jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  oc jsonb := public.chronicle_counts(p_old);
  nc jsonb := public.chronicle_counts(p_new);
  k text;
  o integer;
  n integer;
  before_total integer := 0;
  removed integer := 0;
  emptied integer := 0;
  big_drop boolean := false;
  lists jsonb := '{}'::jsonb;
  reset boolean := nullif(p_old #>> '{profile,onboardedAt}', '') is not null
               and nullif(p_new #>> '{profile,onboardedAt}', '') is null;
begin
  for k in select jsonb_object_keys(oc) loop
    o := coalesce((oc ->> k)::integer, 0);
    n := coalesce((nc ->> k)::integer, 0);
    before_total := before_total + o;
    if n < o then
      removed := removed + (o - n);
      lists := lists || jsonb_build_object(k, jsonb_build_array(o, n));
      if o >= 3 and n = 0 then emptied := emptied + 1; end if;
      if o >= 10 and n * 2 <= o then big_drop := true; end if;
    end if;
  end loop;

  if reset
     or (removed >= 10 and removed * 2 >= before_total)
     or emptied >= 2
     or big_drop then
    return jsonb_build_object(
      'removed', removed,
      'before', before_total,
      'lists', lists,
      'profileReset', reset
    );
  end if;
  return null;
end;
$$;

-- Keys older app versions don't know: a save without them keeps the stored ones.
create or replace function public.chronicle_keep_unknown(p_current jsonb, p_incoming jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select p_incoming
         || case when not (p_incoming ? 'plans') and (p_current ? 'plans')
                 then jsonb_build_object('plans', p_current -> 'plans') else '{}'::jsonb end
         || case when not (p_incoming ? 'coach') and (p_current ? 'coach')
                 then jsonb_build_object('coach', p_current -> 'coach') else '{}'::jsonb end;
$$;

create or replace function public.chronicle_log(
  p_user uuid, p_event text, p_device text, p_version bigint, p_detail jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff bigint;
begin
  insert into public.chronicle_sync_events (user_id, event, device, version, detail)
  values (p_user, left(p_event, 48), left(nullif(p_device, ''), 96), p_version, p_detail);
  select e.id into cutoff
    from public.chronicle_sync_events e
   where e.user_id = p_user
   order by e.id desc
  offset public.chronicle_retention('events') limit 1;
  if cutoff is not null then
    delete from public.chronicle_sync_events e where e.user_id = p_user and e.id <= cutoff;
  end if;
end;
$$;

-- Keeps a recovery copy. Checkpoints are at most one per 20 hours; a copy
-- identical to the newest of its kind is not stored twice; each kind keeps
-- only its newest `chronicle_retention` copies.
create or replace function public.chronicle_keep_copy(
  p_user uuid, p_version bigint, p_data jsonb, p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  protective boolean := p_reason <> 'checkpoint';
  last_md5 text;
  cutoff bigint;
begin
  if p_data is null then return false; end if;
  if not protective and exists (
    select 1 from public.chronicle_state_history h
     where h.user_id = p_user and h.reason = 'checkpoint'
       and h.created_at > now() - interval '20 hours'
  ) then
    return false;
  end if;

  select md5(h.data::text) into last_md5
    from public.chronicle_state_history h
   where h.user_id = p_user and ((h.reason <> 'checkpoint') = protective)
   order by h.id desc limit 1;
  if last_md5 = md5(p_data::text) then return false; end if;

  insert into public.chronicle_state_history (user_id, version, reason, data, counts, bytes)
  values (p_user, p_version, p_reason, p_data, public.chronicle_counts(p_data), octet_length(p_data::text));

  select h.id into cutoff
    from public.chronicle_state_history h
   where h.user_id = p_user and ((h.reason <> 'checkpoint') = protective)
   order by h.id desc
  offset public.chronicle_retention(case when protective then 'protective' else 'checkpoint' end) limit 1;
  if cutoff is not null then
    delete from public.chronicle_state_history h
     where h.user_id = p_user and ((h.reason <> 'checkpoint') = protective) and h.id <= cutoff;
  end if;
  return true;
end;
$$;

-- ── The write paths ──────────────────────────────────────────────

-- Every save from the app. Compare-and-swap on `version`, under a row lock.
--   saved     the snapshot is stored; `version` is the new one
--   conflict  another device saved first; pull, merge, save on top of `version`
--   missing   there is no row to save over (never an implicit insert)
--   held      the guard stopped it; `hold_id` and `detail` say what it would remove
--   outdated  a newer app version wrote this account; reload before saving
create or replace function public.chronicle_save(
  p_data jsonb,
  p_base_version bigint,
  p_schema integer default 0,
  p_device text default null
)
returns table (
  status text, version bigint, updated_at timestamptz,
  schema_version integer, hold_id uuid, detail jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := auth.uid();
  dev text := left(nullif(p_device, ''), 96);
  cur public.chronicle_state%rowtype;
  next_data jsonb;
  summary jsonb;
  hid uuid;
  new_version bigint;
  new_updated timestamptz;
  new_schema integer;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'snapshot must be a JSON object' using errcode = '22023';
  end if;
  if coalesce(p_base_version, 0) <= 0 then
    raise exception 'a save needs the version it was based on; first snapshots go through chronicle_init'
      using errcode = '22023';
  end if;

  select * into cur from public.chronicle_state s where s.user_id = caller for update;
  if not found then
    perform public.chronicle_log(caller, 'save_missing_row', dev, p_base_version, null);
    return query select 'missing'::text, 0::bigint, null::timestamptz, 0, null::uuid, null::jsonb;
    return;
  end if;

  if coalesce(p_schema, 0) < cur.schema_version then
    perform public.chronicle_log(caller, 'save_outdated_client', dev, cur.version,
      jsonb_build_object('client', coalesce(p_schema, 0), 'cloud', cur.schema_version));
    return query select 'outdated'::text, cur.version, cur.updated_at, cur.schema_version, null::uuid, null::jsonb;
    return;
  end if;

  if cur.version <> p_base_version then
    return query select 'conflict'::text, cur.version, cur.updated_at, cur.schema_version, null::uuid, null::jsonb;
    return;
  end if;

  next_data := public.chronicle_keep_unknown(cur.data, p_data);
  summary := public.chronicle_destructive_summary(cur.data, next_data);
  if summary is not null then
    delete from public.chronicle_holds h where h.user_id = caller;
    insert into public.chronicle_holds (user_id, base_version, payload_md5, summary, device)
    values (caller, cur.version, md5(p_data::text), summary, dev)
    returning id into hid;
    perform public.chronicle_log(caller, 'save_held', dev, cur.version, summary);
    return query select 'held'::text, cur.version, cur.updated_at, cur.schema_version, hid, summary;
    return;
  end if;

  perform public.chronicle_keep_copy(caller, cur.version, cur.data, 'checkpoint');

  update public.chronicle_state as s
     set data = next_data,
         schema_version = greatest(s.schema_version, coalesce(p_schema, 0)),
         last_device = dev
   where s.user_id = caller
  returning s.version, s.updated_at, s.schema_version into new_version, new_updated, new_schema;

  return query select 'saved'::text, new_version, new_updated, new_schema, null::uuid, null::jsonb;
end;
$$;

-- Applies a save the guard held, once the student has confirmed it. Needs the
-- hold's id and exactly the payload that was held, against the same version,
-- within 30 minutes; keeps a copy of the current data first.
create or replace function public.chronicle_confirm_replace(
  p_hold_id uuid,
  p_data jsonb,
  p_schema integer default 0,
  p_device text default null
)
returns table (
  status text, version bigint, updated_at timestamptz,
  schema_version integer, hold_id uuid, detail jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := auth.uid();
  dev text := left(nullif(p_device, ''), 96);
  h public.chronicle_holds%rowtype;
  cur public.chronicle_state%rowtype;
  new_version bigint;
  new_updated timestamptz;
  new_schema integer;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'snapshot must be a JSON object' using errcode = '22023';
  end if;

  select * into h from public.chronicle_holds x where x.id = p_hold_id and x.user_id = caller;
  if not found or h.created_at < now() - interval '30 minutes' or h.payload_md5 <> md5(p_data::text) then
    return query select 'expired'::text, null::bigint, null::timestamptz, null::integer, null::uuid, null::jsonb;
    return;
  end if;

  select * into cur from public.chronicle_state s where s.user_id = caller for update;
  if not found then
    delete from public.chronicle_holds x where x.id = h.id;
    return query select 'missing'::text, 0::bigint, null::timestamptz, 0, null::uuid, null::jsonb;
    return;
  end if;
  if coalesce(p_schema, 0) < cur.schema_version then
    return query select 'outdated'::text, cur.version, cur.updated_at, cur.schema_version, null::uuid, null::jsonb;
    return;
  end if;
  if cur.version <> h.base_version then
    delete from public.chronicle_holds x where x.id = h.id;
    return query select 'conflict'::text, cur.version, cur.updated_at, cur.schema_version, null::uuid, null::jsonb;
    return;
  end if;

  perform public.chronicle_keep_copy(caller, cur.version, cur.data, 'before_replace');

  update public.chronicle_state as s
     set data = public.chronicle_keep_unknown(s.data, p_data),
         schema_version = greatest(s.schema_version, coalesce(p_schema, 0)),
         last_device = dev
   where s.user_id = caller
  returning s.version, s.updated_at, s.schema_version into new_version, new_updated, new_schema;

  delete from public.chronicle_holds x where x.id = h.id;
  perform public.chronicle_log(caller, 'replace_confirmed', dev, new_version, h.summary);
  return query select 'saved'::text, new_version, new_updated, new_schema, null::uuid, null::jsonb;
end;
$$;

-- Creates an account's first cloud snapshot, at most once in its life.
--   created          stored as version 1
--   exists           there is already a row; pull it instead
--   needs_recovery   refused; `detail.reason` is
--                      'missing'       the ledger says a snapshot existed and the row is gone
--                      'unrecognised'  an older account with no snapshot offered only an empty template
-- `p_intent`: 'auto' (the app's own first contact), 'fresh' (the student chose
-- to start empty on the recovery screen), 'device' (upload this device's copy
-- into a missing row). The server, not the client, decides what is allowed.
create or replace function public.chronicle_init(
  p_data jsonb,
  p_schema integer default 0,
  p_device text default null,
  p_intent text default 'auto'
)
returns table (status text, version bigint, updated_at timestamptz, detail jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := auth.uid();
  dev text := left(nullif(p_device, ''), 96);
  intent text := coalesce(p_intent, 'auto');
  cur public.chronicle_state%rowtype;
  ledger boolean;
  blank boolean;
  created timestamptz;
  why text;
  new_version bigint;
  new_updated timestamptz;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'snapshot must be a JSON object' using errcode = '22023';
  end if;
  if intent not in ('auto', 'fresh', 'device') then
    raise exception 'unknown intent' using errcode = '22023';
  end if;

  select * into cur from public.chronicle_state s where s.user_id = caller;
  if found then
    return query select 'exists'::text, cur.version, cur.updated_at, null::jsonb;
    return;
  end if;

  ledger := exists (select 1 from public.chronicle_accounts a where a.user_id = caller);
  blank := public.chronicle_is_blank(p_data);
  select u.created_at into created from auth.users u where u.id = caller;

  if ledger then
    if intent = 'fresh' then why := 'fresh_after_missing';
    elsif intent = 'device' and not blank then why := 'device_after_missing';
    else
      perform public.chronicle_log(caller, 'init_refused', dev, null, jsonb_build_object('reason', 'missing', 'intent', intent));
      return query select 'needs_recovery'::text, 0::bigint, null::timestamptz, jsonb_build_object('reason', 'missing');
      return;
    end if;
  else
    if intent = 'fresh' then why := 'fresh_confirmed';
    elsif not blank then why := 'device_data';
    elsif created is not null and created > now() - interval '7 days' then why := 'new_account';
    else
      perform public.chronicle_log(caller, 'init_refused', dev, null, jsonb_build_object('reason', 'unrecognised', 'intent', intent));
      return query select 'needs_recovery'::text, 0::bigint, null::timestamptz, jsonb_build_object('reason', 'unrecognised');
      return;
    end if;
  end if;

  insert into public.chronicle_state as s (user_id, data, schema_version, last_device)
  values (caller, p_data, greatest(coalesce(p_schema, 0), 0), dev)
  on conflict (user_id) do nothing
  returning s.version, s.updated_at into new_version, new_updated;

  if new_version is null then
    select * into cur from public.chronicle_state s where s.user_id = caller;
    return query select 'exists'::text, cur.version, cur.updated_at, null::jsonb;
    return;
  end if;

  update public.chronicle_accounts a
     set init_reason = why, init_device = dev
   where a.user_id = caller and a.init_reason = 'row';
  perform public.chronicle_log(caller, 'init_created', dev, new_version,
    jsonb_build_object('reason', why) || jsonb_build_object('counts', public.chronicle_counts(p_data)));
  return query select 'created'::text, new_version, new_updated, jsonb_build_object('reason', why);
end;
$$;

-- Puts a recovery copy back. The current data is kept as a copy first, and the
-- caller must name the version it saw, so nothing changed meanwhile is lost
-- unseen. With no row at all (recovery), the copy becomes the row.
create or replace function public.chronicle_restore(
  p_history_id bigint,
  p_expected_version bigint,
  p_device text default null
)
returns table (status text, version bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := auth.uid();
  dev text := left(nullif(p_device, ''), 96);
  snap public.chronicle_state_history%rowtype;
  cur public.chronicle_state%rowtype;
  new_version bigint;
  new_updated timestamptz;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into snap from public.chronicle_state_history h where h.id = p_history_id and h.user_id = caller;
  if not found then
    return query select 'not_found'::text, null::bigint, null::timestamptz;
    return;
  end if;

  select * into cur from public.chronicle_state s where s.user_id = caller for update;
  if found then
    if cur.version is distinct from p_expected_version then
      return query select 'conflict'::text, cur.version, cur.updated_at;
      return;
    end if;
    perform public.chronicle_keep_copy(caller, cur.version, cur.data, 'before_restore');
    update public.chronicle_state as s
       set data = snap.data, last_device = dev
     where s.user_id = caller
    returning s.version, s.updated_at into new_version, new_updated;
  else
    insert into public.chronicle_state as s (user_id, data, last_device)
    values (caller, snap.data, dev)
    returning s.version, s.updated_at into new_version, new_updated;
  end if;

  perform public.chronicle_log(caller, 'restored', dev, new_version,
    jsonb_build_object('fromVersion', snap.version, 'fromReason', snap.reason));
  return query select 'restored'::text, new_version, new_updated;
end;
$$;

-- What the app reports from the device side (a failed first download, a local
-- copy that didn't match its synced copy...). Named events only, small
-- details only, at most 60 an hour.
create or replace function public.chronicle_report(
  p_event text,
  p_device text default null,
  p_version bigint default null,
  p_detail jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  detail jsonb := p_detail;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_event not in (
    'hydrate_failed', 'stamp_mismatch', 'local_quarantined', 'recovery_shown',
    'conflicts_recorded', 'outdated_client', 'hold_kept_cloud', 'offline_session'
  ) then
    raise exception 'unknown event' using errcode = '22023';
  end if;
  if detail is not null and (jsonb_typeof(detail) <> 'object' or octet_length(detail::text) > 1024) then
    detail := null;
  end if;
  if (select count(*) from public.chronicle_sync_events e
       where e.user_id = caller and e.created_at > now() - interval '1 hour') >= 60 then
    return;
  end if;
  perform public.chronicle_log(caller, 'client:' || p_event, p_device, p_version, detail);
end;
$$;

-- The previous app version's write path, kept so devices still running it
-- keep working until they reload, and guarded exactly like the new one. A
-- held or outdated save is refused with an error that version shows as
-- "Sync paused" and retries slowly; its changes stay on that device.
create or replace function public.save_chronicle_state(
  p_data jsonb,
  p_base_version bigint
)
returns table (saved boolean, version bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r record;
begin
  if coalesce(p_base_version, 0) <= 0 then
    select * into r from public.chronicle_init(p_data, 0, 'previous-app-version', 'auto');
    return query select r.status = 'created', coalesce(r.version, 0::bigint), r.updated_at;
    return;
  end if;
  select * into r from public.chronicle_save(p_data, p_base_version, 0, 'previous-app-version');
  if r.status = 'held' then
    raise exception 'This save would remove a large part of your data, so it was not applied. Reload the app to review it.'
      using errcode = '23514';
  end if;
  if r.status = 'outdated' then
    raise exception 'A newer version of the app saved your data. Reload to update before saving.'
      using errcode = '23514';
  end if;
  return query select r.status = 'saved', coalesce(r.version, 0::bigint), r.updated_at;
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────
revoke all on function public.chronicle_retention(text) from public, anon, authenticated;
revoke all on function public.chronicle_counts(jsonb) from public, anon, authenticated;
revoke all on function public.chronicle_is_blank(jsonb) from public, anon, authenticated;
revoke all on function public.chronicle_destructive_summary(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.chronicle_keep_unknown(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.chronicle_log(uuid, text, text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.chronicle_keep_copy(uuid, bigint, jsonb, text) from public, anon, authenticated;

revoke all on function public.chronicle_save(jsonb, bigint, integer, text) from public, anon;
revoke all on function public.chronicle_confirm_replace(uuid, jsonb, integer, text) from public, anon;
revoke all on function public.chronicle_init(jsonb, integer, text, text) from public, anon;
revoke all on function public.chronicle_restore(bigint, bigint, text) from public, anon;
revoke all on function public.chronicle_report(text, text, bigint, jsonb) from public, anon;
revoke all on function public.save_chronicle_state(jsonb, bigint) from public, anon;
grant execute on function public.chronicle_save(jsonb, bigint, integer, text) to authenticated;
grant execute on function public.chronicle_confirm_replace(uuid, jsonb, integer, text) to authenticated;
grant execute on function public.chronicle_init(jsonb, integer, text, text) to authenticated;
grant execute on function public.chronicle_restore(bigint, bigint, text) to authenticated;
grant execute on function public.chronicle_report(text, text, bigint, jsonb) to authenticated;
grant execute on function public.save_chronicle_state(jsonb, bigint) to authenticated;
