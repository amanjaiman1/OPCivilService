begin;
insert into auth.users(id,email) values
 ('53000000-0000-4000-8000-000000000001','sleep-native-a@fixture.invalid'),
 ('53000000-0000-4000-8000-000000000002','sleep-native-b@fixture.invalid');
do $$
declare
  a uuid := '53000000-0000-4000-8000-000000000001';
  b uuid := '53000000-0000-4000-8000-000000000002';
  d uuid := '53000000-0000-4000-8000-000000000011';
  token uuid := '53000000-0000-4000-8000-000000000021';
  expired uuid := '53000000-0000-4000-8000-000000000022';
  zone text;
  night date;
  stamp bigint;
  snapshot jsonb;
begin
  select name,(clock_timestamp() at time zone name)::date+1 into zone,night from pg_timezone_names
    where name like 'Etc/GMT%' and extract(hour from clock_timestamp() at time zone name)=22 limit 1;
  if zone is null then raise exception 'No deterministic evening fixture'; end if;
  if has_table_privilege('authenticated','public.chronicle_native_bedtime_actions','select')
    or has_function_privilege('authenticated','public.chronicle_commit_bedtime(uuid,date,text,timestamptz)','execute')
    or has_function_privilege('anon','public.chronicle_record_native_bedtime(uuid,uuid)','execute')
  then raise exception 'Native sleep capability or internal writer is public'; end if;

  perform set_config('request.jwt.claim.sub',a::text,true);
  if not public.chronicle_register_native_push(d,'ExpoPushToken[Synthetic_sleep_test_token]','android',zone)
  then raise exception 'Fixture registration failed'; end if;
  insert into public.chronicle_state(user_id,data,schema_version) values
    (a,jsonb_build_object('profile',jsonb_build_object('timezone',zone),'notify',jsonb_build_object('deliver',true),
      'lifeLog',jsonb_build_array(jsonb_build_object('date',night::text,'waterLiters',2)),
      'journal',jsonb_build_array(jsonb_build_object('date',night::text,'totalHours',4))),18)
  returning version into stamp;
  insert into public.chronicle_native_bedtime_actions(device_id,night,token,timezone,expires_at) values
    (d,night,token,zone,clock_timestamp()+interval '1 hour'),(d,night-1,expired,zone,clock_timestamp()-interval '1 second');
  perform set_config('request.jwt.claim.sub',b::text,true);
  if public.chronicle_record_native_bedtime(d,token) <> 'unavailable' then raise exception 'Cross-account action succeeded'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  if public.chronicle_record_native_bedtime(d,expired) <> 'unavailable' then raise exception 'Expired action succeeded'; end if;
  update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=a;
  if public.chronicle_record_native_bedtime(d,token) <> 'unavailable' then raise exception 'Suspended owner used an action'; end if;
  update auth.users set banned_until=null where id=a;
  if public.chronicle_record_native_bedtime(d,token) <> 'recorded' then raise exception 'Valid action failed'; end if;
  if public.chronicle_record_native_bedtime(d,token) <> 'already_recorded' then raise exception 'Replay was not idempotent'; end if;
  select data into snapshot from public.chronicle_state where user_id=a and version=stamp+1 and schema_version=19;
  if snapshot is null or snapshot #>> '{lifeLog,0,bedtime}' is null
      or snapshot #>> '{lifeLog,0,bedtime}' is distinct from snapshot #>> '{journal,0,sleepTime}'
      or snapshot #>> '{lifeLog,0,waterLiters}' is distinct from '2'
      or snapshot #>> '{lifeLog,0,sleepHours}' is not null
      or snapshot #>> '{journal,0,totalHours}' is distinct from '4'
  then raise exception 'The action did not preserve or version the snapshot'; end if;
  perform public.chronicle_revoke_native_push(d);
  if public.chronicle_record_native_bedtime(d,token) <> 'unavailable'
     or exists(select 1 from public.chronicle_native_bedtime_actions where device_id=d)
  then raise exception 'Revocation failed to invalidate actions'; end if;
end
$$;
rollback;
select 'All native bedtime action checks passed' as result;
