-- ════════════════════════════════════════════════════════════════
-- Sync safety checks
--
-- Proves, inside the database, that no save can replace an account's data
-- with an empty, stale or outdated copy, that a first snapshot is created at
-- most once and only when the server allows it, that recovery copies exist
-- and can be restored, and that none of it crosses accounts.
--
-- Runs in one transaction and rolls back. Success is one row:
-- "All sync safety checks passed". Run by `npm run test:db`.
-- ════════════════════════════════════════════════════════════════

begin;

-- P: populated, set up months ago.   N: signed up today, nothing saved.
-- O: signed up long ago, never saved. Q: another populated account.
insert into auth.users (id, email, created_at)
values
  ('5a000000-0000-4000-8000-00000000000a', 'safety-populated@example.invalid', now() - interval '160 days'),
  ('5b000000-0000-4000-8000-00000000000b', 'safety-new@example.invalid', now()),
  ('5c000000-0000-4000-8000-00000000000c', 'safety-old@example.invalid', now() - interval '90 days'),
  ('5d000000-0000-4000-8000-00000000000d', 'safety-other@example.invalid', now() - interval '30 days');

-- A month of history: 30 journal days, 30 life days, goals, habits, revisions.
create temporary table fixture as
select jsonb_build_object(
  'profile', jsonb_build_object('name', 'P', 'onboardedAt', '2026-06-12'),
  'journal', (select jsonb_agg(jsonb_build_object('date', to_char(date '2026-10-01' + i, 'YYYY-MM-DD'), 'totalHours', 6, 'reflection', 'private words ' || i)) from generate_series(0, 29) i),
  'lifeLog', (select jsonb_agg(jsonb_build_object('date', to_char(date '2026-10-01' + i, 'YYYY-MM-DD'), 'mood', 4)) from generate_series(0, 29) i),
  'goals', '[{"id":"g1","title":"Finish Polity"},{"id":"g2","title":"Ten mocks"},{"id":"g3","title":"Essay a week"}]'::jsonb,
  'habits', '[{"id":"study"},{"id":"news"},{"id":"revise"},{"id":"run"}]'::jsonb,
  'revisions', (select jsonb_agg(jsonb_build_object('id', 'r' || i)) from generate_series(1, 12) i),
  'plans', '[{"id":"wk1","level":"week"}]'::jsonb
) as data;
-- The empty template a fresh browser holds before anything loads.
create temporary table blank as
select '{"profile":{"name":""},"journal":[],"lifeLog":[],"goals":[],"habits":[{"id":"study"},{"id":"news"},{"id":"revise"}],"revisions":[],"plans":[]}'::jsonb as data;
grant select on fixture, blank to authenticated;

-- ── P's first snapshot: data from a device, so it may be created ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"5a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare r record;
begin
  select * into r from public.chronicle_init((select data from fixture), 17, 'laptop', 'auto');
  if r.status <> 'created' or r.version <> 1 then
    raise exception 'FAIL: P''s first snapshot should be created as version 1, got % %', r.status, r.version;
  end if;
  -- A second initialisation never replaces it.
  select * into r from public.chronicle_init((select data from blank), 17, 'new-browser', 'auto');
  if r.status <> 'exists' or r.version <> 1 then
    raise exception 'FAIL: initialising an account that has a snapshot should say exists, got %', r.status;
  end if;
  if (select jsonb_array_length(data -> 'journal') from public.chronicle_state) <> 30 then
    raise exception 'FAIL: a second initialisation changed P''s data';
  end if;
end $$;

-- ── Critical test E: an empty snapshot on top of the current version ──
do $$
declare r record;
begin
  select * into r from public.chronicle_save((select data from blank), 1, 17, 'wiped-browser');
  if r.status <> 'held' or r.hold_id is null then
    raise exception 'FAIL: an empty snapshot over a populated account should be held, got %', r.status;
  end if;
  if (r.detail -> 'lists' -> 'journal' ->> 0)::int <> 30 or (r.detail -> 'lists' -> 'journal' ->> 1)::int <> 0
     or (r.detail ->> 'profileReset')::boolean is not true then
    raise exception 'FAIL: the hold should describe what would be lost, got %', r.detail;
  end if;
  if (select version from public.chronicle_state) <> 1
     or (select jsonb_array_length(data -> 'journal') from public.chronicle_state) <> 30 then
    raise exception 'FAIL: a held save changed the snapshot';
  end if;
  -- The diagnostic trail has it, as counts only.
  if not exists (select 1 from public.chronicle_sync_events where event = 'save_held' and device = 'wiped-browser' and version = 1) then
    raise exception 'FAIL: the held save was not recorded';
  end if;
  if exists (select 1 from public.chronicle_sync_events where detail::text like '%private words%') then
    raise exception 'FAIL: a diagnostic event carried the student''s words';
  end if;

  -- The same through the previous app version's function: refused, unchanged.
  begin
    perform public.save_chronicle_state((select data from blank), 1);
    raise exception 'FAIL: the previous write path accepted an empty snapshot';
  exception when check_violation then null;
  end;
  if (select jsonb_array_length(data -> 'journal') from public.chronicle_state) <> 30 then
    raise exception 'FAIL: the previous write path changed the snapshot';
  end if;

  -- Wholesale loss of one big list is held too, even with the rest intact.
  select * into r from public.chronicle_save((select data from fixture) || '{"lifeLog":[]}'::jsonb, 1, 17, 'laptop');
  if r.status <> 'held' then raise exception 'FAIL: emptying 30 life days at once should be held, got %', r.status; end if;
end $$;

-- ── Ordinary editing is never held ─────────────────────────────────
do $$
declare r record; d jsonb := (select data from fixture);
begin
  -- Delete two journal days and a goal, add a habit: a normal save.
  d := jsonb_set(d, '{journal}', (d -> 'journal') - 0 - 0);
  d := jsonb_set(d, '{goals}', (d -> 'goals') - 2);
  d := jsonb_set(d, '{habits}', (d -> 'habits') || '[{"id":"read"}]'::jsonb);
  select * into r from public.chronicle_save(d, 1, 17, 'laptop');
  if r.status <> 'saved' or r.version <> 2 then
    raise exception 'FAIL: an ordinary save should go through as version 2, got % %', r.status, r.version;
  end if;
  if (select last_device from public.chronicle_state) <> 'laptop' or (select schema_version from public.chronicle_state) <> 17 then
    raise exception 'FAIL: the row should record the device and schema of its last save';
  end if;
  -- The first save of the day kept yesterday's data as a checkpoint.
  if (select count(*) from public.chronicle_state_history where reason = 'checkpoint' and version = 1) <> 1 then
    raise exception 'FAIL: the first save should keep a checkpoint of version 1';
  end if;
end $$;

-- ── Critical test F: a stale full snapshot from a device left behind ──
do $$
declare r record;
begin
  -- Device A loaded version 1; device B has since saved version 2 (above).
  select * into r from public.chronicle_save((select data from fixture) || '{"habits":[{"id":"only-a"}]}'::jsonb, 1, 17, 'device-a');
  if r.status <> 'conflict' or r.version <> 2 then
    raise exception 'FAIL: a save on an old version should be refused with the current one, got % %', r.status, r.version;
  end if;
  if (select data -> 'habits' -> 4 ->> 'id' from public.chronicle_state) is distinct from 'read' then
    raise exception 'FAIL: device B''s change did not survive device A''s stale save';
  end if;
  begin
    perform public.chronicle_save((select data from fixture), 0, 17, 'device-a');
    raise exception 'FAIL: a save with no base version was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ── An explicit, server-validated destructive change ───────────────
do $$
declare r record; hid uuid; d jsonb;
begin
  select data into d from public.chronicle_state;
  d := jsonb_set(d, '{journal}', '[]'::jsonb);
  select * into r from public.chronicle_save(d, 2, 17, 'laptop');
  if r.status <> 'held' then raise exception 'FAIL: clearing the journal should be held, got %', r.status; end if;
  hid := r.hold_id;

  -- A different payload under the same hold is not accepted.
  select * into r from public.chronicle_confirm_replace(hid, (select data from blank), 17, 'laptop');
  if r.status <> 'expired' then raise exception 'FAIL: a hold confirmed a payload it did not hold, got %', r.status; end if;
  -- An unknown hold is not accepted.
  select * into r from public.chronicle_confirm_replace(gen_random_uuid(), d, 17, 'laptop');
  if r.status <> 'expired' then raise exception 'FAIL: an unknown hold was accepted'; end if;

  select * into r from public.chronicle_confirm_replace(hid, d, 17, 'laptop');
  if r.status <> 'saved' or r.version <> 3 then
    raise exception 'FAIL: confirming the hold should save version 3, got % %', r.status, r.version;
  end if;
  if (select jsonb_array_length(data -> 'journal') from public.chronicle_state) <> 0 then
    raise exception 'FAIL: the confirmed change was not applied';
  end if;
  if (select count(*) from public.chronicle_state_history where reason = 'before_replace' and version = 2
        and jsonb_array_length(data -> 'journal') = 28) <> 1 then
    raise exception 'FAIL: the data before the confirmed change was not kept';
  end if;
  -- A hold can be used once.
  select * into r from public.chronicle_confirm_replace(hid, d, 17, 'laptop');
  if r.status <> 'expired' then raise exception 'FAIL: a hold was used twice'; end if;
end $$;

-- ── Critical test J: restore a recovery copy ───────────────────────
do $$
declare r record; hid bigint;
begin
  select id into hid from public.chronicle_state_history where reason = 'before_replace' order by id desc limit 1;
  -- Naming the wrong current version is refused.
  select * into r from public.chronicle_restore(hid, 2, 'laptop');
  if r.status <> 'conflict' or r.version <> 3 then raise exception 'FAIL: a restore on a stale version went through'; end if;

  select * into r from public.chronicle_restore(hid, 3, 'laptop');
  if r.status <> 'restored' or r.version <> 4 then
    raise exception 'FAIL: the restore should produce version 4, got % %', r.status, r.version;
  end if;
  if (select jsonb_array_length(data -> 'journal') from public.chronicle_state) <> 28 then
    raise exception 'FAIL: the restore did not bring the journal back';
  end if;
  if (select count(*) from public.chronicle_state_history where reason = 'before_restore' and version = 3) <> 1 then
    raise exception 'FAIL: the data replaced by the restore was not kept';
  end if;
end $$;

-- ── The schema guard: an older app version can't save over a newer one ──
do $$
declare r record; d jsonb;
begin
  select data into d from public.chronicle_state;
  select * into r from public.chronicle_save(d || '{"habits":[{"id":"study"},{"id":"news"},{"id":"revise"},{"id":"run"},{"id":"read"},{"id":"x"}]}'::jsonb, 4, 16, 'old-tab');
  if r.status <> 'outdated' or r.schema_version <> 17 then
    raise exception 'FAIL: a schema-16 client saved over schema 17, got %', r.status;
  end if;
  begin
    perform public.save_chronicle_state(d, 4);
    raise exception 'FAIL: the previous app version saved over a newer snapshot';
  exception when check_violation then null;
  end;
  if (select version from public.chronicle_state) <> 4 then raise exception 'FAIL: an outdated save changed the row'; end if;
end $$;

-- ── Device reports: named events only, never free text ─────────────
do $$
begin
  perform public.chronicle_report('hydrate_failed', 'phone', 4, '{"kind":"network"}'::jsonb);
  if not exists (select 1 from public.chronicle_sync_events where event = 'client:hydrate_failed') then
    raise exception 'FAIL: a device report was not recorded';
  end if;
  begin
    perform public.chronicle_report('my journal says hello', 'phone', 4, null);
    raise exception 'FAIL: an unknown event name was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ── Browsers cannot write recovery copies, holds or events directly ──
do $$
begin
  begin
    delete from public.chronicle_state_history;
    raise exception 'FAIL: a browser could delete recovery copies';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.chronicle_state_history (user_id, version, reason, data)
    values ('5a000000-0000-4000-8000-00000000000a', 99, 'checkpoint', '{}');
    raise exception 'FAIL: a browser could write a recovery copy';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.chronicle_holds;
    raise exception 'FAIL: a browser could read holds';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.chronicle_sync_events;
    raise exception 'FAIL: a browser could delete diagnostic events';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.chronicle_accounts;
    raise exception 'FAIL: a browser could delete the initialisation ledger';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── Initialisation rules ───────────────────────────────────────────
-- N: brand new, empty template: allowed.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"5b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare r record;
begin
  select * into r from public.chronicle_init((select data from blank), 17, 'phone', 'auto');
  if r.status <> 'created' or r.detail ->> 'reason' <> 'new_account' then
    raise exception 'FAIL: a new account''s first snapshot should be created, got % %', r.status, r.detail;
  end if;
end $$;

-- O: an old account with no snapshot, offering only an empty template: recovery.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"5c000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
declare r record;
begin
  select * into r from public.chronicle_init((select data from blank), 17, 'new-browser', 'auto');
  if r.status <> 'needs_recovery' or r.detail ->> 'reason' <> 'unrecognised' then
    raise exception 'FAIL: an old account with no snapshot should go to recovery, got % %', r.status, r.detail;
  end if;
  -- The previous app version's first save is refused the same way.
  select * into r from public.save_chronicle_state((select data from blank), 0);
  if r.saved then raise exception 'FAIL: the previous write path created an empty snapshot for an old account'; end if;
  if exists (select 1 from public.chronicle_state) then
    raise exception 'FAIL: a refused initialisation created a row';
  end if;
  -- Choosing to start fresh, explicitly, is allowed.
  select * into r from public.chronicle_init((select data from blank), 17, 'new-browser', 'fresh');
  if r.status <> 'created' or r.detail ->> 'reason' <> 'fresh_confirmed' then
    raise exception 'FAIL: an explicit fresh start should be created, got %', r.status;
  end if;
end $$;

-- P's row disappears (only a privileged role can do that): recovery, never a new account.
reset role;
delete from public.chronicle_state where user_id = '5a000000-0000-4000-8000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"5a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare r record; hid bigint;
begin
  select * into r from public.chronicle_save((select data from blank), 4, 17, 'laptop');
  if r.status <> 'missing' then raise exception 'FAIL: a save with no row should say missing, got %', r.status; end if;
  select * into r from public.chronicle_init((select data from blank), 17, 'new-browser', 'auto');
  if r.status <> 'needs_recovery' or r.detail ->> 'reason' <> 'missing' then
    raise exception 'FAIL: an initialised account with no row should go to recovery, got % %', r.status, r.detail;
  end if;
  if exists (select 1 from public.chronicle_state) then
    raise exception 'FAIL: recovery created a row';
  end if;
  -- The recovery copies are still there, and one can become the row again.
  select id into hid from public.chronicle_state_history where reason = 'before_restore' order by id desc limit 1;
  select * into r from public.chronicle_restore(hid, null, 'laptop');
  if r.status <> 'restored' then raise exception 'FAIL: restoring into a missing row failed: %', r.status; end if;
  if (select jsonb_array_length(data -> 'journal') from public.chronicle_state) is null then
    raise exception 'FAIL: the restored row has no data';
  end if;
end $$;

-- ── Isolation: Q sees and touches nothing of P's ───────────────────
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"5d000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
do $$
declare r record; hid bigint;
begin
  if exists (select 1 from public.chronicle_state_history) then
    raise exception 'FAIL: Q can read another account''s recovery copies';
  end if;
  if exists (select 1 from public.chronicle_sync_events) then
    raise exception 'FAIL: Q can read another account''s diagnostic events';
  end if;
  if exists (select 1 from public.chronicle_accounts) then
    raise exception 'FAIL: Q can read another account''s ledger entry';
  end if;
end $$;
reset role;
create temporary table p_copy as
  select id from public.chronicle_state_history where user_id = '5a000000-0000-4000-8000-00000000000a' order by id desc limit 1;
grant select on p_copy to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"5d000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
do $$
declare r record;
begin
  select * into r from public.chronicle_restore((select id from p_copy), null, 'q-laptop');
  if r.status <> 'not_found' then raise exception 'FAIL: Q restored P''s recovery copy'; end if;
  if exists (select 1 from public.chronicle_state) then
    raise exception 'FAIL: Q''s failed restore created a row';
  end if;
end $$;

-- ── Retention: recovery copies stay bounded ────────────────────────
reset role;
do $$
declare i int;
begin
  for i in 1..8 loop
    perform public.chronicle_keep_copy('5d000000-0000-4000-8000-00000000000d', i, jsonb_build_object('n', i), 'before_replace');
  end loop;
  if (select count(*) from public.chronicle_state_history where user_id = '5d000000-0000-4000-8000-00000000000d') <> public.chronicle_retention('protective') then
    raise exception 'FAIL: protective copies are not bounded';
  end if;
  if (select min(version) from public.chronicle_state_history where user_id = '5d000000-0000-4000-8000-00000000000d') <> 4 then
    raise exception 'FAIL: retention should keep the newest copies';
  end if;
  -- An identical copy is not stored twice.
  perform public.chronicle_keep_copy('5d000000-0000-4000-8000-00000000000d', 9, jsonb_build_object('n', 8), 'before_replace');
  if (select max(version) from public.chronicle_state_history where user_id = '5d000000-0000-4000-8000-00000000000d') <> 8 then
    raise exception 'FAIL: an identical copy was stored again';
  end if;
  -- Deleting the account removes its copies, events and ledger entry.
  delete from auth.users where id = '5a000000-0000-4000-8000-00000000000a';
  if exists (select 1 from public.chronicle_state_history where user_id = '5a000000-0000-4000-8000-00000000000a')
     or exists (select 1 from public.chronicle_sync_events where user_id = '5a000000-0000-4000-8000-00000000000a')
     or exists (select 1 from public.chronicle_accounts where user_id = '5a000000-0000-4000-8000-00000000000a') then
    raise exception 'FAIL: deleting an account left its recovery data behind';
  end if;
end $$;

rollback;

select 'All sync safety checks passed' as result;
