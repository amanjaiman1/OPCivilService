begin;
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000031', 'sleep-fixture@example.test');
insert into public.chronicle_push_subscriptions (id, user_id, endpoint, key_p256dh, key_auth) values
  ('00000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000031', 'https://example.test/one', 'fixture', 'fixture'),
  ('00000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000031', 'https://example.test/two', 'fixture', 'fixture'),
  ('00000000-0000-4000-8000-000000000034', '00000000-0000-4000-8000-000000000031', 'https://example.test/three', 'fixture', 'fixture');
insert into public.chronicle_state (user_id, data) values
  ('00000000-0000-4000-8000-000000000031', '{"notify":{"deliver":true},"profile":{"name":"Fixture"},"lifeLog":[],"journal":[]}');

do $$
declare
  owner uuid := '00000000-0000-4000-8000-000000000031';
  zone text;
  local_time timestamp;
  night date;
  result text;
  snapshot jsonb;
  current_version bigint;
begin
  if has_function_privilege('authenticated', 'public.chronicle_record_push_bedtime(text)', 'execute')
    or has_function_privilege('anon', 'public.chronicle_record_push_bedtime(text)', 'execute') then
    raise exception 'The bedtime RPC can be called by a browser role';
  end if;

  -- Use an IANA zone currently in its work window, independent of test time.
  select name into zone from pg_timezone_names
    where (now() at time zone name)::time >= time '22:00'
    and (now() at time zone name)::time < time '23:00'
    order by name limit 1;
  local_time := clock_timestamp() at time zone zone;
  night := local_time::date + 1;
  update public.chronicle_state set data = data || jsonb_build_object(
    'lifeLog', jsonb_build_array(jsonb_build_object('id', 'life-' || night, 'date', night, 'waterLiters', 0)),
    'journal', jsonb_build_array(jsonb_build_object('date', night, 'totalHours', 3))
  ) where user_id = owner;
  select version into current_version from public.chronicle_state where user_id = owner;

  insert into public.chronicle_sleep_push_actions (token_hash, subscription_id, user_id, timezone, night, expires_at) values
    ('one', '00000000-0000-4000-8000-000000000032', owner, zone, night, now() + interval '1 hour'),
    ('two', '00000000-0000-4000-8000-000000000033', owner, zone, night, now() + interval '1 hour'),
    ('expired', '00000000-0000-4000-8000-000000000034', owner, zone, night, now() - interval '1 second');
  if public.chronicle_record_push_bedtime('tampered') <> 'unavailable'
    or public.chronicle_record_push_bedtime('expired') <> 'unavailable' then
    raise exception 'Tampered or expired credential worked';
  end if;
  result := public.chronicle_record_push_bedtime('one');
  if result <> 'recorded' then raise exception 'Expected a save, got %', result; end if;
  if public.chronicle_record_push_bedtime('one') <> 'already_recorded'
    or public.chronicle_record_push_bedtime('two') <> 'already_recorded' then
    raise exception 'Replay or another subscription overwrote the bedtime';
  end if;

  select data into snapshot from public.chronicle_state where user_id = owner and version = current_version + 1;
  if snapshot is null or snapshot #>> '{lifeLog,0,waterLiters}' <> '0'
    or snapshot #>> '{journal,0,totalHours}' <> '3'
    or snapshot #>> '{lifeLog,0,bedtime}' is distinct from snapshot #>> '{journal,0,sleepTime}'
    or snapshot #>> '{lifeLog,0,wakeTime}' is not null
    or snapshot #>> '{lifeLog,0,sleepHours}' is not null
  then raise exception 'Sleep write lost unrelated data or invented readings'; end if;
  perform set_config('request.jwt.claim.sub', owner::text, true);
  select status into result from public.chronicle_save(snapshot, current_version, 0, 'stale fixture');
  if result <> 'conflict' then raise exception 'An older snapshot version can overwrite the background save'; end if;

  delete from public.chronicle_push_subscriptions where id = '00000000-0000-4000-8000-000000000032';
  if public.chronicle_record_push_bedtime('one') <> 'unavailable' then
    raise exception 'Revoked subscription was accepted';
  end if;
end;
$$;
rollback;
select 'All sleep push action checks passed' as result;
