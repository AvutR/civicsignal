-- Apply after 202609300001_civic_reports.sql.
begin;
alter table private.reports drop constraint reports_category_check;
alter table private.reports add constraint reports_category_check check(category in
 ('water','roads','power','health','education','sanitation','transport','public-space','governance'));
-- Deleted report IDs must not be reused to reclaim old object paths or race cleanup.
create table private.report_tombstones(id uuid primary key);
alter table private.report_tombstones enable row level security;
create function private.protect_report_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then insert into private.report_tombstones values(old.id) on conflict do nothing;return old;end if;
 if exists(select 1 from private.report_tombstones where id=new.id) then raise exception 'This report ID has been retired. Start a new report.';end if;
 return new;
end;
$$;
create trigger protect_report_identity before insert or delete on private.reports
for each row execute function private.protect_report_identity();

create table private.report_media(
 id uuid primary key,
 report_id uuid not null references private.reports(id) on delete cascade,
 kind text not null check(kind in ('image','audio')),
 mime text not null,
 size bigint not null check(size>0 and size<=8388608),
 path text not null unique,
 ready boolean not null default false,
 created_at timestamptz not null default now(),
 check((kind='image' and mime in ('image/jpeg','image/png','image/webp') and size<=2097152)
   or (kind='audio' and mime in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav')))
);
create index report_media_report on private.report_media(report_id);
alter table private.report_media enable row level security;

-- Physical objects are removed through the Storage API, never by SQL deletion.
-- Keep a durable queue so failed cleanup does not lose references to orphaned files.
create table private.media_cleanup(path text primary key,queued_at timestamptz not null default now());
alter table private.media_cleanup enable row level security;
create function private.queue_media_cleanup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into private.media_cleanup(path) values(old.path) on conflict do nothing;
 return old;
end;
$$;
create trigger queue_media_cleanup before delete on private.report_media
for each row execute function private.queue_media_cleanup();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('civic-media','civic-media',false,8388608,
 array['image/jpeg','image/png','image/webp','audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav']);

create function public.reserve_media(p_report_id uuid,p_id uuid,p_kind text,p_mime text,p_size bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.reports;m private.report_media;extension text;
begin
 select * into r from private.reports where id=p_report_id for update;
 if not found or auth.uid() is null or r.owner_id<>auth.uid() then raise exception 'Only the report author can attach media.' using errcode='42501';end if;
 select * into m from private.report_media where id=p_id;
 if found then
  if m.report_id<>p_report_id or m.kind<>p_kind or m.mime<>p_mime or m.size<>p_size then raise exception 'Attachment identity does not match.';end if;
  return jsonb_build_object('path',m.path,'ready',m.ready);
 end if;
 if (select count(*) from private.report_media where report_id=p_report_id and kind=p_kind)>=(case when p_kind='image' then 3 else 1 end) then
  raise exception 'A report supports up to 3 photos and 1 audio note.';
 end if;
 extension:=case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'audio/webm' then 'webm' when 'audio/ogg' then 'ogg' when 'audio/mp4' then 'm4a' when 'audio/mpeg' then 'mp3' when 'audio/wav' then 'wav' when 'audio/x-wav' then 'wav' else null end;
 if extension is null then raise exception 'Unsupported media type.';end if;
 insert into private.report_media(id,report_id,kind,mime,size,path)
 values(p_id,p_report_id,p_kind,p_mime,p_size,p_report_id::text||'/'||p_id::text||'.'||extension) returning * into m;
 return jsonb_build_object('path',m.path,'ready',false);
end;
$$;

create function public.can_upload_media(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.report_media m join private.reports r on r.id=m.report_id
 where m.path=p_path and not m.ready and r.owner_id=auth.uid());
$$;
create function public.can_read_media(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.report_media m join private.reports r on r.id=m.report_id
 where m.path=p_path and (m.ready or r.owner_id=auth.uid()));
$$;
create policy civic_media_insert on storage.objects for insert to authenticated
with check(bucket_id='civic-media' and public.can_upload_media(name));
create policy civic_media_read on storage.objects for select to anon,authenticated
using(bucket_id='civic-media' and public.can_read_media(name));
-- Clients cannot overwrite/delete storage objects. Report deletion queues API cleanup.

create function public.finish_media(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare m private.report_media;
begin
 select media.* into m from private.report_media media join private.reports r on r.id=media.report_id
 where media.id=p_id and r.owner_id=auth.uid() for update of media;
 if not found then raise exception 'Attachment not found or not yours.' using errcode='42501';end if;
 if not exists(select 1 from storage.objects where bucket_id='civic-media' and name=m.path
  and metadata->>'mimetype'=m.mime and (metadata->>'size')::bigint=m.size) then raise exception 'The uploaded file does not match the reserved attachment.';end if;
 update private.report_media set ready=true where id=p_id;
end;
$$;
create function public.list_media(p_report_id uuid) returns setof jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'kind',m.kind,'mime',m.mime,'size',m.size,'path',m.path)
 from private.report_media m where m.report_id=p_report_id and m.ready order by m.created_at,m.id;
$$;
create or replace function private.report_json(r private.reports) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id','CS-'||r.id::text,'title',r.title,'place',r.place,'description',r.description,
 'category',r.category,'priority',r.priority,'lat',r.lat,'lng',r.lng,'status',r.status,
 'createdAt',r.created_at,'updatedAt',r.updated_at,'revision',r.revision,'demo',false,
 'canDelete',r.owner_id=(select auth.uid()) or public.is_reviewer(),
 'mediaCounts',jsonb_build_object('image',(select count(*) from private.report_media where report_id=r.id and ready and kind='image'),
 'audio',(select count(*) from private.report_media where report_id=r.id and ready and kind='audio')));
$$;

-- Cleanup worker endpoints: service role only, never exposed to the browser.
-- Delay cleanup to cover an upload in flight when its report was deleted.
create function public.pending_media_cleanup() returns setof text
language sql stable security definer set search_path='' as $$
 select path from private.media_cleanup where queued_at<now()-interval '10 minutes' order by queued_at limit 100;
$$;
create function public.ack_media_cleanup(p_paths text[]) returns void
language sql security definer set search_path='' as $$
 delete from private.media_cleanup where path=any(p_paths);
$$;
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.reserve_media(uuid,uuid,text,text,bigint),public.can_upload_media(text),public.can_read_media(text),public.finish_media(uuid),public.list_media(uuid),public.pending_media_cleanup(),public.ack_media_cleanup(text[]) from public,anon,authenticated;
grant execute on function public.reserve_media(uuid,uuid,text,text,bigint),public.can_upload_media(text),public.finish_media(uuid) to authenticated;
grant execute on function public.can_read_media(text),public.list_media(uuid) to anon,authenticated;
grant execute on function public.pending_media_cleanup(),public.ack_media_cleanup(text[]) to service_role;
commit;
