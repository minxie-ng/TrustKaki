# Gate 4 Proactive Check-ins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send durable senior-specific Telegram check-ins, allow a two-hour response window and one retry with a one-hour response window, then create one Yellow caregiver case when both attempts receive no response.

**Architecture:** Vercel Cron calls a protected bounded processor. Supabase stores schedules, workflow state, and atomically claimed jobs; a pure state module determines stage transitions, while a Telegram transport adapter sends messages. Inbound Telegram persistence closes pending workflows or annotates an already-created case.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Supabase Postgres/RPC/RLS, Telegram Bot API, Vercel Cron, Vitest.

---

## File Map

- Create `supabase/migrations/20260715084838_gate_4_proactive_check_ins.sql`: schedules, workflow state, job hardening, transactional commands, RLS.
- Create `supabase/migrations/20260715093952_gate_4_next_run_lint_remediation.sql`: remove the next-run helper's shadowed loop variable after linked database lint.
- Create `src/lib/checkins/contracts.ts`: typed schedule, job, workflow, and processor contracts.
- Create `src/lib/checkins/policy.ts`: pure timing, quiet-hour, cancellation, and stage decisions.
- Create `src/lib/checkins/service.ts`: bounded job execution and Telegram sends.
- Create `src/lib/persistence/proactiveCheckInRepository.ts`: database reads and RPC calls only.
- Create `src/app/api/internal/check-ins/process-due/route.ts`: protected cron/manual processor entry point.
- Create `src/app/api/admin/seniors/[seniorId]/check-in-schedule/route.ts`: admin read/update/pause/manual-run API.
- Create `src/components/dashboard/ProactiveCheckInPanel.tsx`: concise admin schedule status and controls.
- Modify `src/lib/telegram/service.ts`: notify the check-in workflow after inbound message persistence.
- Modify `src/components/Dashboard.tsx`: mount the small schedule panel without redesigning the dashboard.
- Modify `src/lib/supabase/types.ts`, `.env.example`, `vercel.json`, roadmap, and handoff.

### Task 1: Database foundation and security

**Files:**
- Create: `supabase/migrations/20260715084838_gate_4_proactive_check_ins.sql`
- Create: `src/lib/security/gate4ProactiveCheckInsMigration.test.ts`
- Modify: `src/lib/supabase/types.ts`

- [x] **Step 1: Write the failing migration contract test**

Assert that the migration contains `proactive_check_in_schedules`,
`proactive_check_in_workflows`, an idempotency key on `scheduled_jobs`, private
claim/complete commands, authenticated admin policies, service-role processor
grants, and no anon write grants.

```ts
expect(sql).toContain("create table public.proactive_check_in_schedules");
expect(sql).toContain("unique (idempotency_key)");
expect(sql).toContain("claim_due_proactive_check_in_jobs");
expect(sql).not.toMatch(/grant (insert|update|delete).* to anon/i);
```

- [x] **Step 2: Run the test and verify RED**

Run: `npm test -- src/lib/security/gate4ProactiveCheckInsMigration.test.ts`
Expected: FAIL because the migration does not exist.

- [x] **Step 3: Add the migration and generated TypeScript table shapes**

Use these bounded values:

```sql
initial_response_minutes integer not null default 120 check (initial_response_minutes between 1 and 1440),
retry_response_minutes integer not null default 60 check (retry_response_minutes between 1 and 1440),
stage text not null check (stage in ('initial_send','initial_deadline','retry_send','final_deadline')),
idempotency_key text not null unique,
claim_expires_at timestamptz,
attempt_count integer not null default 0
```

Add one transactional command for schedule updates/pause/manual-run, one
`security definer` service-role claim command using `for update skip locked`, and
commands for completing, retrying, responding, final escalation, and late reply.
All commands must set a locked `search_path`, authorize the senior, and preserve
existing policy risk.

- [x] **Step 4: Run focused migration and type checks**

Run: `npm test -- src/lib/security/gate4ProactiveCheckInsMigration.test.ts && npm run typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add supabase/migrations/20260715084838_gate_4_proactive_check_ins.sql src/lib/security/gate4ProactiveCheckInsMigration.test.ts src/lib/supabase/types.ts
git commit -m "feat: add proactive check-in persistence"
```

### Task 2: Pure timing and transition policy

**Files:**
- Create: `src/lib/checkins/contracts.ts`
- Create: `src/lib/checkins/policy.ts`
- Create: `src/lib/checkins/policy.test.ts`

- [x] **Step 1: Write failing policy tests**

Cover initial send, no retry before 120 minutes, exactly one retry after 120
minutes, final escalation after 60 additional minutes, timely cancellation,
late-response annotation, paused schedules, and quiet hours.

```ts
expect(nextAction(initialDeadline, at119Minutes)).toEqual({ type: "wait" });
expect(nextAction(initialDeadline, at120Minutes)).toEqual({ type: "send_retry" });
expect(nextAction(finalDeadline, at59Minutes)).toEqual({ type: "wait" });
expect(nextAction(finalDeadline, at60Minutes)).toEqual({ type: "create_case" });
```

- [x] **Step 2: Run the test and verify RED**

Run: `npm test -- src/lib/checkins/policy.test.ts`
Expected: FAIL because the policy module does not exist.

- [x] **Step 3: Implement the smallest pure state functions**

Export `nextProactiveAction`, `isWithinQuietHours`, and
`responseDisposition`. Do not call Supabase, Telegram, or the system clock from
this file; pass `now` explicitly.

- [x] **Step 4: Run policy tests and typecheck**

Run: `npm test -- src/lib/checkins/policy.test.ts && npm run typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/checkins
git commit -m "feat: define proactive check-in policy"
```

### Task 3: Repository commands and concurrent job claims

**Files:**
- Create: `src/lib/persistence/proactiveCheckInRepository.ts`
- Create: `src/lib/persistence/proactiveCheckInRepository.test.ts`
- Create: `src/lib/security/gate4ProactiveCheckIns.integration.test.ts`

- [x] **Step 1: Write failing repository tests**

Mock Supabase and prove that repository methods call only the migration RPCs,
parse results with Zod, and never return transport identity secrets to client
code.

- [x] **Step 2: Implement repository methods**

Provide only domain-specific methods:

```ts
readScheduleForSenior(seniorId)
saveScheduleCommand(accessToken, command)
claimDueJobs(limit, workerId, now)
completeJob(command)
retryJob(command)
recordSeniorResponse(seniorId, messageId, respondedAt)
```

- [x] **Step 3: Add live two-worker integration coverage**

Create temporary admin/caregiver/senior rows. Insert one due job, claim from two
service clients concurrently, and assert exactly one claim. Complete twice and
assert one effect. Confirm an unrelated caregiver cannot read or mutate the
schedule.

- [x] **Step 4: Run focused tests, apply the complete migration, then run the live suite**

Run: `npm test -- src/lib/persistence/proactiveCheckInRepository.test.ts`
Run: `supabase db push`
Run: `TRUSTKAKI_RUN_LIVE_SUPABASE=1 npm test -- src/lib/security/gate4ProactiveCheckIns.integration.test.ts`
Expected: PASS with one claimed job and no duplicate effect.

Evidence (2026-07-15): repository and migration tests passed 10/10; the live
two-worker/RLS suite passed 2/2; migrations `20260715084838` and
`20260715093952` are aligned locally and remotely. Linked database lint reports
no Gate 4 warnings; one pre-existing `reset_trustkaki_demo` cast warning remains.

- [x] **Step 5: Commit**

```bash
git add src/lib/persistence/proactiveCheckInRepository.ts src/lib/persistence/proactiveCheckInRepository.test.ts src/lib/security/gate4ProactiveCheckIns.integration.test.ts
git commit -m "feat: add durable proactive job commands"
```

### Task 4: Telegram check-in sender and bounded processor

**Files:**
- Create: `src/lib/checkins/service.ts`
- Create: `src/lib/checkins/service.test.ts`
- Modify: `src/lib/persistence/seniorMessagingIdentityRepository.ts`
- Modify: `src/lib/persistence/seniorMessagingIdentityRepository.test.ts`

- [x] **Step 1: Write failing service tests**

Prove one initial send, one retry, no second retry, quiet-hour deferral,
transport failure classification, and idempotent resume after provider
acceptance. Mock time, repository, identity lookup, and Telegram client.

- [x] **Step 2: Implement bounded processing**

`processDueProactiveJobs({ limit, workerId, now, outboundClient })` claims at
most `limit` jobs and processes each independently. Persist provider acceptance
before scheduling a deadline. Do not run LLM orchestration for a routine
outbound check-in.

- [x] **Step 3: Run focused tests**

Run: `npm test -- src/lib/checkins/service.test.ts src/lib/persistence/seniorMessagingIdentityRepository.test.ts`
Expected: PASS.

Evidence (2026-07-15): 16/16 focused processor, identity, and repository tests
passed with typecheck and focused lint. Provider acceptance is persisted before
opening a response deadline, and recovery skips a duplicate Telegram send.
Gate 4 uses a fixed 22:00-07:00 quiet window in the schedule timezone.

- [x] **Step 4: Commit**

```bash
git add src/lib/checkins/service.ts src/lib/checkins/service.test.ts src/lib/persistence/seniorMessagingIdentityRepository.ts src/lib/persistence/seniorMessagingIdentityRepository.test.ts
git commit -m "feat: process proactive telegram check-ins"
```

### Task 5: Cron route and Vercel configuration

**Files:**
- Create: `src/app/api/internal/check-ins/process-due/route.ts`
- Create: `src/app/api/internal/check-ins/process-due/route.test.ts`
- Create: `vercel.json`
- Modify: `.env.example`

- [x] **Step 1: Write failing route authorization tests**

Prove missing/wrong `Authorization: Bearer <CRON_SECRET>` returns 401 without
processing, valid secret processes a bounded batch, and responses contain only
counts/statuses.

- [x] **Step 2: Implement the protected GET/POST route**

Use constant-time secret comparison, `runtime = "nodejs"`, a bounded limit, and
safe error categories. Never return raw job payloads, destinations, or errors.

- [x] **Step 3: Add five-minute cron configuration and env documentation**

```json
{
  "crons": [{
    "path": "/api/internal/check-ins/process-due",
    "schedule": "*/5 * * * *"
  }]
}
```

Document `CRON_SECRET`; do not modify `.env.local`.

- [x] **Step 4: Run route tests and build**

Run: `npm test -- src/app/api/internal/check-ins/process-due/route.test.ts && npm run build`
Expected: PASS.

Evidence (2026-07-15): 13/13 focused route and processor tests passed with
typecheck, focused lint, and a production build. The route processes at most 10
jobs and returns aggregate counts only.

- [x] **Step 5: Commit**

```bash
git add src/app/api/internal/check-ins/process-due .env.example vercel.json
git commit -m "feat: schedule proactive check-in processor"
```

### Task 6: Inbound response and caregiver-case integration

**Files:**
- Modify: `src/lib/telegram/service.ts`
- Modify: `src/lib/telegram/service.test.ts`
- Modify: `src/lib/persistence/proactiveCheckInRepository.ts`
- Modify: `src/lib/persistence/proactiveCheckInRepository.test.ts`
- Modify: `src/lib/supabase/types.ts`

- [x] **Step 1: Write failing response tests**

After inbound message persistence, assert that a timely response cancels pending
jobs and creates no case. Assert that a response after escalation records
`senior_replied_after_escalation` and leaves the case active.

- [x] **Step 2: Implement response recording**

Call `recordSeniorResponse` only after inbound message persistence succeeds.
The transactional database command chooses timely versus late behavior and
links the response message to the workflow.

- [x] **Step 3: Implement final-timeout case creation**

Use a fixed episode key `proactive_non_response:<workflow_id>`, Yellow display
semantics, two attempt timestamps, and one suggested human action. Keep
`pattern_id` null and do not insert a policy risk event or emergency alert.

- [x] **Step 4: Run service, repository, and dashboard tests**

Run: `npm test -- src/lib/telegram/service.test.ts src/lib/persistence/proactiveCheckInRepository.test.ts src/lib/persistence/dashboardRepository.test.ts`
Expected: PASS.

Evidence (2026-07-15): 22/22 focused service, repository, dashboard, and
migration tests passed. The live Supabase suite passed 4/4 after first proving
the prior late-response duplicate defect. A timely reply cancels pending work;
a final timeout creates one Yellow operational case with both attempt times;
a late reply keeps the case active and records one auditable event. The senior's
policy risk remains unchanged. Migration `20260715100951` is aligned locally
and remotely. Database lint reports only the pre-existing
`reset_trustkaki_demo` cast warning.

- [x] **Step 5: Commit**

```bash
git add src/lib/telegram/service.ts src/lib/telegram/service.test.ts src/lib/persistence/proactiveCheckInRepository.ts src/lib/persistence/proactiveCheckInRepository.test.ts src/lib/supabase/types.ts
git commit -m "feat: escalate missed proactive responses"
```

### Task 7: Admin schedule API and concise controls

**Files:**
- Create: `src/app/api/admin/seniors/[seniorId]/check-in-schedule/route.ts`
- Create: `src/app/api/admin/seniors/[seniorId]/check-in-schedule/route.test.ts`
- Create: `src/components/dashboard/ProactiveCheckInPanel.tsx`
- Create: `src/components/dashboard/ProactiveCheckInPanel.test.ts`
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/lib/api/schemas.ts`
- Modify: `src/lib/api/schemas.test.ts`
- Modify: `src/lib/checkins/contracts.ts`
- Modify: `src/lib/persistence/proactiveCheckInRepository.ts`
- Modify: `src/lib/persistence/proactiveCheckInRepository.test.ts`

- [x] **Step 1: Write failing authorization and presentation tests**

Prove admin-only update/pause/resume/manual-run, authorized senior binding,
meaningful pause reason, duplicate command prevention, and a concise panel that
shows status, next run, last send, and last failure without provider data.

- [x] **Step 2: Implement strict request schemas and route**

Use server-loaded senior authorization and authenticated actor identity. Manual
run inserts the same `initial_send` job used by cron; it does not call Telegram
directly.

- [x] **Step 3: Add the minimal dashboard panel**

Keep controls hidden for non-admin caregivers. Use one settings disclosure and
disable controls while saving. Do not add charts, raw job lists, or technical
logs.

- [x] **Step 4: Run focused UI/API tests**

Run: `npm test -- 'src/app/api/admin/seniors/[seniorId]/check-in-schedule/route.test.ts' src/components/dashboard/ProactiveCheckInPanel.test.ts src/lib/api/schemas.test.ts`
Expected: PASS.

Evidence (2026-07-15): the initial focused run failed in the four intended
missing surfaces. After implementation, the expanded focused command including
the repository overview tests passed 29/29. `npm run typecheck`, focused lint,
and `npm run build` pass. The route requires `demo_admin`, binds every command
to an authorized senior, and creates server time. Manual run uses the existing
transactional schedule RPC and therefore enqueues the normal `initial_send`
job. The caregiver UI is a single collapsed admin-only panel and does not expose
provider identifiers, destinations, raw jobs, or tokens. No migration was
required for Task 7.

- [x] **Step 5: Commit**

```bash
git add 'src/app/api/admin/seniors/[seniorId]/check-in-schedule' src/components/dashboard/ProactiveCheckInPanel.tsx src/components/dashboard/ProactiveCheckInPanel.test.ts src/components/Dashboard.tsx src/app/page.tsx src/lib/api/schemas.ts src/lib/api/schemas.test.ts
git commit -m "feat: add proactive check-in controls"
```

### Task 8: Live verification and truthful documentation

**Files:**
- Create: `docs/superpowers/verification/2026-07-15-gate-4-proactive-check-ins.md`
- Modify: `docs/TrustKaki_BUILD_ROADMAP.md`
- Modify: `docs/TrustKaki_CODEX_HANDOFF.md`

- [ ] **Step 1: Confirm migration history remains aligned**

Run: `supabase migration list`
Expected: local and remote history aligned.

- [ ] **Step 2: Run repeated live concurrency and security tests**

Run the Gate 4 live suite at least three times. Expected: one claim, one send
effect, one case effect, and unrelated caregiver isolation on every run.

- [ ] **Step 3: Verify real Telegram workflows**

Use one real scheduled send and timely reply. Use an admin-only accelerated
schedule to verify retry/final-timeout/case creation through the same processor.
Refresh the authenticated dashboard and confirm persistence.

- [ ] **Step 4: Run full validation and database advisors**

Run: `npm run validate`
Run Supabase security and performance advisors because database code changed.
Expected: tests, typecheck, lint, build pass; no new critical advisor finding.

- [ ] **Step 5: Update evidence and roadmap truthfully**

Record exact commands, counts, timings, Telegram message IDs in redacted form,
queue result, migration history, advisor results, and limitations. Mark Gate 4
complete only if the real scheduled send and both response paths pass.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/verification/2026-07-15-gate-4-proactive-check-ins.md docs/TrustKaki_BUILD_ROADMAP.md docs/TrustKaki_CODEX_HANDOFF.md
git commit -m "docs: verify proactive check-in gate"
```
