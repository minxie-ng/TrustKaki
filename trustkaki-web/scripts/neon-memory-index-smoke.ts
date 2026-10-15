import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { createPostgresMemoryStore } from "../src/lib/memory/postgresStore";
import { neonMemorySql } from "../src/lib/memory/neonDatabase";
import { indexPendingMemory } from "../src/lib/memory/indexPending";
import { processPendingMemory } from "../src/lib/memory/indexWorker";
import { fictionalRecord } from "../src/lib/agents/evaluation/memoryRetrievalCases";

async function main() {
  assert.ok(process.argv.includes("--confirm-live") && process.argv.includes("--confirm-provider-budget"));
  const rehearsal = process.argv.includes("--rehearsal");
  if (rehearsal) {
    const info = JSON.parse(await readFile("/tmp/trustkaki-index-rehearsal-branch.json", "utf8"));
    assert.equal(info.branch.project_id, "floral-hall-40623128");
    assert.equal(info.branch.name, "memory-index-retries-rehearsal");
    assert.equal(info.branch.parent_id, "br-hidden-bird-b3xbfqzo");
    assert.notEqual(info.branch.id, info.branch.parent_id);
    const endpoint = info.endpoints[0];
    assert.equal(endpoint.branch_id, info.branch.id);
    assert.ok(endpoint.host.endsWith(".neon.tech"));
    for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) {
      const url = new URL(process.env[key]!);
      url.hostname = endpoint.host;
      process.env[key] = url.href;
    }
  }
  const ownerUrl = new URL(process.env.DATABASE_URL_UNPOOLED!);
  ownerUrl.searchParams.set("sslmode", "verify-full");
  const owner = new Client({ connectionString: ownerUrl.href, connectionTimeoutMillis: 10000, query_timeout: 30000 });
  const scope = { organisationId: randomUUID(), seniorId: randomUUID() };
  const store = createPostgresMemoryStore(neonMemorySql, process.env.TRUSTKAKI_MEMORY_EMBEDDING_MODEL!);
  const deadline = () => AbortSignal.timeout(30000);
  const forceDue = async () => owner.query(`UPDATE personal_memory.records SET index_next_attempt_at='-infinity',
    index_lease_until=CASE WHEN index_lease_token IS NULL THEN NULL ELSE clock_timestamp()-interval '1 second' END
    WHERE organisation_id=$1 AND senior_id=$2`, [scope.organisationId, scope.seniorId]);
  let failure: unknown;
  try {
    await owner.connect();
    if (rehearsal) await owner.query(await readFile("neon/migrations/002_index_retries.sql", "utf8"));
    const runtimeUrl = new URL(process.env.DATABASE_URL!); runtimeUrl.searchParams.set("sslmode", "verify-full");
    const runtime = new Client({ connectionString: runtimeUrl.href, connectionTimeoutMillis: 10000 });
    try {
      await runtime.connect();
      await assert.rejects(runtime.query("SET ROLE trustkaki_memory_index_worker"), { code: "42501" });
      await runtime.query("BEGIN"); await runtime.query("SET LOCAL ROLE trustkaki_memory_runtime");
      assert.equal((await runtime.query("SELECT count(*)::int AS n FROM personal_memory.records")).rows[0].n, 0);
      await runtime.query("ROLLBACK");
    } finally { await runtime.end(); }
    const source = fictionalRecord(`retry-${randomUUID()}`, "Fictional senior enjoys gardening.", scope);
    const input = { commandId: randomUUID(), id: source.id, expectedVersion: 0, action: "put" as const,
      source, actor: "system:fictional_index_smoke", reason: "Disposable fictional retry verification" };
    await store.apply(scope, input);
    let calls = 0;
    const unavailable = async () => { calls++; throw new Error("Fictional provider outage"); };
    await assert.rejects(indexPendingMemory(scope, store, unavailable, deadline()));
    assert.deepEqual(await indexPendingMemory(scope, store, unavailable, deadline()), { attempted: 0, published: 0, stale: 0 });
    assert.equal(calls, 1);
    await forceDue(); const [oldClaim] = await store.claimPending(scope, 1);
    await forceDue(); const recovered = await processPendingMemory(deadline());
    assert.ok(recovered.published >= 1);
    assert.equal(await store.finishClaim(oldClaim, [1,...Array(1023).fill(0)]), false);
    const capped = fictionalRecord(`cap-${randomUUID()}`, "Fictional senior prefers short messages.", scope);
    const cappedInput = { ...input, id: capped.id, source: capped, commandId: randomUUID() };
    await store.apply(scope, cappedInput);
    for (let i=0;i<5;i++) { await forceDue(); await assert.rejects(indexPendingMemory(scope, store, unavailable, deadline())); }
    await forceDue();
    assert.equal((await indexPendingMemory(scope, store, unavailable, deadline())).attempted, 0);
    await store.apply(scope, cappedInput);
    assert.equal((await indexPendingMemory(scope, store, unavailable, deadline())).attempted, 0);
    await store.apply(scope, { ...cappedInput, commandId: randomUUID(), expectedVersion: 1, source: { ...capped, version: 2 } });
    assert.ok((await processPendingMemory(deadline())).published >= 1);
    const { rows } = await owner.query(`SELECT count(*)::int AS n FROM personal_memory.records
      WHERE organisation_id=$1 AND senior_id=$2 AND embedding IS NOT NULL AND index_version=version`, [scope.organisationId,scope.seniorId]);
    assert.equal(rows[0].n, 2);
  } catch (error) { failure = error; }
  finally {
    for (const table of ["revisions","commands","records"]) {
      await owner.query(`DELETE FROM personal_memory.${table} WHERE organisation_id=$1 AND senior_id=$2`, [scope.organisationId,scope.seniorId]);
      assert.equal((await owner.query(`SELECT count(*)::int AS n FROM personal_memory.${table} WHERE organisation_id=$1 AND senior_id=$2`, [scope.organisationId,scope.seniorId])).rows[0].n, 0);
    }
    await owner.end();
  }
  if (failure) throw failure;
  console.log(JSON.stringify({ passed:true, rehearsal, restrictedRoleCannotBecomeWorker:true, unscopedReadZero:true,
    providerFailureBackoff:true, crashLeaseRecovered:true, staleLeaseRejected:true, fiveAttemptCap:true,
    replayPreservesCap:true, correctionResetsCap:true, realEmbeddingRecovery:true, currentEmbeddings:2, fictionalFixturesCleaned:true }));
}
main().catch(() => { console.error("Index retry smoke failed; credentials and source data withheld"); process.exitCode=1; });
