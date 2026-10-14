# Bounded proactive retries — 14 October 2026

Status: database migration applied; production application candidate ready.
Promotion awaits the required signed-in dashboard verification.

## Behaviour

- Transient failures before provider I/O back off for 5, 10, 20, then 40 minutes.
  The fifth failed processing attempt cancels the job, marks its workflow failed,
  pauses its schedule, and records one `job_failed` event for human review.
- Missing messaging identity and unsupported proactive transport stop immediately
  and pause the schedule. Error classification checks these conditions before
  broad Telegram errors.
- Quiet-hour deferrals target the first allowed minute in the schedule timezone.
  The current schedule reader uses 22:00–07:00. Daytime windows and daylight-saving
  transitions are also covered by policy tests.
- Normal waiting uses pending state, releases the claim, removes the claim's
  increment from the attempt count, and creates no retry event. Quiet waiting
  therefore does not consume failure attempts or repeatedly append audit rows.
- Accepted provider sends continue through the existing recovery path without
  sending again. Unknown provider outcomes retain send-intent reconciliation.
  If retry exhaustion encounters a send intent, it records reconciliation-needed
  status rather than treating delivery as definitely absent.
- Admin overview includes cancelled jobs with recorded errors. The panel explains
  stopped retries and review steps using fixed text. Historical failures do not
  relabel a schedule updated after that failure as currently needing attention.

Five attempts is the initial operational limit. It limits processing failures,
not invitations or senior non-response. Existing one-gentle-retry/non-response
care-case behaviour remains in place. Legacy attempt counts include historical
quiet waits; a legacy job already over the limit stops on its next failed
processing attempt. This migration does not erase history or proactively cancel
existing rows when applied.

## Implementation

- `src/lib/checkins/policy.ts`: calculate the next allowed instant in timezone.
- `src/lib/checkins/service.ts`: correct permanent-error classification, increasing
  failure backoff, and quiet-hour deferral time.
- `src/lib/persistence/proactiveCheckInRepository.ts`: include terminal failures
  in the authenticated schedule overview.
- `src/components/dashboard/ProactiveCheckInPanel.tsx`: concise review feedback.
- `supabase/migrations/20261014143934_bounded_proactive_retries.sql`: preserve the
  existing RPC signature; enforce bounds and atomic job/workflow/schedule state
  changes, validate service-role claims and live worker ownership, reject expired
  claims, retain restricted function privileges and empty search path.

The migration takes schedule, workflow, then job locks to align with schedule
commands and existing workflow/job processing. The failure cap and minimum
backoff are enforced in the database even when an older application calls it.
Updated application code is required to eliminate five-minute quiet-hour polling.

## Verification

Test-first checks reproduced the old quiet-hour timestamp, misclassified missing
identity, fixed retry delay, missing terminal issue feedback, and missing SQL RPC.

- Full local suite: 818 passed, 38 skipped (123 files passed, five skipped).
  Existing release-smoke tests used loopback permission.
- TypeScript and full ESLint: passed.
- Final production build: passed with network permission for existing Google
  Fonts; a sandboxed repeat failed to fetch those fonts.
- Final historical-failure display refinement: four focused panel tests,
  TypeScript, and focused ESLint passed after the full-suite run.
- Isolated PostgreSQL: 16 checks passed using PGlite 0.3.14, installed only under
  `/tmp`; no project dependency or lockfile change.

Reproduce isolated SQL checks from `trustkaki-web/`:

```bash
npm install --prefix /tmp/trustkaki-scheduler-check --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.3.14
node scripts/check-proactive-retries.mjs /tmp/trustkaki-scheduler-check/node_modules/@electric-sql/pglite/dist/index.js
```

The script applies the actual migration to minimal fictional tables and uses the
existing SQL claim function. Assertions cover retry cap (including 15,018 legacy
attempts), all stages, permanent errors, database-enforced backoff, wait handling,
absence of wait audit rows, unclaimable terminal jobs, stale/expired claims,
uncertain send-intent preservation, service-role guard, and execution privileges.
It does not exercise the full Supabase migration chain, live RLS, parallel worker
contention, or real providers. Local fixtures have no outbound connection.

## Release and recovery

### Release preparation

- Independent source review found no critical or important findings; focused
  reviewer tests passed (41 checks). Dependency follow-up review also passed.
- Linked CLI migration dry run matched existing history and selected only
  `20261014143934_bounded_proactive_retries.sql`.
- Required release audit found six existing production dependency advisories.
  Updated Next.js and eslint-config-next from 16.2.12 to 16.4.0, removed obsolete
  PostCSS/Sharp overrides, and refreshed baseline-browser-mapping/source-map-js
  within their dependency ranges. Production audit now reports zero advisories.
- Repeated `npm run validate` after dependency updates: 818 tests passed,
  38 skipped; TypeScript, ESLint, and production build passed.
- Current production public smoke passed. Rollback candidate:
  `dpl_C2QWhUEwisZNznSzB9TnXVP3eEVw`, commit
  `07ca51f773548b91d7c077ee0f0f2b365ff4c4bf`.
- Pre-rollout aggregate: one failed initial-send job, 15,024 attempts;
  15,002 retry events, seven within the preceding hour. Existing Supabase cron
  remains active every five minutes; no scheduler configuration change needed.

1. Review and apply the migration to the linked TrustKaki database through the
   normal release process. Applied on 14 October 2026; version confirmed remotely.
2. Deploy the application. Database-first order supports older workers; do not
   treat the app alone as enforcing terminal retry limits.
3. Inspect aggregate scheduler counts and authenticated paused/failure status.
   Do not use a real send as the default verification step.
4. Review configuration and delivery evidence before explicitly resuming a paused
   schedule. Reconcile uncertain sends before allowing another workflow.

For application rollback, keep the database bounds. An older app remains
compatible with the RPC but resumes five-minute quiet-hour deferrals. Reverting
the database function restores the unbounded behaviour; prefer a forward fix.

### Live rollout evidence

- Source commit: `fc4d663842e4587583a8b1127b34af9a953f4ecc` (local, not pushed).
- Supabase migration `20261014143934` applied successfully. Read-only inspection
  confirmed the preserved RPC signature, security definer, empty search path,
  five-attempt cap, denied anon/authenticated execution, and service-role access.
- Staged production deployment: `dpl_7pmRyx65RGbHJPurbUEAXto43zTX`, READY:
  [candidate](https://trustkaki-n03ncgc4v-minxie-ngs-projects.vercel.app).
  Deployed from repository root because Vercel's project root is `trustkaki-web`.
  Initial app-directory attempt failed before upload due to the doubled path.
- Candidate `/api/health`: HTTP 200, app/database/config checks passed, commit
  `fc4d663842e4`. `/privacy` and `/data-deletion`: HTTP 200, nonempty HTML.
  Protected public routes were inspected through the Vercel connector.
- Main domain still reports commit `07ca51f77354`; candidate was not promoted.
- Normal Supabase cron ran at 15:20 UTC. The existing quiet-hours job changed to
  pending, released its claim, retained 15,024 attempts, and scheduled 15:25 UTC.
  Retry event count stayed 15,002, last event at 15:10 UTC. This confirms quiet
  waits no longer append retry events. The old app still polls every five minutes
  until promotion. Live terminal failure behaviour has not been induced.
- No manual processor invocation, provider test message, schedule change, or
  audit deletion. Existing cron processing continued under the new function.
- Signed-in dashboard verification remains pending: Chrome showed the login
  screen; browser control subsequently detached. User asked to sign in directly.
- Automatic approval review rejected a proposed private `/api/seniors` fetch
  through Vercel's temporary bypass because it could expose private senior data.
  No workaround attempted; this private read remains unchecked.

Current database-function privilege guidance was checked against
[Supabase documentation](https://supabase.com/docs/guides/database/functions).
