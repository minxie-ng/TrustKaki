import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { pilotRecords, pilotQuestions, retrievalEvaluationTime as now, retrievalDatasetVersion } from "../src/lib/agents/evaluation/memoryRetrievalCases";
import { createMemoryEmbeddings } from "../src/lib/memory/embeddings";
import { indexPendingMemory } from "../src/lib/memory/indexPending";
import { createPostgresMemoryStore } from "../src/lib/memory/postgresStore";
import { neonMemorySql } from "../src/lib/memory/neonDatabase";
import { retrievePersonalMemory } from "../src/lib/memory/retrieval";

async function main() {
  assert.deepEqual([...process.argv.slice(2)].sort(), ["--confirm-live", "--confirm-provider-budget"]);
  const required = (key: string) => { const value = process.env[key]?.trim(); assert.ok(value, "Missing benchmark configuration"); return value; };
  const budget = Number(required("TRUSTKAKI_MEMORY_PILOT_BUDGET_USD"));
  assert.ok(budget > 0 && budget <= 1, "Fictional pilot budget must be at most US$1");
  const minimumScore = Number(required("TRUSTKAKI_MEMORY_PILOT_MIN_SCORE"));
  assert.equal(minimumScore, 0.200106996389696, "Keep the independently calibrated threshold frozen");
  const model = required("TRUSTKAKI_MEMORY_EMBEDDING_MODEL");
  assert.equal(model, "llama-text-embed-v2", "Keep the comparison model frozen");
  const endpoint = required("TRUSTKAKI_MEMORY_EMBEDDING_ENDPOINT");
  assert.equal(endpoint, "https://api.pinecone.io/embed", "This approved pilot uses the existing embedding provider");
  const directUrl = new URL(required("DATABASE_URL_UNPOOLED"));
  const pooledUrl = new URL(required("DATABASE_URL"));
  assert.equal(directUrl.protocol, "postgresql:"); assert.equal(pooledUrl.protocol, "postgresql:");
  assert.ok(directUrl.hostname.endsWith(".neon.tech") && !directUrl.hostname.includes("-pooler"));
  assert.equal(pooledUrl.hostname.replace("-pooler", ""), directUrl.hostname);
  assert.equal(pooledUrl.pathname, directUrl.pathname);
  assert.ok(["require", "verify-full"].includes(directUrl.searchParams.get("sslmode") ?? ""));
  directUrl.searchParams.set("sslmode", "verify-full");
  const scope = { organisationId: randomUUID(), seniorId: randomUUID() };
  const embeddings = createMemoryEmbeddings({ endpoint, model, apiKey: required("TRUSTKAKI_MEMORY_PINECONE_API_KEY") });
  const store = createPostgresMemoryStore(neonMemorySql, model);
  const observations: Array<{ id: string; language: string; pass: boolean; forbidden: number; unavailable: boolean; reason: string | null; elapsedMs: number }> = [];
  let indexed = 0;
  let cleanupVerified = false;
  try {
    process.stderr.write("Creating isolated fictional Neon corpus\n");
    // Drain every in-flight fixture writer before cleanup, even when one fails.
    let cursor = 0;
    const writers = await Promise.allSettled(Array.from({ length: 3 }, async () => {
      while (cursor < pilotRecords.length) {
        const fixture = pilotRecords[cursor++];
        const source = { ...fixture, ...scope, version: 1, status: "active" as const };
        const base = { id: source.id, actor: "fictional-benchmark", reason: "fictional retrieval comparison" };
        await store.apply(scope, { ...base, commandId: randomUUID(), expectedVersion: 0, action: "put", source });
        if (fixture.status === "superseded") {
          await store.apply(scope, { ...base, commandId: randomUUID(), expectedVersion: 1, action: "archive" });
        } else if (fixture.version === 2) {
          await store.apply(scope, { ...base, commandId: randomUUID(), expectedVersion: 1, action: "put", source: { ...source, version: 2 } });
        }
      }
    }));
    assert.ok(writers.every(result => result.status === "fulfilled"), "Fictional corpus creation failed");
    process.stderr.write("Embedding pending facts and publishing guarded versions\n");
    for (let batch = 0; batch < 60; batch++) {
      const result = await indexPendingMemory(scope, store, embeddings.embedBatch, AbortSignal.timeout(30000));
      assert.equal(result.stale, 0);
      indexed += result.published;
      if (!result.attempted) break;
    }
    assert.equal(indexed, pilotRecords.filter(record => record.status === "active").length);
    const foreign = { ...scope, seniorId: randomUUID() };
    assert.deepEqual(await store.fetchSources(foreign, ["gardening"]), []);
    const probe = await embeddings.embed("gardening", AbortSignal.timeout(30000));
    assert.deepEqual(await store.search({ scope: foreign, vector: probe, now, topK: 20 }), []);
    process.stderr.write("Evaluating 30 frozen multilingual questions with live Neon sources\n");
    for (const question of pilotQuestions) {
      const result = await retrievePersonalMemory({ seniorId: scope.seniorId, query: question.query, now }, {
        embeddingModel: model, indexEmbeddingModel: model, minimumScore,
        resolveScope: async seniorId => seniorId === scope.seniorId ? scope : null,
        embed: embeddings.embed, search: store.search, fetchSources: store.fetchSources,
      });
      const keys = result.items.map(item => item.contextKey);
      observations.push({ id: question.id, language: question.language,
        pass: question.requiredKeys.every(key => keys.includes(key)),
        forbidden: keys.filter(key => question.forbiddenKeys.includes(key)).length,
        unavailable: result.status === "unavailable", reason: result.reason, elapsedMs: result.diagnostics.elapsedMs });
    }
  } finally {
    const cleanup = new Client({ connectionString: directUrl.href, connectionTimeoutMillis: 10000 });
    try {
      await cleanup.connect(); await cleanup.query("BEGIN");
      await cleanup.query("SELECT set_config('trustkaki.organisation_id',$1,true), set_config('trustkaki.senior_id',$2,true)", [scope.organisationId, scope.seniorId]);
      for (const table of ["revisions", "commands", "records"]) {
        await cleanup.query(`DELETE FROM personal_memory.${table} WHERE organisation_id=$1::uuid AND senior_id=$2::uuid`, [scope.organisationId, scope.seniorId]);
        const remaining = await cleanup.query(`SELECT count(*)::int AS n FROM personal_memory.${table} WHERE organisation_id=$1::uuid AND senior_id=$2::uuid`, [scope.organisationId, scope.seniorId]);
        assert.equal(remaining.rows[0].n, 0);
      }
      await cleanup.query("COMMIT"); cleanupVerified = true;
      process.stderr.write("Fictional records, revisions and receipts cleaned\n");
    } finally { await cleanup.end(); }
  }
  const languages = ["English", "Mandarin", "Singlish"].map(language => {
    const rows = observations.filter(row => row.language === language);
    return { language, queries: rows.length, recallAt6: rows.filter(row => row.pass).length / rows.length };
  });
  const durations = observations.map(row => row.elapsedMs).sort((a, b) => a - b);
  const p95Ms = durations[Math.ceil(durations.length * 0.95) - 1];
  const passedGate = observations.length === 30 && languages.every(row => row.recallAt6 >= 0.9) && p95Ms <= 1500
    && observations.every(row => !row.forbidden && !row.unavailable)
    && observations.filter(row => /^(gardening|contact)-/.test(row.id)).every(row => row.pass);
  console.log(JSON.stringify({ dataset: retrievalDatasetVersion, provider: "Neon Postgres with pgvector",
    sourceStore: "live Neon fictional source records", embeddingProvider: "Pinecone inference only; no vector-index calls",
    embeddingModel: model, dimensions: 1024, minimumScore, records: pilotRecords.length, indexed,
    semanticQualityMeasured: true, generationMeasured: false, crossSeniorIsolation: true, cleanupVerified,
    latencyScope: "warm database; query embedding + scoped search + source validation; excludes ingestion",
    languages, p95Ms, usage: embeddings.usage, declaredBudgetUsd: budget, budgetEnforcedByScript: false,
    dollarCost: "unmeasured; existing provider controls required", passedGate, observations }, null, 2));
  if (!passedGate) process.exitCode = 1;
}
main().catch(() => { console.error("Neon fictional semantic benchmark failed; provider details withheld. Check cleanup status above."); process.exitCode = 1; });
