begin;
insert into auth.users (id,email,created_at) values
  ('41000000-0000-4000-8000-000000000001','owner@web-release.invalid',now()-interval '90 days'),
  ('41000000-0000-4000-8000-000000000002','moderator@web-release.invalid',now()-interval '90 days'),
  ('41000000-0000-4000-8000-000000000003','student@web-release.invalid',now()-interval '90 days'),
  ('41000000-0000-4000-8000-000000000004','other@web-release.invalid',now()-interval '90 days');
insert into public.platform_admin_memberships(user_id,role) values
  ('41000000-0000-4000-8000-000000000001','super_admin'),
  ('41000000-0000-4000-8000-000000000002','moderator');
insert into public.chronicle_state(user_id,data) values
  ('41000000-0000-4000-8000-000000000003',jsonb_build_object(
    'profile',jsonb_build_object('timezone','UTC'),
    'journal',(select jsonb_agg(jsonb_build_object('date',(current_date-g)::text,'totalHours',2,'reflection','PRIVATE-TEST-PROSE')) from generate_series(20,26) g)));
insert into storage.objects(bucket_id,name,metadata) values
  ('chronicle-attachments','41000000-0000-4000-8000-000000000003/test.json','{"size":37}'),
  ('chronicle-attachments','41000000-0000-4000-8000-000000000003/missing.json','{}'),
  ('chronicle-attachments','orphan/example.json','{"size":11}');
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000003',true);

do $$
declare
  student uuid := '41000000-0000-4000-8000-000000000003';
  other uuid := '41000000-0000-4000-8000-000000000004';
  tab_a uuid := '41000000-0000-4000-8000-000000000011';
  tab_b uuid := '41000000-0000-4000-8000-000000000012';
  local_minute text := to_char(now() at time zone 'UTC','HH24:MI');
  later text := to_char((now() at time zone 'UTC') + interval '1 minute','HH24:MI');
begin
  if local_minute <> '23:59' then
    insert into public.platform_settings(key,value) values('review_invite_time',to_jsonb(later));
    if public.platform_claim_review_invitation('reserve',tab_a,'Asia/Kolkata') then raise exception 'Claim worked before scheduled profile time'; end if;
  end if;
  insert into public.platform_settings(key,value) values('review_invite_time','"00:00"') on conflict(key) do update set value=excluded.value;
  if not public.platform_claim_review_invitation('reserve',tab_a,'UTC') then raise exception 'Eligible claim failed'; end if;
  if public.platform_claim_review_invitation('reserve',tab_b,'UTC') then raise exception 'Second device acquired live claim'; end if;
  perform public.platform_claim_review_invitation('release',tab_a,'UTC');
  if not public.platform_claim_review_invitation('reserve',tab_b,'UTC') then raise exception 'Released claim could not recover'; end if;
  if public.platform_claim_review_invitation('show',tab_a,'UTC') then raise exception 'Stale nonce was accepted'; end if;
  if not public.platform_claim_review_invitation('show',tab_b,'UTC') then raise exception 'Current nonce could not confirm display'; end if;
  if public.platform_claim_review_invitation('reserve',tab_a,'UTC') then raise exception 'The same day was shown twice'; end if;
  if not public.platform_claim_review_invitation('postpone',tab_b,'UTC') then raise exception 'Postpone failed'; end if;
  perform public.platform_claim_review_invitation('postpone',tab_b,'UTC');
  if (select postpone_count from public.platform_review_invitations where user_id=student) <> 1 then raise exception 'Retry postponed twice'; end if;

  if public.platform_record_sync_usage(other,tab_a,1,1,1,0,1,30,55) then raise exception 'Cross-account batch accepted'; end if;
  if public.platform_record_sync_usage(student,tab_a,2000,1,1,0,1,30,55) then raise exception 'Unbounded telemetry accepted'; end if;
  if not public.platform_record_sync_usage(student,tab_a,1,1,1,0,1,30,55) then raise exception 'Valid telemetry not recorded'; end if;
  perform public.platform_record_sync_usage(student,tab_a,1,1,1,0,1,30,55);
  if (select upload from public.platform_sync_usage where user_id=student) <> 30 then raise exception 'Telemetry was counted twice'; end if;

  update auth.users set banned_until=now()+interval '1 day' where id=student;
  if student=any(public.platform_push_eligible_users(array[student,other])) then raise exception 'Suspended account can receive push'; end if;
  update auth.users set banned_until=null where id=student;
end
$$;

insert into public.platform_feedback(user_id,category,message) values
  ('41000000-0000-4000-8000-000000000003','general','Private message fixture.');

do $$
declare
  owner uuid := '41000000-0000-4000-8000-000000000001';
  moderator uuid := '41000000-0000-4000-8000-000000000002';
  student uuid := '41000000-0000-4000-8000-000000000003';
  other uuid := '41000000-0000-4000-8000-000000000004';
  cursor_before bigint;
  info jsonb;
  latest jsonb;
begin
  if public.platform_admin_attention(moderator) ? 'feedback' then raise exception 'Moderator received restricted metadata'; end if;
  info := public.platform_admin_attention(owner)->'feedback';
  cursor_before := (info->>'cursor')::bigint;
  if not (info->>'unseen')::boolean or (info->>'pending')::int <> 1 then raise exception 'New item not counted'; end if;
  insert into public.platform_feedback(user_id,category,message) values (other,'bug','A second private fixture.');
  latest := public.platform_admin_ack_attention(owner,'feedback',cursor_before)->'feedback';
  if not (latest->>'unseen')::boolean or (latest->>'pending')::int <> 2 then raise exception 'Acknowledgment swallowed a later event or resolved work'; end if;
  latest := public.platform_admin_ack_attention(owner,'feedback',(latest->>'cursor')::bigint)->'feedback';
  if (latest->>'unseen')::boolean or (latest->>'pending')::int <> 2 then raise exception 'Acknowledgment resolved work'; end if;
  update public.platform_feedback set response='Handled' where user_id=student;
  if (public.platform_admin_attention(owner)#>>'{feedback,pending}')::int <> 1 then raise exception 'Actual resolution did not change pending count'; end if;
  begin
    perform public.platform_admin_resource_usage(moderator,7,'','snapshot',25,0);
    raise exception 'Moderator got resource metrics';
  exception when others then
    if sqlerrm <> 'platform:forbidden' then raise; end if;
  end;
  perform public.platform_sample_footprint();
  perform public.platform_sample_footprint();
  info := public.platform_admin_resource_usage(owner,7,'student@','snapshot',1,0);
  if (info->>'total')::int <> 1 or (info#>>'{items,0,attachments}')::int <> 37
    or (info#>>'{items,0,unmeasured}')::int <> 1
    or (info->>'orphanAttachmentBytes')::int <> 11 or (info#>>'{items,0,download}')::int <> 55
    or (info#>>'{items,0,snapshot}')::int <> (select octet_length(data::text) from public.chronicle_state where user_id=student)
    or jsonb_array_length(info->'footprint') <> 1
    or info::text like '%PRIVATE-TEST-PROSE%' or info::text like '%Private message fixture%'
  then raise exception 'Usage aggregation or privacy assertion failed: %',info; end if;
  delete from public.platform_feedback where user_id=student;
  delete from auth.users where id=student;
  if exists(select 1 from public.platform_sync_usage where user_id=student) or exists(select 1 from public.platform_usage_batches where user_id=student)
    or exists(select 1 from public.platform_snapshot_sizes where user_id=student)
    or exists(select 1 from public.platform_review_invitations where user_id=student)
  then raise exception 'Account deletion left private account metadata'; end if;
end
$$;
rollback;
select 'All web release checks passed' as result;
