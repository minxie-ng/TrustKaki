# Gate 4 Proactive Check-ins Verification

Date: 2026-07-16
Status: Ready for independent Gate 4 re-audit; production promotion pending

## Scope

This verification covers the bounded Telegram check-in workflow: one initial
message, a two-hour response window, one gentle retry, a one-hour response
window, one Yellow caregiver case after final non-response, timely cancellation,
late-response annotation, durable jobs, authenticated schedule controls, and
persisted dashboard output.

The 2026-07-16 remediation also covers response-versus-claimed-job races,
send/persistence uncertainty, accepted-send response correlation, and durable
Telegram recovery cadence.

No WhatsApp infrastructure, Relationship Layer, memory tables, family fan-out,
or broad dashboard redesign was changed in Gate 4.

## Exact Commands

```bash
set -a; source .env.local; set +a
TRUSTKAKI_RUN_LIVE_SUPABASE=1 npm test -- \
  src/lib/security/gate4ProactiveCheckIns.integration.test.ts
# Repeated three consecutive times.

npm test -- \
  src/lib/security/gate4ProactiveCheckInsMigration.test.ts \
  src/lib/checkins/service.test.ts \
  src/lib/persistence/proactiveCheckInRepository.test.ts \
  src/app/api/internal/telegram/process-pending/route.test.ts \
  src/app/api/internal/check-ins/process-due/route.test.ts \
  src/app/api/deployment-hardening.test.ts

npm run validate
```

The protected local processors were invoked with temporary server-only secrets:

```text
POST /api/internal/check-ins/process-due
POST /api/internal/telegram/process-pending
GET  /api/dashboard/state?seniorId=[redacted]
```

No token, chat identifier, raw provider response, phone number, or service-role
credential was printed or retained in this document.

## Audit Remediation Results

- A timely response now locks the workflow first, marks it `responded`, and
  cancels pending, failed, or already-claimed running jobs. Stale advancement
  receives `PT409` and cannot overwrite the response.
- Assigning provider acceptance now requires the expected workflow state and a
  matching durable send intent.
- Each send stage records intent before Telegram I/O. A process failure or
  persistence failure after intent becomes `send_reconciliation_required`; it
  is not automatically sent again.
- Response correlation begins at `initial_sent_at`, so a delayed message from
  before provider acceptance cannot close a newer workflow.
- The check-in processor drains pending Telegram events before evaluating due
  deadlines.
- The Vercel project is on Hobby. Unsupported five-minute Vercel Cron entries
  were removed and replaced with one five-minute Supabase Cron job.
- The Cron job reads `trustkaki_base_url` and `trustkaki_cron_secret` from
  Supabase Vault. Both values remain intentionally absent until the reviewed
  build is approved for production, so the job is currently inert.

## Migration And Live Integration Results

- Local and remote histories align through:
  - `20260716032239_gate_4_delivery_race_remediation`
  - `20260716033658_gate_4_supabase_scheduler`
  - `20260716034157_gate_4_scheduler_extension_schema`
- Focused remediation tests: 38/38 passed.
- Live run 1: 6/6 passed in 7.41 seconds.
- Live run 2: 6/6 passed in 6.11 seconds.
- Live run 3: 6/6 passed in 6.86 seconds.
- Each live run proved the response-versus-claimed-worker race, pre-send
  correlation exclusion, exclusive claims, idempotent completion,
  timeout-to-one-case behavior, and unrelated-caregiver isolation.
- One sandboxed live invocation failed on DNS before fixture creation. The same
  command was rerun with approved network access and passed three times.

## Real Telegram Evidence

### Timely response

1. A temporary real schedule was created for the mapped demo senior.
2. The current check-in processor claimed one job, sent one Telegram message,
   persisted provider acceptance, and opened the response deadline.
3. The senior replied through Telegram. The production webhook persisted and
   processed the real inbound event.
4. Vercel still runs the pre-Gate-4 deployment, so that deployed webhook did not
   call the new workflow response command.
5. The exact persisted event was cloned once as a temporary verification event
   and processed through the current local Telegram processor. The workflow
   became `responded`, the deadline was cancelled, no queue case was created,
   and one response event was recorded.

This proves the current implementation against live Telegram and Supabase data,
but it is not evidence that the unpromoted Vercel build already runs Gate 4.

### No response

An admin-only accelerated schedule used one-minute verification windows while
retaining the same durable processor and database commands:

- initial send: one claimed, one processed, one outbound message;
- initial deadline: one claimed and completed;
- retry send: one claimed, one processed, one outbound message;
- final deadline: one claimed and completed;
- final workflow status: `escalated`;
- queue output: one pending Yellow operational case linked to the workflow;
- evidence: both attempts recorded in the case reason/history;
- policy risk: Yellow before and Yellow after, unchanged.

No emergency claim was created, and non-response did not rewrite policy risk.

### Dashboard persistence

A temporary authenticated admin linked to the senior requested the existing
dashboard state API. It returned HTTP 200 with `persistence = supabase`,
`persisted = true`, the selected senior, and the active proactive case. This
proves refresh/read behavior from stored state rather than local React state.

## Full Validation

The 2026-07-16 `npm run validate` passed:

- Vitest: 82 files passed, 3 skipped; 375 tests passed, 26 skipped.
- TypeScript: passed with `tsc --noEmit`.
- ESLint: passed.
- Next.js production build: passed; 23 static pages generated and all expected
  API routes compiled.

Supabase advisors reported no error-level finding. The scheduler initially
registered `pg_net` under `public`; a focused remediation reinstalled it under
`extensions`, preserved `net.http_get`, and removed that new warning.

Remaining advisor notices are pre-existing or documented scale debt:

- Security: 18 notices (16 warnings, 2 informational). The Gate 4-specific
  warning identifies the authenticated `manage_proactive_check_in_schedule`
  security-definer RPC. This is intentional: only authenticated administrators
  receive execute access, and the function performs senior authorization and
  command binding internally. Remediation reference:
  https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Performance: 45 informational notices. Gate 4 contributes informational
  unindexed-foreign-key notices; these are recorded as scale debt for Gate 6,
  not a correctness or security blocker for the bounded workflow. Remediation
  reference:
  https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## Cleanup

The temporary schedule, both workflows, scheduled jobs, proactive events,
verification queue case, replay webhook event, replay-derived messages and
agent records, temporary caregiver link, temporary caregiver, and temporary
auth user were removed. The original real senior reply was retained. The local
verification state file and development server were also removed/stopped.

## Remaining Limitations

1. Gate 4 commits are not deployed to Vercel. Production Cron and timely reply
   closure must be rerun after independent re-audit and approved promotion.
2. Real verification accelerated deadline timestamps through the database to
   avoid a three-hour wait; it used the same claims, processor, sends, and final
   escalation commands as the normal cadence.
3. Supabase Cron is installed but intentionally inert until its Vault URL and
   credential are activated after promotion. Runtime evidence is still required.
4. Advisor indexing debt should be reviewed under organisation/scale readiness,
   based on query plans and production volume rather than adding every suggested
   index blindly.

## Decision

Gate 4 is ready for independent re-audit. It is not yet approved as
production-live. Promotion, Cron Vault activation, and one production
timely-response rerun remain the next controlled checkpoint.
