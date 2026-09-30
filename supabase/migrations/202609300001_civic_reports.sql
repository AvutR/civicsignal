-- Run once in a new Supabase project's SQL editor, or apply with Supabase CLI.
-- All storage is private. Explicit RPCs are the only browser-accessible API.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table private.reports (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  place text not null check (char_length(btrim(place)) between 2 and 120),
  description text not null default '' check (char_length(description)<=2000),
  category text not null check (category in ('water','roads','power','health','education')),
  priority text not null check (priority in ('normal','high')),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  status text not null default 'Submitted' check (status in ('Submitted','In review','In progress','Resolved')),
  revision integer not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index reports_owner_created on private.reports(owner_id,created_at desc);
-- Keep quota timestamps after a report is deleted, without retaining its contents.
create table private.submissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp()
);
create index submissions_user_created on private.submissions(user_id,created_at);
create table private.report_events (
  id bigint generated always as identity primary key,
  report_id uuid not null references private.reports(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  status text not null,
  note text not null default '' check (char_length(note)<=1000),
  created_at timestamptz not null default clock_timestamp()
);
create index report_events_report on private.report_events(report_id,id);
alter table private.reviewers enable row level security;
alter table private.reports enable row level security;
alter table private.report_events enable row level security;
alter table private.submissions enable row level security;
-- No direct table policies/grants: even authenticated clients cannot bypass RPC checks.

create function public.is_reviewer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.reviewers where user_id=(select auth.uid()));
$$;

create function private.report_json(r private.reports) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id','CS-'||r.id::text,'title',r.title,'place',r.place,'description',r.description,
    'category',r.category,'priority',r.priority,'lat',r.lat,'lng',r.lng,'status',r.status,
    'createdAt',r.created_at,'updatedAt',r.updated_at,'revision',r.revision,'demo',false,
    'canDelete',r.owner_id=(select auth.uid()) or public.is_reviewer()
  );
$$;

create function public.list_reports(p_before uuid default null) returns setof jsonb
language sql stable security definer set search_path = '' as $$
  select private.report_json(r) from private.reports r
  where p_before is null or r.id < p_before
  order by r.id desc limit 200;
$$;

create function public.create_report(p_report jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  who uuid := auth.uid();
  report_id uuid;
  result private.reports;
begin
  if who is null then raise exception 'Sign in before submitting a report.' using errcode='42501'; end if;
  -- Serialize per-account submissions so concurrent requests cannot evade the daily limit.
  perform pg_advisory_xact_lock(hashtextextended(who::text,0));
  report_id := substring(p_report->>'id' from 4)::uuid;
  select * into result from private.reports where id=report_id;
  if found then
    if result.owner_id<>who then raise exception 'Report ID already exists.'; end if;
    return private.report_json(result); -- Idempotent retry after a lost response.
  end if;
  delete from private.submissions where user_id=who and created_at<now()-interval '24 hours';
  if (select count(*) from private.submissions where user_id=who)>=10 then
    raise exception 'Daily limit reached. Try again tomorrow (10 reports per account per day).';
  end if;
  if jsonb_typeof(p_report->'title') is distinct from 'string'
    or jsonb_typeof(p_report->'place') is distinct from 'string'
    or jsonb_typeof(p_report->'description') is distinct from 'string'
    or jsonb_typeof(p_report->'lat') is distinct from 'number'
    or jsonb_typeof(p_report->'lng') is distinct from 'number' then
    raise exception 'Invalid report fields.';
  end if;
  insert into private.reports(id,owner_id,title,place,description,category,priority,lat,lng)
  values(report_id,who,btrim(p_report->>'title'),btrim(p_report->>'place'),btrim(p_report->>'description'),
    p_report->>'category',p_report->>'priority',(p_report->>'lat')::double precision,(p_report->>'lng')::double precision)
  returning * into result;
  insert into private.submissions(user_id) values(who);
  insert into private.report_events(report_id,actor_id,status,note) values(report_id,who,'Submitted','Report received.');
  return private.report_json(result);
end;
$$;

create function public.review_report(p_id uuid,p_status text,p_note text,p_revision integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result private.reports;
begin
  if not public.is_reviewer() then raise exception 'Only an assigned reviewer can change report status.' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'Add a review note (3-1000 characters).'; end if;
  update private.reports set status=p_status,revision=revision+1,updated_at=clock_timestamp()
  where id=p_id and revision=p_revision returning * into result;
  if not found then raise exception 'This report changed or was removed. Refresh before reviewing it.'; end if;
  insert into private.report_events(report_id,actor_id,status,note) values(p_id,auth.uid(),p_status,btrim(p_note));
  return private.report_json(result);
end;
$$;

create function public.delete_report(p_id uuid,p_revision integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
  delete from private.reports where id=p_id and revision=p_revision and (owner_id=auth.uid() or public.is_reviewer());
  if not found then raise exception 'Cannot remove this report. It changed, was removed, or belongs to someone else.' using errcode='42501'; end if;
end;
$$;

create function public.report_history(p_id uuid) returns setof jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('status',status,'note',note,'createdAt',created_at)
  from private.report_events where report_id=p_id order by id desc;
$$;

-- PostgreSQL functions grant execution to PUBLIC by default. Revoke explicitly.
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.is_reviewer() from public,anon,authenticated;
revoke all on function public.list_reports(uuid) from public,anon,authenticated;
revoke all on function public.create_report(jsonb) from public,anon,authenticated;
revoke all on function public.review_report(uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.delete_report(uuid,integer) from public,anon,authenticated;
revoke all on function public.report_history(uuid) from public,anon,authenticated;
grant execute on function public.list_reports(uuid),public.report_history(uuid) to anon,authenticated;
grant execute on function public.is_reviewer(),public.create_report(jsonb),public.review_report(uuid,text,text,integer),public.delete_report(uuid,integer) to authenticated;
commit;
