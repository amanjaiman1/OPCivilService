begin;
insert into auth.users(id,email) values
 ('52000000-0000-4000-8000-000000000001','native-a@fixture.invalid'),
 ('52000000-0000-4000-8000-000000000002','native-b@fixture.invalid');
do $$
declare
  a uuid := '52000000-0000-4000-8000-000000000001';
  b uuid := '52000000-0000-4000-8000-000000000002';
  d uuid := '52000000-0000-4000-8000-000000000011';
  other uuid := '52000000-0000-4000-8000-000000000012';
  t text := 'ExpoPushToken[Only_a_synthetic_test_token]';
begin
  if has_table_privilege('authenticated','public.chronicle_native_push','select') then raise exception 'Raw recipient table is exposed'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  if public.chronicle_register_native_push(d,t,'ios','invalid') then raise exception 'Invalid zone accepted'; end if;
  if not public.chronicle_register_native_push(d,t,'ios','UTC') then raise exception 'Valid registration failed'; end if;
  if not public.chronicle_register_native_push(d,t,'ios','Asia/Kolkata') then raise exception 'Renewal failed'; end if;
  perform set_config('request.jwt.claim.sub',b::text,true);
  if public.chronicle_register_native_push(d,t,'android','UTC') or public.chronicle_register_native_push(other,t,'android','UTC')
    then raise exception 'A second account stole an installation or token'; end if;
  perform public.chronicle_revoke_native_push(d);
  if not exists (select 1 from public.chronicle_native_push where device_id=d and user_id=a) then raise exception 'A second account revoked a device'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform public.chronicle_revoke_native_push(d);
  perform set_config('request.jwt.claim.sub',b::text,true);
  if not public.chronicle_register_native_push(other,t,'android','UTC') then raise exception 'Token did not move after revocation'; end if;
  update auth.users set banned_until=now()+interval '1 day' where id=b;
  if public.chronicle_register_native_push(other,t,'android','UTC') then raise exception 'Suspended account registered a device'; end if;
  delete from auth.users where id=b;
  if exists(select 1 from public.chronicle_native_push where user_id=b) then raise exception 'Account deletion retained device'; end if;
end
$$;
rollback;
select 'All native push ownership checks passed' as result;
