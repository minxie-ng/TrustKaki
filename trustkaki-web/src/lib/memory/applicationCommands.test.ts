import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createApplicationMemoryCommands } from "./applicationCommands";
import { createPostgresMemoryStore, type ScopedMemorySql } from "./postgresStore";
import type { MemoryTransaction } from "./neonDatabase";
import type { SeniorContextActionCommand } from "@/lib/api/schemas";
import { retrievalEvaluationScope as scope } from "@/lib/agents/evaluation/memoryRetrievalCases";

let db: PGlite;
const now = "2026-10-15T00:00:00.000Z";
const later = "2026-10-15T00:01:00.000Z";
const caregiverId = "00000000-0000-4000-8000-000000000022";
const transact: MemoryTransaction = (s, work) => db.transaction(async tx => {
  await tx.exec("SET LOCAL ROLE trustkaki_memory_runtime");
  await tx.query("SELECT set_config('trustkaki.organisation_id',$1,true), set_config('trustkaki.senior_id',$2,true)", [s.organisationId, s.seniorId]);
  return work(async (sql, values) => (await tx.query(sql, values)).rows);
});
const execute: ScopedMemorySql = (s, sql, values) => transact(s, query => query(sql, values));
const model = "fictional-model";
const app = () => createApplicationMemoryCommands(transact, model);
const store = () => createPostgresMemoryStore(execute, model);
const proposal = () => ({
  commandId: crypto.randomUUID(),
  sourceMessage: { id: "00000000-0000-4000-8000-000000000033", sender: "senior" as const,
    text: "I always prefer porridge for breakfast.", timestamp: now },
  candidate: { contextKey: "breakfast", memoryType: "food_preference" as const,
    content: "Prefers porridge for breakfast", evidenceExcerpt: "I always prefer porridge for breakfast.",
    confidence: 0.95, applicationTags: ["practical_meal_prompt" as const],
    expiresAt: "2027-01-01T00:00:00.000Z", intent: "create" as "create" | "confirm" | "replace" },
});
const edit = (id: string, expectedUpdatedAt = now): Extract<SeniorContextActionCommand, { action: "correct"; store: "memory" }> => ({
  commandId: crypto.randomUUID(), action: "correct", store: "memory", contextId: id, expectedUpdatedAt,
  reason: "Caregiver confirmed this updated preference.",
  replacement: { contextKey: "breakfast", memoryType: "food_preference", content: "Prefers toast now",
    importance: 4, safeUseNotes: "Offer choices", applicationTags: ["practical_meal_prompt"], expiresAt: null },
});
beforeAll(async () => {
  db = await PGlite.create({ extensions: { vector } });
  await db.exec(await readFile("neon/migrations/001_personal_memory.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("TRUNCATE personal_memory.records, personal_memory.revisions, personal_memory.commands"); });
it("creates grounded personal memory with metadata and keeps exact retry stable after an edit", async () => {
  const input = proposal();
  const first = await app().automatic(scope, input);
  expect(first).toMatchObject({ version: 1, status: "active", duplicate: false });
  expect((await store().fetchSources(scope, [first.id]))[0]).toMatchObject({ content: input.candidate.evidenceExcerpt,
    sourceRef: `message:${input.sourceMessage.id}`, confirmedAt: now,
    metadata: { provenanceStatus: "verified_excerpt", sourceMessageId: input.sourceMessage.id, extractionMethod: "ai_extracted" } });
  await app().manual(scope, caregiverId, edit(first.id), later);
  expect(await app().automatic(scope, input)).toEqual({ ...first, duplicate: true });
  expect((await store().fetchSources(scope, [first.id]))[0].content).toBe("Prefers toast now");
  await expect(app().automatic(scope, { ...input, candidate: { ...input.candidate, content: "Changed" } })).rejects.toThrow("Memory conflict");
});
it("invalidates old vectors immediately, preserves caregiver attribution, and does not forge a senior quote", async () => {
  const first = await app().automatic(scope, proposal());
  await store().publishEmbedding(scope, first.id, 1, [1, ...Array(1023).fill(0)]);
  const input = edit(first.id); input.reason = "r".repeat(500);
  expect(await app().manual(scope, caregiverId, input, later)).toMatchObject({ version: 2, duplicate: false });
  const source = (await store().fetchSources(scope, [first.id]))[0];
  expect(source).toMatchObject({ version: 2, confirmedAt: later, sourceRef: `caregiver:${caregiverId}`,
    evidenceExcerpt: input.replacement.content,
    metadata: { provenanceStatus: "manual_confirmation", sourceMessageId: null, updatedByCaregiverId: caregiverId,
      extractionMethod: "admin_corrected", createdAt: now, updatedAt: later } });
  expect(await store().search({ scope, vector: [1, ...Array(1023).fill(0)], topK: 20, now: later })).toEqual([]);
  await expect(app().manual(scope, caregiverId, edit(first.id), later)).rejects.toThrow("Memory conflict");
  expect(await app().manual(scope, caregiverId, input, "2026-10-15T00:02:00.000Z")).toMatchObject({ version: 2, duplicate: true });
});
it("requires trusted senior-authored evidence and retains existing eligibility rules", async () => {
  const input = proposal();
  for (const changed of [
    { ...input, sourceMessage: { ...input.sourceMessage, sender: "system" } },
    { ...input, candidate: { ...input.candidate, evidenceExcerpt: "Made up quotation" } },
    { ...input, candidate: { ...input.candidate, confidence: 0.5 } },
    { ...input, candidate: { ...input.candidate, applicationTags: ["trusted_contact_route"] } },
    { ...input, candidate: { ...input.candidate, content: "My password is secret123" } },
  ]) await expect(app().automatic(scope, changed)).rejects.toThrow();
  expect((await db.query("SELECT count(*)::int AS n FROM personal_memory.records")).rows).toEqual([{ n: 0 }]);
});
it("conflicts on duplicate create, replacement without current memory, key changes and operational reclassification", async () => {
  const input = proposal(); const first = await app().automatic(scope, input);
  await expect(app().automatic(scope, proposal())).rejects.toThrow("Memory conflict");
  await expect(app().automatic(scope, { ...proposal(), candidate: { ...input.candidate, contextKey: "missing", intent: "replace" } })).rejects.toThrow("Memory conflict");
  const changeKey = edit(first.id); changeKey.replacement.contextKey = "different_key";
  await expect(app().manual(scope, caregiverId, changeKey, later)).rejects.toThrow("Memory conflict");
  const operational = edit(first.id); operational.replacement.applicationTags = ["accessibility_support"];
  await expect(app().manual(scope, caregiverId, operational, later)).rejects.toThrow("Operational context must stay in Supabase");
});
it("distinguishes a missing update target from duplicate creation without logging personal data", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const input = proposal();
    await expect(app().automatic(scope, { ...input, candidate: { ...input.candidate, intent: "confirm" } })).rejects.toThrow("Memory conflict");
    await app().automatic(scope, input);
    await expect(app().automatic(scope, proposal())).rejects.toThrow("Memory conflict");
    expect(log.mock.calls.map(([event]) => JSON.parse(event))).toEqual([
      { event: "personal_memory_conflict", reason: "update_target_missing" },
      { event: "personal_memory_conflict", reason: "create_target_exists" },
    ]);
    expect((await db.query("SELECT count(*)::int AS n FROM personal_memory.records")).rows).toEqual([{ n: 1 }]);
  } finally { log.mockRestore(); }
});
it("labels database conflicts without exposing the database error or changing it", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const error = Object.assign(new Error("Private database detail"), { code: "PT409" });
  const rejecting: MemoryTransaction = (s, work) => transact(s, query => work(async (sql, values) => {
    if (sql.includes("personal_memory.apply_command(")) throw error;
    return query(sql, values);
  }));
  try {
    await expect(createApplicationMemoryCommands(rejecting, model).automatic(scope, proposal())).rejects.toBe(error);
    expect(log.mock.calls).toEqual([[JSON.stringify({ event: "personal_memory_conflict", reason: "database_command" })]]);
  } finally { log.mockRestore(); }
});
it("archives with stable replay, hides from pending/search and rejects foreign edits", async () => {
  const first = await app().automatic(scope, proposal());
  const archive: SeniorContextActionCommand = { commandId: crypto.randomUUID(), store: "memory", action: "archive", contextId: first.id,
    expectedUpdatedAt: now, reason: "Caregiver archived this old preference" };
  await expect(app().manual({ ...scope, seniorId: crypto.randomUUID() }, caregiverId, archive, later)).rejects.toThrow("Memory conflict");
  expect(await app().manual(scope, caregiverId, archive, later)).toMatchObject({ version: 2, status: "superseded" });
  expect(await app().manual(scope, caregiverId, archive, later)).toMatchObject({ version: 2, duplicate: true });
  expect(await store().pending(scope, 20)).toEqual([]);
  await expect(app().automatic(scope, proposal())).rejects.toThrow("Memory conflict");
});
it("confirmation preserves current content and checks original request digest before reading changed state", async () => {
  const input = proposal(); const first = await app().automatic(scope, input);
  const confirm = { ...proposal(), sourceMessage: { ...input.sourceMessage, id: crypto.randomUUID(), timestamp: later },
    candidate: { ...input.candidate, content: input.candidate.evidenceExcerpt, intent: "confirm" as const } };
  expect(await app().automatic(scope, confirm)).toMatchObject({ id: first.id, version: 2 });
  expect((await store().fetchSources(scope, [first.id]))[0].content).toBe(input.candidate.evidenceExcerpt);
  expect(await app().automatic(scope, confirm)).toMatchObject({ version: 2, duplicate: true });
});

it("rejects a pending confirmation whose original content no longer matches the current fact", async () => {
  const input = proposal();
  await app().automatic(scope, input);
  await expect(app().automatic(scope, { ...proposal(), candidate: { ...input.candidate, content: "A different fact", intent: "confirm" } })).rejects.toThrow("Memory conflict");
});
it("stores policy-normalized evidence even when a generated summary contradicts it", async () => {
  const input = proposal(); input.candidate.content = "I prefer rice for breakfast";
  const first = await app().automatic(scope, input);
  expect((await store().fetchSources(scope, [first.id]))[0].content).toBe(input.candidate.evidenceExcerpt);
});

for (const condition of ["inactive_target", "missing_metadata"] as const) {
  it(`reports ${condition} without exposing content or changing the blocked record`, async () => {
    const input = proposal();
    const first = await app().automatic(scope, input);
    if (condition === "inactive_target") {
      await app().manual(scope, caregiverId, { commandId: crypto.randomUUID(), action: "archive", store: "memory",
        contextId: first.id, expectedUpdatedAt: now, reason: "Fictional archive protection test" }, later);
    } else {
      await db.query("UPDATE personal_memory.records SET source=source-'metadata' WHERE id=$1", [first.id]);
    }
    const before = (await db.query("SELECT source,status,version FROM personal_memory.records WHERE id=$1", [first.id])).rows;
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await expect(app().automatic(scope, proposal())).rejects.toThrow("Memory conflict");
      expect(log.mock.calls).toEqual([[JSON.stringify({ event: "personal_memory_conflict", reason: condition })]]);
      expect((await db.query("SELECT source,status,version FROM personal_memory.records WHERE id=$1", [first.id])).rows).toEqual(before);
    } finally { log.mockRestore(); }
  });
}
