import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, test } from "vitest";

const proposal = readFileSync("docs/operations/proposed-migrations/20261015070533_purge_legacy_personal_memory_copies.sql", "utf8");
const entries = [...proposal.matchAll(/\('([0-9a-f-]{36})','([0-9a-f]{32})'\)/g)];
const memoryIds = entries.slice(0, 5).map(match => match[1]);
const auditIds = entries.slice(5).map(match => match[1]);
const operational = "00000000-0000-4000-8000-000000000999";

async function fixture() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE senior_memories(id uuid PRIMARY KEY, application_tags text[] NOT NULL,
    content text, superseded_by_id uuid REFERENCES senior_memories(id));
    CREATE TABLE senior_context_events(id uuid PRIMARY KEY, context_id uuid, store text,
    context_key text NOT NULL, before_snapshot jsonb, after_snapshot jsonb, reason text, actor_system text);
    CREATE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'protected'; END $$;`);
  for (const id of memoryIds) await db.query("INSERT INTO senior_memories VALUES($1,'{}','fictional personal text',NULL)", [id]);
  await db.query("UPDATE senior_memories SET superseded_by_id=$1 WHERE id=$2", [memoryIds[1], memoryIds[0]]);
  await db.query("INSERT INTO senior_memories VALUES($1,ARRAY['trusted_contact_route'],'operational route',NULL)", [operational]);
  for (let i = 0; i < auditIds.length; i++) await db.query(`INSERT INTO senior_context_events VALUES
    ($1,$2,'memory','old-key','{"text":"fictional old text"}','{"text":"fictional newer text"}','old personal reason','fixture')`, [auditIds[i], memoryIds[i]]);
  await db.query(`INSERT INTO senior_context_events VALUES($1,$1,'memory','operational-key',NULL,'{"route":true}','operational reason','fixture')`, [operational]);
  let sql = proposal;
  for (const [index, entry] of entries.entries()) {
    const table = index < 5 ? "senior_memories" : "senior_context_events";
    const result = await db.query<{ digest: string }>(`SELECT md5(to_jsonb(t)::text) AS digest FROM ${table} t WHERE id=$1`, [entry[1]]);
    sql = sql.replace(entry[2], result.rows[0].digest);
  }
  await db.exec(`CREATE TRIGGER senior_memories_external_personal_guard BEFORE INSERT OR UPDATE OR DELETE
      ON senior_memories FOR EACH ROW EXECUTE FUNCTION reject_mutation();
    CREATE TRIGGER senior_context_events_append_only BEFORE UPDATE OR DELETE
      ON senior_context_events FOR EACH ROW EXECUTE FUNCTION reject_mutation();`);
  return { db, sql };
}

test("reviewed cleanup removes only legacy rows, scrubs snapshots and restores both guards", async () => {
  const { db, sql } = await fixture();
  try {
    await db.exec(sql);
    expect((await db.query("SELECT id,content FROM senior_memories")).rows).toEqual([{ id: operational, content: "operational route" }]);
    expect((await db.query("SELECT count(*)::int AS n FROM senior_context_events")).rows[0]).toEqual({ n: 5 });
    expect((await db.query("SELECT count(*)::int AS n FROM senior_context_events WHERE before_snapshot IS NULL AND after_snapshot IS NULL AND context_key='purged:personal-memory'")).rows[0]).toEqual({ n: 4 });
    await expect(db.exec("DELETE FROM senior_memories")).rejects.toThrow("protected");
    await expect(db.exec("DELETE FROM senior_context_events")).rejects.toThrow("protected");
  } finally { await db.close(); }
});

test("changed snapshot refuses cleanup before protections are disabled", async () => {
  const { db, sql } = await fixture();
  try {
    await db.exec("ALTER TABLE senior_memories DISABLE TRIGGER senior_memories_external_personal_guard");
    await db.query("UPDATE senior_memories SET content='changed' WHERE id=$1", [memoryIds[0]]);
    await db.exec("ALTER TABLE senior_memories ENABLE TRIGGER senior_memories_external_personal_guard");
    await expect(db.exec(sql)).rejects.toThrow("snapshot changed");
    await db.exec("ROLLBACK");
    expect((await db.query("SELECT count(*)::int AS n FROM senior_memories")).rows[0]).toEqual({ n: 6 });
    await expect(db.exec("DELETE FROM senior_memories")).rejects.toThrow("protected");
  } finally { await db.close(); }
});

test("failed postcondition rolls back deletions, snapshot changes and trigger state", async () => {
  const { db, sql } = await fixture();
  try {
    const broken = sql.replace("DO $$ BEGIN\n IF EXISTS", () => "UPDATE senior_memories SET content='unexpected side effect' WHERE id='" + operational + "';\nDO $$ BEGIN\n IF EXISTS");
    // Allow the deliberate side effect only while the transaction's guard is disabled.
    const injected = broken.replace("ALTER TABLE public.senior_memories ENABLE TRIGGER senior_memories_external_personal_guard;", "");
    await expect(db.exec(injected)).rejects.toThrow("postcondition failed");
    await db.exec("ROLLBACK");
    expect((await db.query("SELECT count(*)::int AS n FROM senior_memories")).rows[0]).toEqual({ n: 6 });
    expect((await db.query("SELECT count(*)::int AS n FROM senior_context_events WHERE after_snapshot IS NOT NULL")).rows[0]).toEqual({ n: 5 });
    await expect(db.exec("DELETE FROM senior_memories")).rejects.toThrow("protected");
    await expect(db.exec("DELETE FROM senior_context_events")).rejects.toThrow("protected");
  } finally { await db.close(); }
});
