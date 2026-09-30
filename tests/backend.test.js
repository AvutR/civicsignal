import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const author='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const reviewer='33333333-3333-4333-8333-333333333333';
const limited='44444444-4444-4444-8444-444444444444';
const reportId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const payload=(id=reportId)=>({id:`CS-${id}`,title:'Broken public water tap',place:'Pune market',description:'The public tap needs a replacement valve.',category:'water',priority:'high',lat:18.52,lng:73.86,status:'Resolved',demo:true,owner_id:reviewer});
async function as(role,user,fn){
 await db.exec(`set role ${role}`);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
 try{return await fn();}finally{await db.exec('reset role');}
}
const rpcCreate=p=>db.query('select public.create_report($1::jsonb) as report',[JSON.stringify(p)]);
before(async()=>{
 await db.exec(`create role anon nologin;create role authenticated nologin;
 create schema auth;create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const id of [author,other,reviewer,limited])await db.query('insert into auth.users values($1,$2)',[id,`${id}@example.test`]);
 await db.exec(await readFile(new URL('../supabase/migrations/202609300001_civic_reports.sql',import.meta.url),'utf8'));
 await db.query('insert into private.reviewers values($1)',[reviewer]);
});
after(()=>db.close());
test('anonymous visitors can read but cannot submit or access private tables',async()=>{
 await as('anon',null,async()=>{
  assert.equal((await db.query('select public.list_reports()')).rows.length,0);
  await assert.rejects(rpcCreate(payload()),/permission denied/);
  await assert.rejects(db.query('select * from private.reports'),/permission denied/);
  await assert.rejects(db.query('select * from private.reviewers'),/permission denied/);
 });
});
test('authenticated submit is validated, idempotent, and ignores forged authority fields',async()=>{
 await as('authenticated',author,async()=>{
  const {report}= (await rpcCreate(payload())).rows[0];assert.equal(report.status,'Submitted');assert.equal(report.demo,false);assert.equal(report.canDelete,true);assert.equal(report.owner_id,undefined);assert.equal(report.revision,1);
  assert.deepEqual((await rpcCreate(payload())).rows[0].report,report);
  const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await assert.rejects(rpcCreate({...payload(id),lat:91}),/check constraint/);
  await assert.rejects(rpcCreate({...payload(id),title:' '}),/check constraint/);
  await assert.rejects(rpcCreate({...payload(id),category:'anything'}),/check constraint/);
  await assert.rejects(rpcCreate({...payload(id),lat:'18.52'}),/Invalid report fields/);
 });
 assert.equal((await db.query('select count(*)::int as count from private.submissions where user_id=$1',[author])).rows[0].count,1);
});
test('another visitor sees shared reports without private identity and cannot delete or promote themselves',async()=>{
 await as('authenticated',other,async()=>{
  const row=(await db.query('select public.list_reports() as report')).rows[0].report;
  assert.equal(row.title,'Broken public water tap');assert.equal(row.canDelete,false);assert.equal(row.owner_id,undefined);assert.equal(row.email,undefined);
  await assert.rejects(db.query('select public.delete_report($1,1)',[reportId]),/Cannot remove/);
  await assert.rejects(db.query("select public.review_report($1,'Resolved','Forged review',1)",[reportId]),/Only an assigned reviewer/);
  await assert.rejects(db.query('insert into private.reviewers values($1)',[other]),/permission denied/);
  await assert.rejects(rpcCreate(payload()),/already exists/);
 });
});
test('reviewer changes create public history and reject stale updates',async()=>{
 await as('authenticated',reviewer,async()=>{
  assert.equal((await db.query('select public.is_reviewer() as allowed')).rows[0].allowed,true);
  const result=await db.query("select public.review_report($1,'In progress','Repairs scheduled for Friday.',1) as report",[reportId]);
  assert.equal(result.rows[0].report.revision,2);assert.equal(result.rows[0].report.status,'In progress');
  await assert.rejects(db.query("select public.review_report($1,'Resolved','Outdated review.',1)",[reportId]),/changed or was removed/);
  await assert.rejects(db.query("select public.review_report($1,'Resolved','',2)",[reportId]),/review note/);
 });
 await as('anon',null,async()=>{const events=(await db.query('select public.report_history($1) as event',[reportId])).rows;assert.equal(events.length,2);assert.equal(events[0].event.note,'Repairs scheduled for Friday.');assert.equal(events[0].event.actor_id,undefined);});
});
test('author cannot change status but can delete their report and its history',async()=>{
 await as('authenticated',author,async()=>{
  await assert.rejects(db.query("select public.review_report($1,'Resolved','Self-approved.',2)",[reportId]),/Only an assigned reviewer/);
  await assert.rejects(db.query('select public.delete_report($1,1)',[reportId]),/Cannot remove/);
  await db.query('select public.delete_report($1,2)',[reportId]);
  assert.equal((await db.query('select public.report_history($1)',[reportId])).rows.length,0);
 });
});
test('daily quota survives deletion and blocks an eleventh submission',async()=>{
 await as('authenticated',limited,async()=>{
  for(let n=0;n<10;n++){const id=`cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12,'0')}`;await rpcCreate(payload(id));await db.query('select public.delete_report($1,1)',[id]);}
  await assert.rejects(rpcCreate(payload('dddddddd-dddd-4ddd-8ddd-dddddddddddd')),/Daily limit reached/);
 });
});
