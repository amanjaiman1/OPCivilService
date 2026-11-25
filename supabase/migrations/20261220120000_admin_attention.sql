-- Section counters are updated transactionally. Row locks prevent committing
-- an event below a cursor another transaction has already presented.
create table if not exists public.platform_attention_versions (
  section text primary key check (section in ('reviews','feedback')),
  version bigint not null default 0
);
insert into public.platform_attention_versions(section) values ('reviews'), ('feedback') on conflict do nothing;
create table if not exists public.platform_attention_seen (
  actor uuid not null references auth.users(id) on delete cascade,
  section text not null references public.platform_attention_versions(section),
  version bigint not null,
  primary key (actor, section)
);
alter table public.platform_attention_versions enable row level security;
alter table public.platform_attention_seen enable row level security;
revoke all on public.platform_attention_versions, public.platform_attention_seen from public, anon, authenticated;

create or replace function public.platform_attention_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare section_key text := tg_argv[0];
begin
  update public.platform_attention_versions set version = version + 1 where section = section_key;
  return new;
end
$$;
revoke all on function public.platform_attention_changed() from public, anon, authenticated;

drop trigger if exists platform_attention_review on public.platform_reviews;
create trigger platform_attention_review after insert or update on public.platform_reviews for each row
  when (new.status = 'pending') execute function public.platform_attention_changed('reviews');
drop trigger if exists platform_attention_feedback on public.platform_feedback;
create trigger platform_attention_feedback after insert on public.platform_feedback for each row
  execute function public.platform_attention_changed('feedback');
drop trigger if exists platform_attention_crash on public.platform_crash_reports;
create trigger platform_attention_crash after insert or update on public.platform_crash_reports for each row
  when (new.status = 'new') execute function public.platform_attention_changed('feedback');

create index if not exists platform_attention_pending_reviews on public.platform_reviews(id) where status = 'pending';
create index if not exists platform_attention_unanswered on public.platform_feedback(id)
  where response is null and status not in ('resolved','closed');

create or replace function public.platform_admin_attention(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  role text := public.platform_assert(p_actor,'admin.access');
  perms text[] := public.platform_permissions(role, coalesce((public.platform_settings_current() ->> 'moderators_handle_feedback')::boolean,false));
  result jsonb := '{}'::jsonb;
  current_version bigint;
  seen_version bigint;
begin
  if 'reviews.moderate' = any(perms) then
    select v.version, coalesce(a.version,0) into current_version, seen_version
      from public.platform_attention_versions v left join public.platform_attention_seen a on a.section=v.section and a.actor=p_actor
      where v.section='reviews';
    result := result || jsonb_build_object('reviews',jsonb_build_object('cursor',current_version::text,
      'unseen',current_version > seen_version, 'pending',(select count(*) from public.platform_reviews where status='pending')));
  end if;
  if 'feedback.manage' = any(perms) then
    select v.version, coalesce(a.version,0) into current_version, seen_version
      from public.platform_attention_versions v left join public.platform_attention_seen a on a.section=v.section and a.actor=p_actor
      where v.section='feedback';
    result := result || jsonb_build_object('feedback',jsonb_build_object('cursor',current_version::text,
      'unseen',current_version > seen_version,
      'pending',(select count(*) from public.platform_feedback where response is null and status not in ('resolved','closed')),
      'crashes',(select count(*) from public.platform_crash_reports where status='new')));
  end if;
  return result;
end
$$;

create or replace function public.platform_admin_ack_attention(p_actor uuid,p_section text,p_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_section not in ('reviews','feedback') or p_version is null or p_version < 0 then
    raise exception 'platform:invalid';
  end if;
  perform public.platform_assert(p_actor,case p_section when 'reviews' then 'reviews.moderate' else 'feedback.manage' end);
  if p_version > (select version from public.platform_attention_versions where section=p_section) then
    raise exception 'platform:invalid';
  end if;
  insert into public.platform_attention_seen as s (actor,section,version) values(p_actor,p_section,p_version)
    on conflict (actor,section) do update set version=greatest(excluded.version,s.version);
  return public.platform_admin_attention(p_actor);
end
$$;
revoke all on function public.platform_admin_attention(uuid), public.platform_admin_ack_attention(uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.platform_admin_attention(uuid), public.platform_admin_ack_attention(uuid,text,bigint) to service_role;
