import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { Client } from "pg";

// Explicit operational drill: damages disposable copies, never the production database.
const project = "floral-hall-40623128";
const production = "br-hidden-bird-b3xbfqzo";
const tables = ["records", "revisions", "commands"] as const;
let stage = "configuration";
const cli = (...args: string[]) => JSON.parse(execFileSync("neon", args, {
  encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"],
}));

function connection(value: string, host?: string) {
  const url = new URL(value);
  assert.equal(url.protocol, "postgresql:");
  assert.ok(url.hostname.endsWith(".neon.tech"));
  assert.ok(["require", "verify-full"].includes(url.searchParams.get("sslmode") ?? ""));
  assert.ok([...url.searchParams.keys()].every(key => ["sslmode", "channel_binding"].includes(key)));
  if (host) {
    assert.ok(host.endsWith(".neon.tech") && !host.includes("-pooler"));
    assert.notEqual(host, url.hostname.replace("-pooler", ""));
    url.hostname = host;
  } else assert.ok(!url.hostname.includes("-pooler"));
  url.searchParams.set("sslmode", "verify-full");
  return new Client({ connectionString: url.href, connectionTimeoutMillis: 10000, query_timeout: 30000 });
}

async function fingerprint(db: Client) {
  const result: Record<string, { count: number; digest: string }> = {};
  for (const table of tables) {
    const { rows } = await db.query(`SELECT to_jsonb(t) AS row FROM personal_memory.${table} t ORDER BY to_jsonb(t)::text LIMIT 1001`);
    assert.ok(rows.length <= 1000, "Drill limited to the bounded fictional demo corpus");
    result[table] = { count: rows.length, digest: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
  }
  return result;
}

async function main() {
  assert.ok(process.argv.includes("--confirm-live") && process.argv.includes("--confirm-disposable-branches"));
  const ownerUrl = process.env.DATABASE_URL_UNPOOLED!;
  const runtimeUrl = process.env.DATABASE_URL!;
  const productionInfo = cli("branches", "get", production, "--project-id", project, "-o", "json");
  assert.equal(productionInfo.name, "production");
  assert.equal(productionInfo.project_id, project);
  assert.equal(productionInfo.default, true);
  stage = "production_endpoint";
  const endpoints = cli("api", `/projects/${project}/branches/${production}/endpoints`);
  const productionHost = endpoints.endpoints.find((e: { type: string }) => e.type === "read_write")?.host;
  assert.ok(productionHost);
  assert.equal(new URL(ownerUrl).hostname, productionHost);
  assert.equal(new URL(runtimeUrl).hostname.replace("-pooler", ""), productionHost);
  const settings = cli("projects", "get", project, "-o", "json");
  assert.ok(settings.history_retention_seconds > 0);
  const original = connection(ownerUrl);
  const branches: string[] = [];
  const started = Date.now();
  let result: Record<string, unknown> | undefined;
  try {
    stage = "production_snapshot";
    await original.connect();
    await original.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const baseline = await fingerprint(original);
    assert.ok(baseline.records.count > 0);
    const lsn = (await original.query("SELECT pg_current_wal_lsn()::text AS lsn")).rows[0].lsn;
    assert.match(lsn, /^[0-9A-F]+\/[0-9A-F]+$/);
    await original.query("COMMIT");
    function branch(kind: string) {
      stage = `create_${kind}_branch`;
      const name = `memory-restore-${kind}-${randomUUID().slice(0, 8)}`;
      const info = cli("branches", "create", "--project-id", project, "--name", name,
        "--parent", lsn, "--expires-at", new Date(Date.now() + 3600000).toISOString(),
        "--no-secrets", "-o", "json");
      assert.notEqual(info.branch.id, production);
      assert.equal(info.branch.project_id, project);
      assert.equal(info.branch.name, name);
      assert.equal(info.branch.parent_id, production);
      branches.push(info.branch.id);
      const endpoint = info.endpoints.find((e: { branch_id: string }) => e.branch_id === info.branch.id);
      assert.ok(endpoint);
      return endpoint.host as string;
    }
    const damaged = connection(ownerUrl, branch("damage"));
    try {
      stage = "damage_copy";
      await damaged.connect();
      assert.deepEqual(await fingerprint(damaged), baseline);
      await damaged.query("BEGIN");
      for (const table of tables) await damaged.query(`DELETE FROM personal_memory.${table}`);
      await damaged.query("COMMIT");
      assert.ok(Object.values(await fingerprint(damaged)).every(value => value.count === 0));
    } finally { await damaged.end(); }

    // Recover to a new branch from the known production history point, not a damaged head.
    const host = branch("recovered");
    const recovered = connection(ownerUrl, host);
    const runtime = connection(runtimeUrl, host);
    let currentVectors = 0;
    try {
      stage = "verify_recovery";
      await recovered.connect();
      assert.deepEqual(await fingerprint(recovered), baseline);
      const rls = await recovered.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='personal_memory'
        AND c.relname=ANY($1::text[])`, [tables]);
      assert.equal(rls.rows.length, 3);
      assert.ok(rls.rows.every(row => row.relrowsecurity && row.relforcerowsecurity));
      const { rows } = await recovered.query(`SELECT organisation_id, senior_id, id, embedding::text AS vector
        FROM personal_memory.records WHERE status='active' AND embedding IS NOT NULL AND index_version=version`);
      currentVectors = rows.length;
      assert.ok(currentVectors > 0);
      await runtime.connect();
      await assert.rejects(runtime.query("SET ROLE trustkaki_memory_index_worker"), { code: "42501" });
      await runtime.query("BEGIN READ ONLY");
      await runtime.query("SET LOCAL ROLE trustkaki_memory_runtime");
      for (const table of tables) assert.equal((await runtime.query(`SELECT count(*)::int AS n FROM personal_memory.${table}`)).rows[0].n, 0);
      await runtime.query("SELECT set_config('trustkaki.organisation_id',$1,true), set_config('trustkaki.senior_id',$2,true)",
        [rows[0].organisation_id, randomUUID()]);
      assert.equal((await runtime.query("SELECT count(*)::int AS n FROM personal_memory.records")).rows[0].n, 0);
      await runtime.query("SELECT set_config('trustkaki.senior_id',$1,true)", [rows[0].senior_id]);
      const nearest = await runtime.query(`SELECT id FROM personal_memory.records WHERE status='active'
        AND embedding IS NOT NULL AND index_version=version ORDER BY embedding <=> $1::public.vector LIMIT 1`, [rows[0].vector]);
      assert.equal(nearest.rows[0].id, rows[0].id);
      await runtime.query("ROLLBACK");
    } finally { await runtime.end(); await recovered.end(); }
    assert.deepEqual(await fingerprint(original), baseline, "Production changed during the bounded drill");
    result = { passed: true, historyRetentionSeconds: settings.history_retention_seconds,
      recoveredRecords: baseline.records.count, recoveredRevisions: baseline.revisions.count,
      recoveredReceipts: baseline.commands.count, currentVectors,
      damagedCopyEmpty: true, historicalRecoveryMatched: true, scopedVectorRead: true,
      unscopedAndForeignDenied: true, productionUnchanged: true, elapsedSeconds: Math.ceil((Date.now() - started) / 1000) };
  } finally {
    await original.end();
    let cleanupFailed = false;
    for (const id of branches.reverse()) {
      try {
        execFileSync("neon", ["branches", "delete", id, "--project-id", project, "--yes"],
          { timeout: 120000, stdio: ["ignore", "pipe", "pipe"] });
      } catch { cleanupFailed = true; }
    }
    const remaining = cli("branches", "list", "--project-id", project, "-o", "json");
    assert.ok(branches.every(id => !remaining.some((b: { id: string }) => b.id === id)));
    assert.ok(remaining.some((b: { id: string }) => b.id === production));
    assert.equal(cleanupFailed, false, "Temporary branch cleanup failed");
  }
  console.log(JSON.stringify({ ...result, temporaryBranchesRemoved: true }));
}

main().catch(() => {
  console.error(`Memory restore drill failed at ${stage}; credentials and record content withheld. Check temporary branch cleanup.`);
  process.exitCode = 1;
});
