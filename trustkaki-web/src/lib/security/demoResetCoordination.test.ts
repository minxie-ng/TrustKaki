import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
let db: PGlite;
const senior = "00000000-0000-4000-8000-000000000001";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema trustkaki_private;
    create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('test.jwt',true),''),'{"role":"service_role","app_metadata":{"role":"demo_admin"}}')::jsonb$$;
    create function trustkaki_private.can_access_senior(uuid) returns boolean language sql as $$select true$$;
    create function trustkaki_private.orchestration_persistence_hmac(jsonb) returns text language sql as $$select md5($1::text)$$;
    create table seniors(id uuid primary key,risk_level text,last_check_in_at timestamptz);
    create table check_ins(id uuid,senior_id uuid,status text,completed_at timestamptz);
    create table messages(id uuid,check_in_id uuid,client_message_id text);
    create table senior_context_events(source_message_id uuid);
    create table trustkaki_private.orchestration_persistence_bindings(client_message_id text);`);
  for(const name of ['caregiver_actions','caregiver_queue_items','patterns','scheduled_jobs','briefs','alerts','risk_events']) await db.exec(`create table public.${name}(senior_id uuid)`);
  const dir=resolve('supabase/migrations');
  await db.exec(readFileSync(resolve(dir,'20260722025342_demo_reset_preserve_context_audit.sql'),'utf8'));
  await db.exec(readFileSync(resolve(dir,readdirSync(dir).find(n=>n.endsWith('_web_request_idempotency.sql'))!),'utf8'));
  const migration=readdirSync(dir).find(n=>n.endsWith('_demo_reset_web_coordination.sql'));
  if(migration) await db.exec(readFileSync(resolve(dir,migration),'utf8'));
},15000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec(`truncate seniors,trustkaki_private.web_orchestration_requests; insert into seniors values ('${senior}','red',now()); select set_config('test.jwt','',false);`);
});
async function claim(id:string,action='claim',payload:string|null=null,seniorId=senior) {
  return (await db.query<{result:{status:string}}>('select public.web_orchestration_request($1,$2,$3,$4,$5,$6,$7) result',[action,id,senior,seniorId,'hello',senior,payload])).rows[0].result;
}
it.each(['processing','persisting','retryable'])('blocks reset during %s without touching care state',async state=>{
  await claim('pending');
  if(state!=='processing') await claim('pending','snapshot','encrypted');
  if(state==='retryable') await claim('pending','release');
  await expect(db.query('select public.reset_trustkaki_demo()')).rejects.toMatchObject({code:'PT409'});
  expect((await db.query<{risk_level:string}>('select risk_level from seniors')).rows[0].risk_level).toBe('red');
});
it('does not assume an expired unfinished worker has stopped',async()=>{
  await claim('old'); await db.exec("update trustkaki_private.web_orchestration_requests set expires_at=now()-interval '1 day'");
  await expect(db.query('select public.reset_trustkaki_demo()')).rejects.toMatchObject({code:'PT409'});
});
it('invalidates completed replay payloads after reset but retains ID tombstones',async()=>{
  await claim('done');await claim('done','snapshot','snapshot');await claim('done','complete','reply');
  await db.query('select public.reset_trustkaki_demo()');
  expect((await claim('done')).status).toBe('expired');
  const rows=await db.query<{snapshot:string|null;response:string|null}>('select snapshot,response from trustkaki_private.web_orchestration_requests');
  expect(rows.rows).toEqual([{snapshot:null,response:null}]);
  expect((await claim('new')).status).toBe('run');
});
it('does not block reset for another senior pending request',async()=>{
  await claim('other','claim',null,'00000000-0000-4000-8000-000000000002');
  await expect(db.query('select public.reset_trustkaki_demo()')).resolves.toBeDefined();
});
it('keeps the demo-admin guard',async()=>{
  await db.exec(`select set_config('test.jwt','{"app_metadata":{"role":"caregiver"}}',false)`);
  await expect(db.query('select public.reset_trustkaki_demo()')).rejects.toMatchObject({code:'42501'});
});
