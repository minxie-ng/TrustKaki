import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
it("freezes personal mutations while preserving operational context and audited classification", async () => {
 const db = new PGlite();
 try {
  await db.exec(`CREATE SCHEMA trustkaki_private;
   CREATE TABLE public.senior_memories(id uuid,senior_id uuid,context_key text,memory_type text,source text,application_tags text[],updated_at timestamptz,updated_by_system text);
   CREATE TABLE public.senior_context_events(senior_id uuid,store text,context_id uuid,context_key text,event_type text,reason text,before_snapshot jsonb,after_snapshot jsonb,actor_system text,command_id uuid);
   INSERT INTO senior_memories VALUES('00000000-0000-4000-8000-000000000321','00000000-0000-4000-8000-000000000001','seed:memory:family_context:00000000-0000-4000-8000-000000000321','family_context','caregiver_confirmed','{}',now(),NULL);`);
  await db.exec(await readFile(new URL('../../../supabase/migrations/20261015051653_neon_personal_memory_cutover.sql', import.meta.url),'utf8'));
  expect((await db.query<{application_tags:string[]}>("select application_tags from senior_memories")).rows[0].application_tags).toEqual(['trusted_contact_route']);
  expect((await db.query("select * from senior_context_events")).rows).toHaveLength(1);
  await expect(db.exec("insert into senior_memories(application_tags) values('{}')")).rejects.toThrow();
  await expect(db.exec("update senior_memories set application_tags='{}'")).rejects.toThrow();
  await db.exec("update senior_memories set updated_by_system='test'");
  await db.exec("delete from senior_memories");
 } finally { await db.close(); }
});
