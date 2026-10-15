import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { Client } from "pg";
import { runtimeLogin, runtimeConnectionUrls, replaceRuntimeDatabaseUrl } from "./neon-memory-runtime-support";

async function denied(client: Client, sql: string) {
  await client.query("BEGIN");
  try { await assert.rejects(client.query(sql), { code: "42501" }); }
  finally { await client.query("ROLLBACK"); }
}
async function main() {
  const args = process.argv.slice(2);
  assert.ok(args[0] === "--confirm-live" && (args.length === 1 || (args.length === 3 && args[1] === "--env-file")));
  const filename = args[2] ?? ".env.local";
  assert.match(filename, /^\.env(?:\.[a-z0-9-]+)?\.local$/);
  const path = resolve(filename);
  assert.ok((await lstat(path)).isFile());
  const original = await readFile(path, "utf8");
  const env = parseEnv(original);
  assert.ok(env.DATABASE_URL_UNPOOLED && env.DATABASE_URL);
  const ownerUrl = new URL(env.DATABASE_URL_UNPOOLED);
  assert.notEqual(ownerUrl.username, runtimeLogin);
  const savedUrl = new URL(env.DATABASE_URL);
  const password = savedUrl.username === runtimeLogin ? decodeURIComponent(savedUrl.password) : randomBytes(32).toString("hex");
  const urls = runtimeConnectionUrls(ownerUrl.href, savedUrl.href, password);
  ownerUrl.searchParams.set("sslmode", "verify-full");
  const owner = new Client({ connectionString: ownerUrl.href, connectionTimeoutMillis: 10000, query_timeout: 10000 });
  let created = false;
  let saved = false;
  try {
    await owner.connect();
    const existing = await owner.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [runtimeLogin]);
    if (existing.rowCount) {
      assert.equal(savedUrl.username, runtimeLogin, "Existing runtime role has no matching saved credential; refusing rotation");
    } else {
      await owner.query("BEGIN");
      try {
        const literal = await owner.query<{ value: string }>("SELECT quote_literal($1::text) AS value", [password]);
        await owner.query(`CREATE ROLE trustkaki_memory_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${literal.rows[0].value}`);
        await owner.query("GRANT trustkaki_memory_runtime TO trustkaki_memory_app");
        await owner.query("COMMIT"); created = true;
      } catch (error) { await owner.query("ROLLBACK"); throw error; }
    }
    const runtime = new Client({ connectionString: urls.pooled, connectionTimeoutMillis: 10000, query_timeout: 10000 });
    try {
      await runtime.connect();
      const role = await runtime.query("SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=session_user");
      assert.deepEqual(role.rows, [{ rolcanlogin: true, rolinherit: false, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false }]);
      const memberships = await runtime.query("SELECT r.rolname, m.admin_option FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member WHERE u.rolname=session_user ORDER BY r.rolname");
      assert.deepEqual(memberships.rows, [{ rolname: "trustkaki_memory_runtime", admin_option: false }]);
      const privileges = await runtime.query("SELECT pg_has_role(session_user,'neon_superuser','MEMBER') AS admin, has_database_privilege(current_database(),'CREATE') AS db_create, has_schema_privilege('public','CREATE') AS public_create");
      assert.deepEqual(privileges.rows, [{ admin: false, db_create: false, public_create: false }]);
      await denied(runtime, "SELECT id FROM personal_memory.records LIMIT 1");
      await denied(runtime, `CREATE SCHEMA fictional_${randomUUID().replaceAll("-", "")}`);
      await runtime.query("BEGIN");
      try {
        await runtime.query("SET LOCAL ROLE trustkaki_memory_runtime");
        const noScope = await runtime.query("SELECT count(*)::int AS n FROM personal_memory.records");
        assert.equal(noScope.rows[0].n, 0);
        await assert.rejects(runtime.query("DELETE FROM personal_memory.records WHERE false"), { code: "42501" });
      } finally { await runtime.query("ROLLBACK"); }
    } finally { await runtime.end(); }
    if (savedUrl.href !== urls.pooled) await replaceRuntimeDatabaseUrl(path, original, urls.pooled);
    saved = true;
    console.log(JSON.stringify({ passed: true, loginCreated: created, credentialsPrinted: false,
      runtimeOwner: false, superuserMembership: false, unscopedReadDenied: true, scopedRoleWithoutScopeReturnsZero: true,
      schemaCreationDenied: true, directDeleteDenied: true, otherEnvValuesPreserved: true,
      passwordRotated: false, branch: env.NEON_BRANCH ?? "unknown" }));
  } finally {
    if (created && !saved) await owner.query("DROP ROLE trustkaki_memory_app").catch(() => {});
    await owner.end();
  }
}
main().catch(() => { console.error("Neon runtime credential setup failed; environment was not updated. Credentials and SQL details withheld."); process.exitCode = 1; });
