# Gate 4 Proactive Check-ins Verification

Date: 2026-07-15
Status: Ready for independent implementation audit; production promotion pending

## Scope

This verification covers the bounded Telegram check-in workflow: one initial
message, a two-hour response window, one gentle retry, a one-hour response
window, one Yellow caregiver case after final non-response, timely cancellation,
late-response annotation, durable jobs, authenticated schedule controls, and
persisted dashboard output.

No WhatsApp infrastructure, Relationship Layer, memory tables, family fan-out,
or broad dashboard redesign was changed in Gate 4.

## Exact Commands

```bash
npx supabase migration list --linked

TRUSTKAKI_RUN_LIVE_SUPABASE=1 node --env-file=.env.local \
  node_modules/vitest/vitest.mjs run \
  src/lib/security/gate4ProactiveCheckIns.integration.test.ts
# Run three consecutive times.

npm run validate
npx supabase db lint --linked
```

The protected local processors were invoked with temporary server-only secrets:

```text
POST /api/internal/check-ins/process-due
POST /api/internal/telegram/process-pending
GET  /api/dashboard/state?seniorId=[redacted]
```

No token, chat identifier, raw provider response, phone number, or service-role
credential was printed or retained in this document.

## Migration And Live Integration Results

- Local and remote histories align through migration `20260715100951`.
- Live run 1: 4/4 passed in 7.25 seconds.
- Live run 2: 4/4 passed in 5.48 seconds.
- Live run 3: 4/4 passed in 5.18 seconds.
- Each run proved exclusive two-worker claiming, idempotent completion,
  timeout-to-one-case behavior, and unrelated-caregiver isolation.
- The first attempted invocation used `npm test` without loading `.env.local`
  and stopped before fixture creation. The corrected invocation above uses
  Node's `--env-file` option; this was a test harness invocation issue, not a
  database or workflow failure.

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

`npm run validate` passed:

- Vitest: 82 files passed, 3 skipped; 367 tests passed, 24 skipped.
- TypeScript: passed with `tsc --noEmit`.
- ESLint: passed.
- Next.js production build: passed; 23 static pages generated and all expected
  API routes compiled.

Linked database lint passed with one pre-existing warning in
`public.reset_trustkaki_demo` about a text-to-UUID cast. No Gate 4 lint warning
was reported.

Supabase advisors reported no error-level finding:

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
   closure must be rerun after independent audit and approved promotion.
2. Real verification accelerated deadline timestamps through the database to
   avoid a three-hour wait; it used the same claims, processor, sends, and final
   escalation commands as the normal cadence.
3. Vercel Cron cadence and runtime observability require post-promotion evidence.
4. Advisor indexing debt should be reviewed under organisation/scale readiness,
   based on query plans and production volume rather than adding every suggested
   index blindly.

## Decision

Gate 4 is ready for independent implementation audit. It is not yet approved as
production-live. Promotion and one production timely-response rerun remain the
next controlled checkpoint.
