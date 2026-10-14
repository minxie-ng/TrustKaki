// Isolated PostgreSQL checks; no Supabase connection or messaging credentials.
// Install PGlite in a temporary directory; pass its entry path as argument 1.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migration = new URL("../supabase/migrations/20261014143934_bounded_proactive_retries.sql", import.meta.url);
const original = await readFile(new URL("../supabase/migrations/20260715084838_gate_4_proactive_check_ins.sql", import.meta.url), "utf8");
const claimSql = original.slice(original.indexOf("create or replace function public.claim_due_proactive_check_in_jobs("), original.indexOf("create or replace function public.advance_proactive_check_in_job("));
const ids = [1, 2, 3, 4].map((n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const [senior, schedule, workflow, job] = ids;
const now = "2026-10-14T01:00:00Z";
let checks = 0;
async function query(sql, params = []) { return (await db.query(sql, params)).rows; }
async function seed(attempts) {
  await db.exec("truncate scheduled_jobs, proactive_check_in_workflows, proactive_check_in_schedules, proactive_check_in_events");
  await query("insert into proactive_check_in_schedules(id, enabled) values ($1, true)", [schedule]);
  await query("insert into proactive_check_in_workflows(id, status) values ($1, 'pending_initial_send')", [workflow]);
  await query(`insert into scheduled_jobs(id, senior_id, schedule_id, workflow_id, status, stage,
    attempt_count, claimed_by, claim_expires_at, scheduled_for, created_at)
    values ($1,$2,$3,$4,'running','initial_send',$5,'worker','2026-10-14T01:05:00Z',$6,$6)`, [job, senior, schedule, workflow, attempts, now]);
}
async function retry(category, worker = "worker") {
  return query("select retry_proactive_check_in_job($1,$2,$3,'2026-10-14T01:05:00Z',$4)", [job, worker, category, now]);
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.jwt() returns jsonb language sql as $$
      select current_setting('request.jwt.claims')::jsonb $$;
    set request.jwt.claims = '{"role":"service_role"}';
    create table proactive_check_in_schedules(id uuid primary key, enabled boolean,
      paused_at timestamptz, pause_reason text, updated_at timestamptz);
    create table proactive_check_in_workflows(id uuid primary key, status text, updated_at timestamptz);
    create table scheduled_jobs(id uuid primary key, senior_id uuid, schedule_id uuid, workflow_id uuid,
      status text, stage text, attempt_count integer, claimed_by text, claim_expires_at timestamptz,
      scheduled_for timestamptz, next_eligible_at timestamptz, created_at timestamptz, updated_at timestamptz,
      cancelled_at timestamptz, last_error_category text, send_intent_at timestamptz,
      send_reconciliation_required_at timestamptz);
    create table proactive_check_in_events(senior_id uuid, schedule_id uuid, workflow_id uuid,
      event_type text constraint proactive_check_in_events_event_type_check check (event_type in ('job_retry_scheduled')),
      summary jsonb);
  `);
  await db.exec(await readFile(migration, "utf8"));
  await db.exec(claimSql);

  await seed(1);
  await retry("processor_error");
  assert.equal((await query("select status from scheduled_jobs"))[0].status, "failed");
  assert.equal((await query("select count(*)::int as n from proactive_check_in_events"))[0].n, 1);
  checks++;

  for (const attempts of [5, 15018]) {
    await seed(attempts);
    await retry("processor_error");
    const row = (await query("select status, last_error_category from scheduled_jobs"))[0];
    assert.deepEqual(row, { status: "cancelled", last_error_category: "retry_exhausted" });
    assert.equal((await query("select status from proactive_check_in_workflows"))[0].status, "failed");
    assert.ok((await query("select paused_at from proactive_check_in_schedules"))[0].paused_at);
    assert.equal((await query("select event_type from proactive_check_in_events"))[0].event_type, "job_failed");
    assert.equal((await query("select * from claim_due_proactive_check_in_jobs(10,'other','2026-10-15T01:00:00Z')")).length, 0);
    await assert.rejects(retry("processor_error"), /stale/);
    checks++;
  }

  for (const category of ["messaging_identity_missing", "unsupported_transport"]) {
    await seed(1);
    await retry(category);
    assert.equal((await query("select status from scheduled_jobs"))[0].status, "cancelled");
    checks++;
  }

  for (const category of ["quiet_hours", "not_due", "paused"]) {
    await seed(3);
    await retry(category);
    assert.equal((await query("select attempt_count from scheduled_jobs"))[0].attempt_count, 2);
    assert.equal((await query("select count(*)::int as n from proactive_check_in_events"))[0].n, 0);
    assert.equal((await query("select * from claim_due_proactive_check_in_jobs(10,'other','2026-10-14T01:01:00Z')")).length, 0);
    checks++;
  }

  await seed(3);
  await retry("processor_error");
  assert.equal((await query("select next_eligible_at from scheduled_jobs"))[0].next_eligible_at.toISOString(), "2026-10-14T01:20:00.000Z");
  checks++;

  for (const stage of ["initial_deadline", "retry_send", "final_deadline"]) {
    await seed(5);
    await query("update scheduled_jobs set stage = $1", [stage]);
    await retry("processor_error");
    assert.equal((await query("select status from scheduled_jobs"))[0].status, "cancelled");
    checks++;
  }

  await seed(5);
  await query("update scheduled_jobs set send_intent_at = $1", [now]);
  await retry("processor_error");
  const uncertain = (await query("select last_error_category, send_reconciliation_required_at from scheduled_jobs"))[0];
  assert.equal(uncertain.last_error_category, "unresolved_send_intent");
  assert.ok(uncertain.send_reconciliation_required_at);
  assert.equal((await query("select event_type from proactive_check_in_events"))[0].event_type, "send_reconciliation_required");
  checks++;

  await seed(2);
  await query("update scheduled_jobs set claim_expires_at = $1", [now]);
  await assert.rejects(retry("processor_error"), /stale/);
  checks++;

  await seed(2);
  await assert.rejects(retry("processor_error", "stale-worker"), /stale/);
  assert.equal((await query("select status from scheduled_jobs"))[0].status, "running");
  checks++;

  await db.exec(`set request.jwt.claims = '{"role":"authenticated"}'`);
  await assert.rejects(retry("processor_error"), /Forbidden/);
  for (const role of ["anon", "authenticated"]) {
    assert.equal((await query(`select has_function_privilege('${role}',
      'public.retry_proactive_check_in_job(uuid,text,text,timestamptz,timestamptz)', 'EXECUTE') as allowed`))[0].allowed, false);
  }
  checks++;
  console.log(`${checks} isolated PostgreSQL checks passed: ${fileURLToPath(migration)}`);
} finally {
  await db.close();
}
