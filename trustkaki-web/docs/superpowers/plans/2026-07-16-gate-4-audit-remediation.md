# Gate 4 Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and execute each task in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four Gate 4 reliability blockers without changing the approved check-in policy or adding a generic workflow framework.

**Architecture:** A new Supabase remediation migration adds expected-state guards and a durable send-intent/reconciliation command. The existing processor records intent before Telegram I/O and never automatically resends an uncertain attempt. Because the Vercel project is on Hobby, Supabase Cron invokes one protected endpoint every five minutes; that endpoint recovers Telegram events before advancing check-in deadlines.

**Tech Stack:** PostgreSQL/Supabase RPC, TypeScript, Next.js App Router, Telegram Bot API, Vercel Cron, Vitest.

---

### Task 1: Database race and correlation guards

**Files:**
- Create: `supabase/migrations/*_gate_4_delivery_race_remediation.sql`
- Modify: `src/lib/security/gate4ProactiveCheckInsMigration.test.ts`
- Modify: `src/lib/security/gate4ProactiveCheckIns.integration.test.ts`

- [x] Write failing migration and live tests proving a response wins against a claimed deadline/retry job, stale advancement returns `PT409`, and messages before `initial_sent_at` do not close a workflow.
- [x] Run focused tests and confirm they fail for the reviewed reasons.
- [x] Replace the response, advancement, and final-timeout RPCs with workflow-state guards; cancel running jobs during a timely response while making stale workers harmless.
- [x] Run focused and live tests and confirm the guarded transitions pass.

### Task 2: Durable send intent and uncertain delivery recovery

**Files:**
- Modify: `supabase/migrations/*_gate_4_delivery_race_remediation.sql`
- Modify: `src/lib/persistence/proactiveCheckInRepository.ts`
- Modify: `src/lib/persistence/proactiveCheckInRepository.test.ts`
- Modify: `src/lib/checkins/service.ts`
- Modify: `src/lib/checkins/service.test.ts`
- Modify: `src/lib/supabase/types.ts`

- [x] Write failing tests proving intent is persisted before Telegram I/O and a pre-existing unresolved intent cannot send again.
- [x] Add transactional `begin_proactive_check_in_send` and `mark_proactive_send_uncertain` RPCs with service-role-only execution.
- [x] Change the processor to begin intent before send, persist acceptance on success, and move any uncertain post-intent outcome to manual reconciliation instead of retry.
- [x] Run focused tests and confirm exactly one provider call is possible per stage.

### Task 3: Scheduled Telegram inbox recovery

**Files:**
- Modify: `src/app/api/internal/telegram/process-pending/route.ts`
- Modify: `src/app/api/internal/telegram/process-pending/route.test.ts`
- Modify: `vercel.json`
- Create: `supabase/migrations/*_gate_4_supabase_scheduler.sql`
- Add or modify: targeted deployment configuration test

- [x] Write failing tests for authenticated GET execution and a supported five-minute scheduler.
- [x] Reuse the existing protected processing function from GET and POST without exposing secrets or event payloads.
- [x] Schedule the combined recovery/deadline endpoint in Supabase Cron; keep unsupported Vercel Hobby cron entries empty.
- [x] Run route/configuration tests and build.

### Task 4: Verification and evidence

**Files:**
- Modify: `docs/superpowers/verification/2026-07-15-gate-4-proactive-check-ins.md`
- Modify: `docs/TrustKaki_BUILD_ROADMAP.md`
- Modify: `docs/TrustKaki_CODEX_HANDOFF.md`

- [x] Apply the migrations through the normal Supabase migration workflow and confirm local/remote history.
- [x] Run the concurrent response-versus-worker live test at least three times.
- [x] Run focused tests, `npm run validate`, database checks, and Supabase advisors.
- [x] Confirm the Vercel account plan supports five-minute Cron; use Supabase Cron because the project is on Hobby.
- [x] Update evidence truthfully, clean temporary fixtures, and commit without staging unrelated `package-lock.json` changes.
