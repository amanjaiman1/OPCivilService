-- Metadata only. No telemetry table stores a student's snapshot or content.
create table if not exists public.platform_snapshot_sizes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bytes bigint not null
);
create table if not exists public.platform_sync_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  pulls integer not null default 0,
  saves integer not null default 0,
  successes integer not null default 0,
  failures integer not null default 0,
  conflicts integer not null default 0,
  upload bigint not null default 0,
  download bigint not null default 0,
  last_success timestamptz,
  batches integer not null default 0,
  primary key(user_id,day)
);
create index if not exists platform_sync_usage_day on public.platform_sync_usage(day);
create table if not exists public.platform_usage_batches (
  user_id uuid not null references auth.users(id) on delete cascade,
  batch uuid not null,
  day date not null,
  primary key(user_id,batch)
);
create index if not exists platform_usage_batches_day on public.platform_usage_batches(day);
create table if not exists public.platform_usage_totals (
  day date primary key,
  snapshot_bytes bigint not null,
  attachment_bytes bigint not null
);
alter table public.platform_snapshot_sizes enable row level security;
alter table public.platform_sync_usage enable row level security;
alter table public.platform_usage_batches enable row level security;
alter table public.platform_usage_totals enable row level security;
revoke all on public.platform_snapshot_sizes, public.platform_sync_usage, public.platform_usage_batches, public.platform_usage_totals from public, anon, authenticated;

insert into public.platform_snapshot_sizes (user_id, bytes)
select user_id,octet_length(data::text) from public.chronicle_state
on conflict (user_id) do update set bytes=excluded.bytes;

create or replace function public.platform_update_snapshot_size()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    delete from public.platform_snapshot_sizes where user_id=old.user_id;
    return old;
  end if;
  insert into public.platform_snapshot_sizes (user_id,bytes) values(new.user_id,octet_length(new.data::text))
    on conflict (user_id) do update set bytes=excluded.bytes;
  return new;
end
$$;
revoke all on function public.platform_update_snapshot_size() from public, anon, authenticated;
drop trigger if exists platform_snapshot_size on public.chronicle_state;
create trigger platform_snapshot_size after insert or update of data or delete on public.chronicle_state
for each row execute function public.platform_update_snapshot_size();

-- Bounded, retry-safe batches use the server's UTC day and the authenticated owner.
create or replace function public.platform_record_sync_usage(
  p_account uuid,p_batch uuid,p_pulls integer,p_saves integer,p_successes integer,p_failures integer,p_conflicts integer,p_upload bigint,p_download bigint
) returns boolean language plpgsql security definer set search_path='' as $$
declare
  owner uuid := auth.uid();
  stamp date := (now() at time zone 'UTC')::date;
  touched integer;
begin
  if owner is null or owner is distinct from p_account or p_batch is null or not exists (
    select 1 from auth.users where id=owner and (banned_until is null or banned_until<=now())
  ) then return false; end if;
  if num_nonnulls(p_pulls,p_saves,p_successes,p_failures,p_conflicts,p_upload,p_download)<>7
    or p_pulls not between 0 and 256 or p_saves not between 0 and 256
    or p_pulls+p_saves not between 1 and 256 or least(p_successes,p_failures,p_conflicts)<0
    or p_successes+p_failures+p_conflicts <> p_pulls+p_saves
    or p_upload not between 0 and 536870912 or p_download not between 0 and 536870912
  then return false; end if;
  insert into public.platform_sync_usage(user_id,day) values(owner,stamp) on conflict do nothing;
  perform 1 from public.platform_sync_usage where user_id=owner and day=stamp for update;
  if exists (select 1 from public.platform_usage_batches where user_id=owner and batch=p_batch) then return true; end if;
  if (select batches from public.platform_sync_usage where user_id=owner and day=stamp)>=120 then return false; end if;
  insert into public.platform_usage_batches (user_id,batch,day) values(owner,p_batch,stamp) on conflict do nothing;
  get diagnostics touched = row_count;
  if touched=0 then return true; end if;
  update public.platform_sync_usage set pulls=pulls+p_pulls,saves=saves+p_saves,successes=successes+p_successes,
    failures=failures+p_failures,conflicts=conflicts+p_conflicts,upload=upload+p_upload,download=download+p_download,
    last_success=case when p_successes>0 then now() else last_success end,batches=batches+1
  where user_id=owner and day=stamp;
  return true;
end
$$;
revoke all on function public.platform_record_sync_usage(uuid,uuid,integer,integer,integer,integer,integer,bigint,bigint) from public,anon,service_role;
grant execute on function public.platform_record_sync_usage(uuid,uuid,integer,integer,integer,integer,integer,bigint,bigint) to authenticated;

create or replace function public.platform_sample_footprint()
returns void language plpgsql security definer set search_path='' as $$
declare stamp date := (now() at time zone 'UTC')::date;
begin
  if exists (select 1 from public.platform_usage_totals where day=stamp) then return; end if;
  if not pg_try_advisory_xact_lock(8130445) then return; end if;
  if exists (select 1 from public.platform_usage_totals where day=stamp) then return; end if;
  insert into public.platform_usage_totals values(stamp,
    coalesce((select sum(bytes) from public.platform_snapshot_sizes),0),
    coalesce((select sum(case when metadata->>'size' ~ '^[0-9]{1,15}$' then (metadata->>'size')::bigint else 0 end)
      from storage.objects where bucket_id='chronicle-attachments'),0));
  delete from public.platform_usage_totals where day < stamp-89;
  delete from public.platform_sync_usage where day < stamp-34;
  delete from public.platform_usage_batches where day < stamp-34;
end
$$;
revoke all on function public.platform_sample_footprint() from public,anon,authenticated;
grant execute on function public.platform_sample_footprint() to service_role;

create or replace function public.platform_admin_resource_usage(
  p_actor uuid,p_days integer,p_query text,p_sort text,p_limit integer,p_offset integer
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  stamp date := (now() at time zone 'UTC')::date;
  start_day date := stamp - (least(greatest(coalesce(p_days,7),1),35)-1);
begin
  perform public.platform_assert(p_actor,'analytics.read');
  perform public.platform_assert(p_actor,'users.read');
  return (
    with attachment as materialized (
      select split_part(name,'/',1) as owner,
        sum(case when metadata->>'size' ~ '^[0-9]{1,15}$' then (metadata->>'size')::bigint else 0 end) as bytes,
        count(*) filter (where coalesce(metadata->>'size','') !~ '^[0-9]{1,15}$') as unmeasured
      from storage.objects where bucket_id='chronicle-attachments' group by 1
    ), monitored as materialized (
      select user_id,sum(upload) upload,sum(download) download,sum(pulls) pulls,sum(saves) saves,
        sum(successes) successes,sum(failures) failures,sum(conflicts) conflicts,max(last_success) last_success,count(*) covered_days
      from public.platform_sync_usage where day>=start_day group by user_id
    ), accounts as (
      select u.id,u.email,sz.bytes as snapshot,coalesce(a.bytes,0) as attachments,coalesce(a.unmeasured,0) as unmeasured,
        m.upload,m.download,m.pulls,m.saves,m.successes,m.failures,m.conflicts,m.last_success as "lastSync",m.covered_days as "coveredDays",v.active_at as "lastActive"
      from auth.users u left join public.platform_snapshot_sizes sz on sz.user_id=u.id
        left join attachment a on a.owner=u.id::text left join monitored m on m.user_id=u.id
        left join public.platform_last_active v on v.user_id=u.id
      where strpos(lower(coalesce(u.email,'')),lower(left(coalesce(p_query,''),100)))>0 or coalesce(p_query,'')=''
    ), page as (
      select * from accounts order by
        case p_sort when 'attachment' then attachments when 'transfer' then upload+download else snapshot end desc nulls last,id
      limit least(greatest(coalesce(p_limit,25),1),50) offset least(greatest(coalesce(p_offset,0),0),100000)
    )
    select jsonb_build_object(
      'from',start_day,'to',stamp,
      'snapshotBytes',(select coalesce(sum(bytes),0) from public.platform_snapshot_sizes),
      'attachmentBytes',(select coalesce(sum(bytes),0) from attachment),
      'unmeasuredFiles',(select coalesce(sum(unmeasured),0) from attachment),
      'orphanAttachmentBytes',(select coalesce(sum(a.bytes),0) from attachment a where not exists (select 1 from auth.users u where u.id::text=a.owner)),
      'activeAccounts',(select count(*) from public.platform_last_active where active_at >= start_day::timestamp at time zone 'UTC'),
      'upload',(select sum(upload) from monitored),'download',(select sum(download) from monitored),
      'requests',(select sum(pulls+saves) from monitored),
      'total',(select count(*) from accounts),
      'items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),
      'transfer',coalesce((select jsonb_agg(to_jsonb(t) order by t.day) from (
        select day,sum(upload) upload,sum(download) download,sum(pulls+saves) requests
        from public.platform_sync_usage where day>=start_day group by day
      ) t),'[]'),
      'footprint',coalesce((select jsonb_agg(to_jsonb(t) order by t.day) from public.platform_usage_totals t where day>=start_day),'[]')
    )
  );
end
$$;
revoke all on function public.platform_admin_resource_usage(uuid,integer,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.platform_admin_resource_usage(uuid,integer,text,text,integer,integer) to service_role;
