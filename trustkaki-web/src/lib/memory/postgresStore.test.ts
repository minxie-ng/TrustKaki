import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createPostgresMemoryStore, type ScopedMemorySql } from "./postgresStore";
import { retrievePersonalMemory } from "./retrieval";
import { indexPendingMemory } from "./indexPending";
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
  await db.exec(await readFile("neon/migrations/002_index_retries.sql", "utf8"));
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
it("backs off a failed embedding instead of charging again on the next read", async () => {
  await store().apply(scope, command());
  const embed = vi.fn().mockRejectedValue(new Error("provider unavailable"));
  await expect(indexPendingMemory(scope, store(), embed, AbortSignal.timeout(1000))).rejects.toThrow();
  expect(await indexPendingMemory(scope, store(), embed, AbortSignal.timeout(1000)))
    .toEqual({ attempted: 0, published: 0, stale: 0 });
  expect(embed).toHaveBeenCalledTimes(1);
});
it("leases claims once and fences a worker whose lease expired and was reclaimed", async () => {
  await store().apply(scope, command());
  const [old] = await store().claimPending(scope, 10);
  await db.exec("UPDATE personal_memory.records SET index_next_attempt_at='-infinity'");
  expect(await store().claimPending(null, 10)).toEqual([]);
  await db.exec("UPDATE personal_memory.records SET index_lease_until=clock_timestamp()-interval '1 second'");
  const [current] = await store().claimPending(null, 10);
  expect(current.leaseToken).not.toBe(old.leaseToken);
  expect(await store().finishClaim(old, embedding())).toBe(false);
  expect(await store().finishClaim(current, embedding())).toBe(true);
  expect(await store().claimPending(null, 10)).toEqual([]);
});
it("caps each version at five attempts, preserves cap on replay and resets on correction", async () => {
  const c = command(); await store().apply(scope, c);
  for (let attempt = 1; attempt <= 5; attempt++) {
    const [claim] = await store().claimPending(scope, 10);
    expect(claim).toBeDefined();
    const { rows } = await db.query<{ attempts: number; delay: number }>(`SELECT index_attempts AS attempts,
      extract(epoch FROM index_next_attempt_at-clock_timestamp())::float AS delay FROM personal_memory.records`);
    expect(rows[0].attempts).toBe(attempt);
    expect(rows[0].delay).toBeGreaterThan(15 * 60 * 2 ** (attempt - 1) - 10);
    await store().finishClaim(claim, null);
    expect(await store().claimPending(scope, 10)).toEqual([]);
    await db.exec("UPDATE personal_memory.records SET index_next_attempt_at='-infinity'");
  }
  expect(await store().claimPending(null, 10)).toEqual([]);
  await store().apply(scope, c);
  expect(await store().claimPending(scope, 10)).toEqual([]);
  await store().apply(scope, command({ expectedVersion: 1, source: source("gardening", 2) }));
  const [fresh] = await store().claimPending(scope, 10);
  expect(fresh.source.version).toBe(2);
  expect((await db.query("SELECT index_attempts FROM personal_memory.records")).rows).toEqual([{ index_attempts: 1 }]);
});
it("rejects a stale claim after a correction or archive", async () => {
  await store().apply(scope, command());
  const [claim] = await store().claimPending(scope, 10);
  await store().apply(scope, command({ expectedVersion: 1, source: source("gardening", 2) }));
  expect(await store().finishClaim(claim, embedding())).toBe(false);
  const [next] = await store().claimPending(scope, 10);
  await store().apply(scope, command({ expectedVersion: 2, action: "archive", source: undefined }));
  expect(await store().finishClaim(next, embedding())).toBe(false);
  expect(await store().claimPending(null, 10)).toEqual([]);
});
it("claims only eligible unexpired confirmed records for the requested model", async () => {
  for (const s of [source("good"), { ...source("expired"), expiresAt: new Date(Date.now()-1000).toISOString() },
    { ...source("future"), confirmedAt: new Date(Date.now()+60000).toISOString() },
    { ...source("missing"), evidenceExcerpt: "", metadata: { ...metadata(), provenanceStatus: "missing_source" as const } }]) {
    await store().apply(scope, command({ id: s.id, source: s }));
  }
  expect(await createPostgresMemoryStore(execute, "different-model").claimPending(null, 10)).toEqual([]);
  expect((await store().claimPending(null, 10)).map(c => c.source.id)).toEqual(["good"]);
});
it("keeps global discovery behind the bounded function without granting the worker role", async () => {
  await store().apply(scope, command());
  const foreign = { ...scope, seniorId: crypto.randomUUID() };
  expect(await store().claimPending(foreign, 10)).toEqual([]);
  expect(await execute(foreign, "SELECT source FROM personal_memory.records", [])).toEqual([]);
  const member = await db.query<{ member: boolean }>("SELECT pg_has_role('trustkaki_memory_runtime','trustkaki_memory_index_worker','MEMBER') AS member");
  expect(member.rows[0].member).toBe(false);
  expect((await store().claimPending(null, 1))).toHaveLength(1);
  await expect(store().claimPending(null, 21)).rejects.toThrow();
  await expect(execute(scope, "SELECT * FROM personal_memory.claim_index_batch($1,21,NULL,NULL)", [model])).rejects.toThrow();
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
