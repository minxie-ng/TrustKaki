import { expect, it } from "vitest";
import { planLegacyBackfill } from "./legacyBackfill";
import type { Database } from "@/lib/supabase/types";
const seniorId = "00000000-0000-4000-8000-000000000001";
const organisationId = "00000000-0000-4000-8000-000000000002";
const id = "00000000-0000-4000-8000-000000000003";
const nextId = "00000000-0000-4000-8000-000000000004";
const row: Database["public"]["Tables"]["senior_memories"]["Row"] = {
 id, senior_id: seniorId, context_key: "communication_style", memory_type: "communication_preference",
 content: "I prefer short text", source: "caregiver_confirmed", source_message_id: null,
 confidence: 1, importance: 3, status: "active", remembered_at: "2026-07-01T00:00:00Z",
 follow_up_after: null, expires_at: null, safe_use_notes: null, extraction_method: "caregiver_confirmed",
 last_confirmed_at: "2026-07-01T00:00:00Z", superseded_by_id: null, application_tags: [],
 created_by_caregiver_id: null, created_by_system: "seed", updated_by_caregiver_id: null,
 updated_by_system: "seed", created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
};
const senior = { id: seniorId, organisation_id: organisationId };
it("preserves missing provenance and creates deterministic receipt without altering source", () => {
 const p = planLegacyBackfill([row], [senior], []);
 expect(p.groups).toHaveLength(1);
 expect(p.groups[0].source).toMatchObject({ id, status: "active", version: 1, evidenceExcerpt: "", metadata: { provenanceStatus: "missing_source" } });
 expect(planLegacyBackfill([row], [senior], [])).toEqual(p);
 expect(planLegacyBackfill([{ ...row, content: "Changed" }], [senior], []).digest).not.toBe(p.digest);
});
it("groups supersession history under the terminal ID without restoring an archived fact", () => {
 const first = { ...row, status: "superseded" as const, superseded_by_id: nextId };
 const last = { ...row, id: nextId, status: "archived" as const, content: "I prefer brief text", created_at: "2026-07-02T00:00:00Z" };
 const p = planLegacyBackfill([last,first], [senior], []);
 expect(p.groups).toHaveLength(1);
 expect(p.groups[0].source).toMatchObject({ id: nextId, version: 2, status: "superseded", metadata: { legacyStatus: "archived" } });
 expect(p.groups[0].history[0]).toMatchObject({ id, version: 1, content: row.content });
 expect(planLegacyBackfill([first,last], [senior], [])).toEqual(p);
});
it("retains tagged operational context and refuses ambiguous purpose or broken lineage", () => {
 expect(planLegacyBackfill([{ ...row, application_tags: ["trusted_contact_route"] }], [senior], []).operationalCount).toBe(1);
 expect(() => planLegacyBackfill([{ ...row, memory_type: "family_context" }], [senior], [])).toThrow();
 expect(() => planLegacyBackfill([{ ...row, id: nextId }, row], [senior], [])).toThrow();
 expect(() => planLegacyBackfill([{ ...row, superseded_by_id: nextId }], [senior], [])).toThrow();
 expect(() => planLegacyBackfill([row], [], [])).toThrow();
});
it("only verifies exact excerpts from the same senior-authored source message", () => {
 const r = { ...row, source_message_id: nextId, content: "I prefer short text" };
 expect(planLegacyBackfill([r], [senior], [{ id: nextId, senior_id: seniorId, sender: "senior", text: "Today I prefer short text please" }]).groups[0].source.metadata?.provenanceStatus).toBe("verified_excerpt");
 expect(planLegacyBackfill([r], [senior], [{ id: nextId, senior_id: seniorId, sender: "caregiver", text: r.content }]).groups[0].source.metadata?.provenanceStatus).toBe("missing_source");
 expect(planLegacyBackfill([r], [senior], [{ id: nextId, senior_id: nextId, sender: "senior", text: r.content }]).groups[0].source.metadata?.provenanceStatus).toBe("missing_source");
});

it("imports histories transactionally and refuses mismatched receipt replay", async () => {
 const { PGlite } = await import("@electric-sql/pglite");
 const { vector } = await import("@electric-sql/pglite-pgvector");
 const { readFile } = await import("node:fs/promises");
 const { importLegacyGroups } = await import("./legacyBackfill");
 const db = await PGlite.create({ extensions: { vector } });
 try {
  await db.exec(await readFile("neon/migrations/001_personal_memory.sql","utf8"));
  const plan = planLegacyBackfill([{ ...row,status: "superseded",superseded_by_id: nextId },{ ...row,id: nextId,status: "archived" }],[senior],[]);
  const query = async (sql:string, values:unknown[]) => (await db.query(sql,values)).rows;
  expect(await importLegacyGroups(query,plan.groups,"test-model")).toEqual({ imported: 1,replayed: 0 });
  expect(await importLegacyGroups(query,plan.groups,"test-model")).toEqual({ imported: 0,replayed: 1 });
  expect((await db.query("select id,version,status from personal_memory.records")).rows).toEqual([{id:nextId,version:2,status:"superseded"}]);
  expect((await db.query<{snapshot:{id:string}}>("select snapshot from personal_memory.revisions")).rows[0].snapshot.id).toBe(id);
  await expect(importLegacyGroups(query,[{...plan.groups[0],digest:'a'.repeat(64)}],"test-model")).rejects.toThrow();
  await db.exec("TRUNCATE personal_memory.records,personal_memory.commands,personal_memory.revisions");
  const duplicate = {...plan.groups[0],commandId:crypto.randomUUID(),source:{...plan.groups[0].source,id:crypto.randomUUID()}};
  await expect(db.transaction(tx => importLegacyGroups(async(sql,values)=>(await tx.query(sql,values)).rows,[plan.groups[0],duplicate],"test-model"))).rejects.toThrow();
  expect((await db.query("select * from personal_memory.records")).rows).toHaveLength(0);
  expect((await db.query("select * from personal_memory.commands")).rows).toHaveLength(0);
 } finally { await db.close(); }
},30000);
