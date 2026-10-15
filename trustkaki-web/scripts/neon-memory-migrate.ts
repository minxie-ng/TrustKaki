import { readFile } from "node:fs/promises";
import { Client } from "pg";

async function main() {
  if (!process.argv.includes("--confirm-live")) throw new Error("Live migration confirmation required");
  const migration = process.argv.find(arg => arg.startsWith("--migration="))?.slice(12) ?? "001_personal_memory";
  if (!["001_personal_memory", "002_index_retries"].includes(migration)) throw new Error("Unknown migration");
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) throw new Error("Direct database connection required");
  const url = new URL(connectionString);
  if (!url.hostname.endsWith(".neon.tech") || url.hostname.includes("-pooler") || !["require", "verify-full"].includes(url.searchParams.get("sslmode") ?? "")) throw new Error("Direct Neon TLS connection required");
  url.searchParams.set("sslmode", "verify-full");
  const client = new Client({ connectionString: url.href, connectionTimeoutMillis: 10000, query_timeout: 30000 });
  try {
    await client.connect();
    const existing = await client.query("SELECT to_regnamespace('personal_memory') IS NOT NULL AS present");
    if (migration === "001_personal_memory" && existing.rows[0].present) throw new Error("Personal memory schema already exists; migration not reapplied");
    if (migration === "002_index_retries") {
      if (!existing.rows[0].present) throw new Error("Foundation migration required");
      const applied = await client.query("SELECT to_regprocedure('personal_memory.claim_index_batch(text,integer,uuid,uuid)') IS NOT NULL AS present");
      if (applied.rows[0].present) throw new Error("Index retry migration already applied");
    }
    const sql = await readFile(new URL(`../neon/migrations/${migration}.sql`, import.meta.url), "utf8");
    await client.query(sql);
    console.log(JSON.stringify({ migration, applied: true, branch: process.env.NEON_BRANCH ?? "unknown", importedSeniorRecords: 0 }));
  } finally { await client.end(); }
}
main().catch(() => { console.error("Neon memory migration failed; no credentials or SQL payload logged"); process.exitCode = 1; });
