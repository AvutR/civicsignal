import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const report='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',photo='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let path;
async function as(role,user,fn){await db.exec(`set role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);try{return await fn();}finally{await db.exec('reset role');}}
const reserve=(id,kind='image',mime='image/jpeg',size=1024)=>db.query('select public.reserve_media($1,$2,$3,$4,$5) as media',[report,id,kind,mime,size]);
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated;grant select,insert on storage.objects to anon,authenticated;grant usage on all sequences in schema storage to anon,authenticated;`);
 for(const id of [owner,other])await db.query('insert into auth.users values($1)',[id]);
 for(const name of ['202609300001_civic_reports.sql','202609300002_multimedia.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
 await as('authenticated',owner,()=>db.query('select public.create_report($1)',[JSON.stringify({id:`CS-${report}`,title:'Long wait for public records',place:'Ward office',category:'governance',priority:'normal',description:'The service counter has been closed during posted opening hours.',lat:18,lng:73})]));
});
after(()=>db.close());
test('governance reports work and only their author can reserve bounded attachments',async()=>{
 await as('authenticated',other,()=>assert.rejects(reserve(photo),/Only the report author/));
 await as('authenticated',owner,async()=>{
  const m=(await reserve(photo)).rows[0].media;path=m.path;assert.equal(m.ready,false);assert.equal(path,`${report}/${photo}.jpg`);
  assert.deepEqual((await reserve(photo)).rows[0].media,m);
  await assert.rejects(reserve(photo,'image','image/jpeg',2048),/identity does not match/);
  await assert.rejects(reserve('cccccccc-cccc-4ccc-8ccc-cccccccccccc','image','image/svg+xml'),/Unsupported media/);
  await assert.rejects(reserve('cccccccc-cccc-4ccc-8ccc-cccccccccccc','image','image/jpeg',2097153),/check constraint/);
 });
});
test('storage policies reject foreign/arbitrary uploads and keep unfinished files private',async()=>{
 await as('authenticated',other,()=>assert.rejects(db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['civic-media',path,{mimetype:'image/jpeg',size:1024}]),/row-level security/));
 await as('authenticated',owner,async()=>{
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name,metadata) values('civic-media','anything.jpg','{}')"),/row-level security/);
  await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['civic-media',path,{mimetype:'image/jpeg',size:1024}]);
 });
 await as('anon',null,async()=>{assert.equal((await db.query('select * from storage.objects')).rows.length,0);assert.equal((await db.query('select public.list_media($1)',[report])).rows.length,0);});
});
test('finalizing validates stored metadata and exposes only ready media',async()=>{
 await as('authenticated',other,()=>assert.rejects(db.query('select public.finish_media($1)',[photo]),/not yours/));
 await db.query("update storage.objects set metadata='{"+'"mimetype":"image/jpeg","size":99'+"}'");
 await as('authenticated',owner,()=>assert.rejects(db.query('select public.finish_media($1)',[photo]),/does not match/));
 await db.query('update storage.objects set metadata=$1',[{mimetype:'image/jpeg',size:1024}]);
 await as('authenticated',owner,()=>db.query('select public.finish_media($1)',[photo]));
 await as('anon',null,async()=>{assert.equal((await db.query('select * from storage.objects')).rows.length,1);assert.equal((await db.query('select public.list_media($1) as media',[report])).rows[0].media.kind,'image');assert.equal((await db.query('select public.list_reports() as report')).rows[0].report.mediaCounts.image,1);});
});
test('a report cannot reserve unlimited photo or audio uploads',async()=>{
 await as('authenticated',owner,async()=>{
  for(const id of ['cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd'])await reserve(id);
  await assert.rejects(reserve('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),/up to 3 photos/);
  await reserve('ffffffff-ffff-4fff-8fff-ffffffffffff','audio','audio/webm',10000);
  await assert.rejects(reserve('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','audio','audio/mpeg',10000),/up to 3 photos/);
 });
});
test('deletion revokes reads and durably queues storage cleanup; clients cannot drain queue',async()=>{
 await as('authenticated',owner,()=>db.query('select public.delete_report($1,1)',[report]));
 await as('authenticated',other,()=>assert.rejects(db.query('select public.create_report($1)',[JSON.stringify({id:`CS-${report}`,title:'Reclaimed report',place:'Pune',category:'roads',priority:'normal',description:'',lat:18,lng:73})]),/retired/));
 await as('anon',null,async()=>{assert.equal((await db.query('select * from storage.objects')).rows.length,0);assert.equal((await db.query('select public.list_media($1)',[report])).rows.length,0);await assert.rejects(db.query('select public.pending_media_cleanup()'),/permission denied/);});
 assert.equal((await db.query('select count(*)::int as count from private.media_cleanup')).rows[0].count,4);
 await db.exec("update private.media_cleanup set queued_at=now()-interval '11 minutes'");
 await as('service_role',null,async()=>{assert.equal((await db.query('select public.pending_media_cleanup()')).rows.length,4);await db.query('select public.ack_media_cleanup($1)',[[path]]);assert.equal((await db.query('select public.pending_media_cleanup()')).rows.length,3);});
});
