import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, it, expect } from 'vitest';
const senior='00000000-0000-0000-0000-000000000001';
const event='00000000-0000-0000-0000-000000000002';
describe('durable Telegram voice drafts',()=>{
 it('enforces ownership, replay, reauthorisation and atomic confirmation',async()=>{
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create table seniors(id uuid primary key);
   create table senior_messaging_identities(senior_id uuid, platform text,external_user_id text, external_chat_id text,is_active boolean,verified_at timestamptz);
   create table telegram_webhook_events(id uuid primary key default gen_random_uuid(),update_id text unique,event_type text constraint telegram_webhook_events_event_type_check check(event_type in ('inbound_text','unsupported')),telegram_message_id text,sender_user_id text,chat_id text,text_body text,payload jsonb,occurred_at timestamptz,received_at timestamptz default now());
   insert into seniors values('${senior}'); insert into senior_messaging_identities values('${senior}','telegram','u','c',true,now());
   insert into telegram_webhook_events(id,update_id,event_type,sender_user_id,chat_id) values('${event}','1','unsupported','u','c');`);
  await db.exec(readFileSync('supabase/migrations/20261021011000_telegram_voice_drafts.sql','utf8'));
  await db.exec(`update telegram_webhook_events set event_type='inbound_voice' where id='${event}'`);
  const prepare=async(user='u')=>(await db.query<{id:string}>(`select * from prepare_telegram_voice_draft('${event}','${senior}','${user}','c')`)).rows;
  expect(await prepare('other')).toEqual([]);
  const draft=(await prepare())[0].id;
  await db.query(`update telegram_webhook_events set telegram_message_id='42' where id=$1`,[event]);
  const reserve=async()=>(await db.query<{v:boolean}>(`select reserve_telegram_voice_inference($1) v`,[draft])).rows[0].v;
  expect(await reserve()).toBe(true); expect(await reserve()).toBe(false); expect((await prepare())[0].id).toBe(draft);
  expect((await db.query<{v:boolean}>(`select stage_telegram_voice_draft('${draft}','hello') v`)).rows[0].v).toBe(true);
  expect((await db.query<{v:boolean}>(`select stage_telegram_voice_draft($1,'changed') v`,[draft])).rows[0].v).toBe(false);
  expect((await db.query<{v:boolean}>(`select stage_telegram_voice_draft($1,'hello') v`,[draft])).rows[0].v).toBe(true);
  await db.exec('update senior_messaging_identities set is_active=false');
  const finish=async(action='confirm')=>(await db.query<{v:string|null}>(`select finish_telegram_voice_draft('${draft}','${senior}','u','c','${action}') v`)).rows[0].v;
  expect(await finish()).toBeNull(); await db.exec('update senior_messaging_identities set is_active=true');
  const confirmations=await Promise.all([finish(),finish(),finish()]);
  const confirmed=confirmations[0]; expect(confirmed).toBeTruthy(); expect(new Set(confirmations).size).toBe(1); expect(await finish()).toBe(confirmed);
  const inbound=(await db.query<{telegram_message_id:string,payload:unknown}>(`select * from telegram_webhook_events where event_type='inbound_text'`)).rows;
  expect(inbound).toHaveLength(1); expect(inbound[0].telegram_message_id).toBe('42');
  expect(inbound[0].payload).toEqual({source:'confirmed_voice',voice_draft_id:draft,senior_id:senior});
  expect((await db.query<{transcript:null}>(`select transcript from telegram_voice_drafts`)).rows[0].transcript).toBeNull();
  const add=async(n:number)=>{const id=`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
   await db.query(`insert into telegram_webhook_events(id,update_id,event_type,sender_user_id,chat_id,received_at) values($1,$2::text,'inbound_voice','u','c',clock_timestamp()+($2::text::int * interval '1 second'))`,[id,String(n)]);
   return (await db.query<{id:string}>(`select * from prepare_telegram_voice_draft($1,$2,'u','c')`,[id,senior])).rows[0]?.id;
  };
  const old=await add(3); expect(old).toBeTruthy();
  const newest=await add(4); expect(newest).toBeTruthy();
  expect((await db.query<{v:boolean}>(`select stage_telegram_voice_draft($1,'stale') v`,[old])).rows[0].v).toBe(false);
  await db.query(`update telegram_voice_drafts set expires_at=clock_timestamp()-interval '1 second' where id=$1`,[newest]);
  expect((await db.query<{v:boolean}>(`select stage_telegram_voice_draft($1,'expired') v`,[newest])).rows[0].v).toBe(false);
  await db.exec(`select expire_telegram_voice_drafts()`);
  expect((await db.query<{status:string}>(`select status from telegram_voice_drafts where id=$1`,[newest])).rows[0].status).toBe('expired');
  // An older delivery cannot replace a newer draft, even after the newer one expires.
  const older='00000000-0000-0000-0000-000000000009';
  await db.query(`insert into telegram_webhook_events(id,update_id,event_type,sender_user_id,chat_id,received_at) values($1,'0','inbound_voice','u','c',now()+interval '1 minute')`,[older]);
  expect((await db.query(`select * from prepare_telegram_voice_draft($1,$2,'u','c')`,[older,senior])).rows).toHaveLength(0);
  // A new Telegram update sequence can restart below historical IDs after inactivity.
  await db.exec(`update telegram_voice_drafts set source_received_at=clock_timestamp()-interval '8 days'`);
  const restarted='00000000-0000-0000-0000-000000000012';
  await db.query(`insert into telegram_webhook_events(id,update_id,event_type,sender_user_id,chat_id) values($1,'2','inbound_voice','u','c')`,[restarted]);
  expect((await db.query(`select * from prepare_telegram_voice_draft($1,$2,'u','c')`,[restarted,senior])).rows).toHaveLength(1);
  await db.query(`delete from telegram_voice_drafts where event_id=$1`,[restarted]);
  const stale='00000000-0000-0000-0000-000000000011';
  await db.query(`insert into telegram_webhook_events(id,update_id,event_type,sender_user_id,chat_id,received_at) values($1,'20','inbound_voice','u','c',now()-interval '11 minutes')`,[stale]);
  expect((await db.query(`select * from prepare_telegram_voice_draft($1,$2,'u','c')`,[stale,senior])).rows).toHaveLength(0);
  expect((await db.query<{v:boolean}>(`select reserve_telegram_voice_inference($1) v`,[newest])).rows[0].v).toBe(false);
  await add(5); await add(6); expect(await add(7)).toBeUndefined();
  await db.exec(`update telegram_voice_drafts set created_at=clock_timestamp()-interval '2 minutes';
   with events as (insert into telegram_webhook_events(update_id,event_type,sender_user_id,chat_id) select 'budget:'||n,'inbound_voice','u','c' from generate_series(1,15) n returning id,update_id,received_at)
   insert into telegram_voice_drafts(event_id,senior_id,sender_user_id,chat_id,source_received_at,source_update_id,created_at,status)
   select id,'${senior}','u','c',received_at,'1',clock_timestamp()-interval '2 minutes','expired' from events;`);
  expect(await add(8)).toBeUndefined(); // expired drafts still consume the daily budget
  await db.exec(`update telegram_voice_drafts set sender_user_id='other';
   with events as (insert into telegram_webhook_events(update_id,event_type,sender_user_id,chat_id) select 'global:'||n,'inbound_voice','other','c' from generate_series(1,80) n returning id,update_id,received_at)
   insert into telegram_voice_drafts(event_id,senior_id,sender_user_id,chat_id,source_received_at,source_update_id,created_at,status)
   select id,'${senior}','other','c',received_at,'1',clock_timestamp()-interval '2 minutes','expired' from events;`);
  expect(await add(10)).toBeUndefined(); // global daily budget applies to another identity too
  expect((await db.query<{v:boolean}>(`select has_table_privilege('anon','telegram_voice_drafts','SELECT') v`)).rows[0].v).toBe(false);
  expect((await db.query<{v:boolean}>(`select has_function_privilege('authenticated','public.stage_telegram_voice_draft(uuid,text)','EXECUTE') v`)).rows[0].v).toBe(false);
  expect((await db.query<{v:boolean}>(`select has_function_privilege('service_role','public.stage_telegram_voice_draft(uuid,text)','EXECUTE') v`)).rows[0].v).toBe(true);
  await db.close();
 });
});
