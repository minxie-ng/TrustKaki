import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createPostgresMemoryStore, type ScopedMemorySql } from "./postgresStore";
import { retrievePersonalMemory } from "./retrieval";
import { fictionalRecord, retrievalEvaluationScope as scope, retrievalEvaluationTime as now } from "@/lib/agents/evaluation/memoryRetrievalCases";
import type { MemoryScope } from "./retrievalContracts";

let db: PGlite;
const model = "fictional-1024-v1";
const embedding = (axis = 0) => Array.from({ length: 1024 }, (_, i) => i === axis ? 1 : 0);
const source = (id = "gardening", version = 1) => fictionalRecord(id, "Enjoys gardening", { ...scope, version });
const command = (overrides = {}) => ({ commandId: crypto.randomUUID(), id: "gardening", expectedVersion: 0,
  action: "put" as const, source: source(), actor: "fictional-staff", reason: "confirmed preference", ...overrides });
const execute: ScopedMemorySql = async (s, text, values, signal) => {
  signal?.throwIfAborted();
  return db.transaction(async tx => {
    await tx.exec("SET LOCAL ROLE trustkaki_memory_runtime");
    await tx.query("SELECT set_config('trustkaki.organisation_id', $1, true), set_config('trustkaki.senior_id', $2, true)", [s.organisationId, s.seniorId]);
    return (await tx.query(text, values)).rows;
  });
};
const store = () => createPostgresMemoryStore(execute, model);
beforeAll(async () => {
  db = await PGlite.create({ extensions: { vector } });
  await db.exec(await readFile("neon/migrations/001_personal_memory.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("TRUNCATE personal_memory.records, personal_memory.revisions, personal_memory.commands"); });

it("creates a source once and returns the same receipt on exact replay", async () => {
  const c = command();
  const first = await store().apply(scope, c);
  expect(first).toEqual({ id: c.id, version: 1, status: "active" });
  expect(await store().apply(scope, c)).toEqual(first);
  expect(await store().fetchSources(scope, [c.id])).toEqual([source()]);
  expect((await db.query("SELECT count(*)::int AS n FROM personal_memory.commands")).rows).toEqual([{ n: 1 }]);
});
it("rejects command reuse with changed content and stale correction versions", async () => {
  const c = command(); await store().apply(scope, c);
  await expect(store().apply(scope, { ...c, reason: "different" })).rejects.toThrow("Memory conflict");
  await expect(store().apply(scope, command())).rejects.toThrow("Memory conflict");
  expect((await store().fetchSources(scope, [c.id]))[0].version).toBe(1);
});
it("uses cosine search and atomically hides an old vector on correction", async () => {
  await store().apply(scope, command());
  expect(await store().publishEmbedding(scope, "gardening", 1, embedding())).toBe(true);
  expect(await store().search({ scope, vector: embedding(), topK: 20, now })).toMatchObject([{ id: "gardening", score: 1, sourceVersion: 1, indexVersion: 1, embeddingModel: model }]);
  await store().apply(scope, command({ expectedVersion: 1, source: { ...source("gardening", 2), content: "Prefers painting now" } }));
  expect(await store().search({ scope, vector: embedding(), topK: 20, now })).toEqual([]);
  expect(await store().publishEmbedding(scope, "gardening", 1, embedding())).toBe(false);
  expect(await store().publishEmbedding(scope, "gardening", 2, embedding(1))).toBe(true);
  expect((await store().fetchSources(scope, ["gardening"]))[0].content).toBe("Prefers painting now");
});
it("filters expiry at the exact boundary and wrong embedding model", async () => {
  await store().apply(scope, command({ source: { ...source(), expiresAt: now } }));
  await store().publishEmbedding(scope, "gardening", 1, embedding());
  expect(await store().search({ scope, vector: embedding(), topK: 20, now })).toEqual([]);
  expect(await createPostgresMemoryStore(execute, "other-model").search({ scope, vector: embedding(), topK: 20, now })).toEqual([]);
});
it("scopes sources, vectors and commands by both organisation and senior", async () => {
  await store().apply(scope, command()); await store().publishEmbedding(scope, "gardening", 1, embedding());
  for (const foreign of [
    { ...scope, seniorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
    { ...scope, organisationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
  ]) {
    expect(await store().fetchSources(foreign, ["gardening"])).toEqual([]);
    expect(await store().search({ scope: foreign, vector: embedding(), topK: 20, now })).toEqual([]);
    expect(await store().publishEmbedding(foreign, "gardening", 1, embedding())).toBe(false);
    // RLS also denies a query that deliberately omits application predicates.
    expect(await execute(foreign, "SELECT id FROM personal_memory.records", [])).toEqual([]);
  }
  expect(await db.transaction(async tx => {
    await tx.exec("SET LOCAL ROLE trustkaki_memory_runtime");
    return (await tx.query("SELECT id FROM personal_memory.records")).rows;
  })).toEqual([]);
});
it("archives a record without losing its evidence and excludes it from search", async () => {
  await store().apply(scope, command()); await store().publishEmbedding(scope, "gardening", 1, embedding());
  await store().apply(scope, command({ action: "archive", source: undefined, expectedVersion: 1 }));
  expect((await store().fetchSources(scope, ["gardening"]))[0].status).toBe("superseded");
  expect(await store().search({ scope, vector: embedding(), topK: 20, now })).toEqual([]);
});
it("erases current and historical content and prevents old commands resurrecting it", async () => {
  const c = command(); await store().apply(scope, c);
  await store().apply(scope, command({ expectedVersion: 1, source: source("gardening", 2) }));
  await store().publishEmbedding(scope, "gardening", 2, embedding());
  await store().apply(scope, command({ action: "erase", source: undefined, expectedVersion: 2 }));
  expect(await store().fetchSources(scope, ["gardening"])).toEqual([]);
  expect(await store().publishEmbedding(scope, "gardening", 2, embedding())).toBe(false);
  await store().apply(scope, c);
  await expect(store().apply(scope, command({ expectedVersion: 3, source: source("gardening", 4) }))).rejects.toThrow("Memory conflict");
  expect((await db.query<{ context_key: string }>("SELECT context_key FROM personal_memory.records")).rows[0].context_key).not.toBe(source().contextKey);
  expect((await db.query("SELECT source, embedding FROM personal_memory.records")).rows).toEqual([{ source: null, embedding: null }]);
  expect((await db.query<{ snapshot: unknown; reason: unknown }>("SELECT snapshot, reason FROM personal_memory.revisions")).rows.every(r => r.snapshot === null && r.reason === null)).toBe(true);
});
it("exposes a bounded pending batch until current embeddings are published", async () => {
  await store().apply(scope, command());
  expect(await store().pending(scope, 10)).toEqual([source()]);
  await store().publishEmbedding(scope, "gardening", 1, embedding());
  expect(await store().pending(scope, 10)).toEqual([]);
});
it("rejects malformed or foreign writes, oversized reads and bad vectors before SQL", async () => {
  const sql = vi.fn(); const s = createPostgresMemoryStore(sql, model);
  await expect(s.apply(scope, command({ source: { ...source(), seniorId: crypto.randomUUID() } }))).rejects.toThrow();
  for (const bad of [[], embedding().slice(1), embedding().map(() => 0), embedding().map(() => NaN)]) {
    await expect(s.publishEmbedding(scope, "gardening", 1, bad)).rejects.toThrow();
  }
  await expect(s.fetchSources(scope, Array.from({ length: 21 }, (_, i) => String(i)))).rejects.toThrow();
  await expect(s.search({ scope, vector: embedding(), topK: 21, now })).rejects.toThrow();
  await expect(s.fetchSources({ ...scope, seniorId: "bad" } as MemoryScope, ["id"])).rejects.toThrow();
  expect(sql).not.toHaveBeenCalled();
});
it("sanitises database errors", async () => {
  const s = createPostgresMemoryStore(async () => { throw new Error("password and private fact"); }, model);
  await expect(s.fetchSources(scope, ["gardening"])).rejects.toThrow(/^Personal memory unavailable$/);
});

const metadata = () => ({ memoryType: "food_preference" as const, confidence: 0.9, importance: 4,
  applicationTags: ["practical_meal_prompt" as const], extractionMethod: "ai_extracted" as const,
  provenanceStatus: "verified_excerpt" as const, sourceMessageId: "00000000-0000-4000-8000-000000000031", sourceLabel: "chat",
  rememberedAt: now, followUpAfter: null, createdByCaregiverId: null, createdBySystem: "context_memory",
  updatedByCaregiverId: null, updatedBySystem: "context_memory", createdAt: now, updatedAt: now,
  legacyStatus: "active" as const, supersededById: null });
it("round trips metadata and long notes, preserves revisions, and erases their content", async () => {
  const original = { ...source(), metadata: metadata(), safeUseNotes: "n".repeat(500) };
  await store().apply(scope, command({ source: original }));
  expect(await store().fetchSources(scope, [original.id])).toEqual([original]);
  await store().apply(scope, command({ commandId: crypto.randomUUID(), expectedVersion: 1,
    source: { ...original, version: 2, metadata: { ...metadata(), importance: 3 } } }));
  const revisions = await db.query<{ snapshot: unknown }>("SELECT snapshot FROM personal_memory.revisions");
  expect(revisions.rows[0].snapshot).toEqual(original);
  await store().apply(scope, command({ commandId: crypto.randomUUID(), expectedVersion: 2, action: "erase", source: undefined }));
  expect((await db.query<{ snapshot: unknown }>("SELECT snapshot FROM personal_memory.revisions")).rows.every(row => row.snapshot === null)).toBe(true);
});
it("does not index or search records whose evidence is missing", async () => {
  const unverified = { ...source(), evidenceExcerpt: "", metadata: { ...metadata(), provenanceStatus: "missing_source" as const } };
  await store().apply(scope, command({ source: unverified }));
  expect(await store().pending(scope, 20)).toEqual([]);
  await store().publishEmbedding(scope, unverified.id, 1, embedding());
  expect(await store().search({ scope, vector: embedding(), topK: 20, now })).toEqual([]);
});

it("source validation excludes missing evidence even if a search adapter returns its hit", async () => {
  await store().apply(scope, command({ source: { ...source(), evidenceExcerpt: "", metadata: { ...metadata(), provenanceStatus: "missing_source" } } }));
  const result = await retrievePersonalMemory({ seniorId: scope.seniorId, query: "gardening", now }, {
    embeddingModel: model, indexEmbeddingModel: model, minimumScore: 0.2,
    resolveScope: async () => scope, embed: async () => embedding(), fetchSources: store().fetchSources,
    search: async () => [{ ...scope, id: "gardening", sourceVersion: 1, indexVersion: 1, embeddingModel: model, score: 1 }],
  });
  expect(result.status).toBe("empty");
  expect(result.items).toEqual([]);
});
it("lists canonical active sources and tags without requiring embeddings, with a hard read bound", async () => {
  await store().apply(scope, command());
  expect(await store().listActive(scope, now, 10)).toEqual([source()]);
  expect(await store().listActive({ ...scope, seniorId: crypto.randomUUID() }, now, 10)).toEqual([]);
  await expect(store().listActive(scope, now, 201)).rejects.toThrow();
  await store().apply(scope, command({ id: "second", source: source("second") }));
  await expect(store().listActive(scope, now, 1)).rejects.toThrow("Personal memory page limit exceeded");
});
