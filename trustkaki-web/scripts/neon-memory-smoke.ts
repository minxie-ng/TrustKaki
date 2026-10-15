import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createPostgresMemoryStore } from "../src/lib/memory/postgresStore";
import { neonMemorySql } from "../src/lib/memory/neonDatabase";
import { retrievePersonalMemory } from "../src/lib/memory/retrieval";

async function main() {
  if (!process.argv.includes("--confirm-live")) throw new Error("Live fictional smoke confirmation required");
  const directUrl = new URL(process.env.DATABASE_URL_UNPOOLED!);
  const pooledUrl = new URL(process.env.DATABASE_URL!);
  assert.equal(directUrl.protocol, "postgresql:");
  assert.equal(pooledUrl.protocol, "postgresql:");
  assert.ok(directUrl.hostname.endsWith(".neon.tech"));
  assert.ok(!directUrl.hostname.includes("-pooler"));
  assert.equal(pooledUrl.hostname.replace("-pooler", ""), directUrl.hostname);
  assert.equal(pooledUrl.pathname, directUrl.pathname);
  assert.ok(["require", "verify-full"].includes(directUrl.searchParams.get("sslmode") ?? ""));
  directUrl.searchParams.set("sslmode", "verify-full");
  // Only this random scope is written or cleaned; no existing senior scope is used.
  const scope = { organisationId: randomUUID(), seniorId: randomUUID() };
  const now = "2026-10-15T00:00:00Z";
  const model = "fictional-lifecycle-1024-v1";
  const store = createPostgresMemoryStore(neonMemorySql, model);
  const vector = Array.from({ length: 1024 }, (_, i) => i === 0 ? 1 : 0);
  const id = "fictional-gardening";
  const source = { ...scope, id, contextKey: "activity_preference", content: "Fictional senior enjoys gardening",
    sourceRef: "fictional:smoke", evidenceExcerpt: "I enjoy gardening", confirmedAt: now, expiresAt: null,
    status: "active" as const, version: 1, conflictGroup: null, unresolvedConflict: false, safeUseNotes: null };
  const base = { commandId: randomUUID(), id, expectedVersion: 0, action: "put" as const,
    source, actor: "fictional-smoke", reason: "fictional lifecycle verification" };
  let failure: unknown;
  try {
    const created = await store.apply(scope, base);
    assert.equal(created.version, 1);
    assert.deepEqual(await store.apply(scope, base), created);
    assert.equal(await store.publishEmbedding(scope, id, 1, vector), true);
    const result = await retrievePersonalMemory({ seniorId: scope.seniorId, query: "What activity do I enjoy?", now }, {
      embeddingModel: model, indexEmbeddingModel: model, minimumScore: 0.2,
      resolveScope: async () => scope, embed: async () => vector,
      search: store.search, fetchSources: store.fetchSources,
    });
    assert.equal(result.status, "available"); assert.equal(result.items[0]?.id, id);
    const foreign = { ...scope, organisationId: randomUUID() };
    assert.deepEqual(await store.fetchSources(foreign, [id]), []);
    assert.deepEqual(await store.search({ scope: foreign, vector, topK: 20, now }), []);
    const corrections = await Promise.allSettled([1, 2].map(() => store.apply(scope, {
      ...base, commandId: randomUUID(), expectedVersion: 1,
      source: { ...source, version: 2, content: "Fictional senior now prefers painting" },
    })));
    assert.equal(corrections.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(corrections.filter(r => r.status === "rejected").length, 1);
    assert.deepEqual(await store.search({ scope, vector, topK: 20, now }), []);
    assert.equal(await store.publishEmbedding(scope, id, 1, vector), false);
    assert.equal(await store.publishEmbedding(scope, id, 2, vector), true);
    await store.apply(scope, { ...base, commandId: randomUUID(), action: "archive", expectedVersion: 2, source: undefined });
    assert.deepEqual(await store.search({ scope, vector, topK: 20, now }), []);
    await store.apply(scope, { ...base, commandId: randomUUID(), action: "erase", expectedVersion: 3, source: undefined });
    assert.deepEqual(await store.fetchSources(scope, [id]), []);
    assert.equal(await store.publishEmbedding(scope, id, 2, vector), false);
    await store.apply(scope, base);
    assert.deepEqual(await store.fetchSources(scope, [id]), []);
  } catch (error) { failure = error; }
  finally {
    const cleanup = new Client({ connectionString: directUrl.href, connectionTimeoutMillis: 10000 });
    try {
      await cleanup.connect();
      await cleanup.query("BEGIN");
      await cleanup.query("SELECT set_config('trustkaki.organisation_id',$1,true), set_config('trustkaki.senior_id',$2,true)", [scope.organisationId, scope.seniorId]);
      for (const table of ["revisions", "commands", "records"]) {
        await cleanup.query(`DELETE FROM personal_memory.${table} WHERE organisation_id=$1::uuid AND senior_id=$2::uuid`, [scope.organisationId, scope.seniorId]);
      }
      const remaining = await cleanup.query("SELECT count(*)::int AS n FROM personal_memory.records WHERE organisation_id=$1::uuid AND senior_id=$2::uuid", [scope.organisationId, scope.seniorId]);
      assert.equal(remaining.rows[0].n, 0);
      await cleanup.query("COMMIT");
    } finally { await cleanup.end(); }
  }
  if (failure) throw failure;
  console.log(JSON.stringify({ passed: true, sourceRoundTrip: true, idempotentReplay: true, concurrentCorrectionGuard: true, scopedVectorRetrieval: true,
    correctedVectorInvalidated: true, stalePublicationRejected: true, archivalExcluded: true, erasureVerified: true,
    fictionalScopeCleaned: true, semanticEmbeddingMeasured: false, branch: process.env.NEON_BRANCH ?? "unknown" }));
}
main().catch(() => { console.error("Neon fictional lifecycle smoke failed; no credentials or source content logged"); process.exitCode = 1; });
