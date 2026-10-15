import "server-only";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { memoryScopeSchema } from "./retrievalContracts";
import type { ScopedMemorySql } from "./postgresStore";

let pool: Pool | undefined;
function databasePool(): Pool {
  if (pool) return pool;
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("Personal memory unavailable");
  let connectionString: string;
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech')
      || !['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '')) throw new Error();
    url.searchParams.set("sslmode", "verify-full");
    connectionString = url.href;
  } catch { throw new Error("Personal memory unavailable"); }
  pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 1500, idleTimeoutMillis: 5000,
    query_timeout: 1500, application_name: "trustkaki-personal-memory" });
  // Idle pool errors must not expose credentials or crash the process.
  pool.on("error", () => {});
  attachDatabasePool(pool);
  return pool;
}
export const neonMemorySql: ScopedMemorySql = async (scope, text, values, signal) => {
  memoryScopeSchema.parse(scope); signal?.throwIfAborted();
  let client;
  try { client = await databasePool().connect(); }
  catch { throw new Error("Personal memory unavailable"); }
  let released = false;
  const abort = () => { if (!released) { released = true; client.release(true); } };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE trustkaki_memory_runtime");
    await client.query(`SELECT set_config('trustkaki.organisation_id',$1,true),
      set_config('trustkaki.senior_id',$2,true), set_config('statement_timeout','1500ms',true)`,
    [scope.organisationId, scope.seniorId]);
    const result = await client.query(text, values);
    signal?.throwIfAborted();
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    if (!released) {
      try { await client.query("ROLLBACK"); }
      catch { abort(); }
    }
    if (error && typeof error === "object" && "code" in error && ["PT409", "23505"].includes(String(error.code))) {
      throw Object.assign(new Error("Memory conflict"), { code: "PT409" });
    }
    throw new Error("Personal memory unavailable");
  } finally {
    signal?.removeEventListener("abort", abort);
    if (!released) { released = true; client.release(); }
  }
};
export async function personalMemoryDatabaseHealth(): Promise<{ configured: boolean; reachable: boolean | null }> {
  if (!process.env.DATABASE_URL?.trim()) return { configured: false, reachable: null };
  try {
    const rows = await neonMemorySql({ organisationId: "00000000-0000-4000-8000-000000000000", seniorId: "00000000-0000-4000-8000-000000000000" },
      "SELECT count(*)::int AS n FROM personal_memory.records WHERE organisation_id=$1::uuid AND senior_id=$2::uuid",
      ["00000000-0000-4000-8000-000000000000", "00000000-0000-4000-8000-000000000000"]);
    return { configured: true, reachable: rows.length === 1 };
  } catch { return { configured: true, reachable: false }; }
}
