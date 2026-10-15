# Neon personal-memory cutover — 15 October 2026

## Owner authorization and boundary

Owner requested completing migration, retrieval checks and production cutover today.
Scope: conversational personal memory. Supabase retains authentication, access,
messages, care data and essential operational context. No outbound transport test
messages or schedule/webhook changes are authorized by this release work.

## Migration evidence

- Reviewed six legacy rows: five personal; one existing family-contact route retained
  in Supabase with an audited `trusted_contact_route` tag.
- Tested import planning, lineage validation, missing evidence, stable receipts,
  changed-input rejection, real SQL import/replay and full transaction rollback.
- Rehearsal on a temporary Neon branch: 4 canonical records, 1 historical revision,
  5 original personal rows; sources/history reconciled; exact retry reused 4 receipts.
- Applied versioned Supabase migration `20261015051653_neon_personal_memory_cutover`.
  Its trigger freezes personal INSERT/UPDATE/DELETE, including attempts to retag
  existing personal rows. Essential operational writes remain available.
- Live no-op personal UPDATE was rejected with SQLSTATE 55000; no source changed.
- Production Neon import: 4 canonical records and 1 preserved original-ID snapshot;
  all source/history hashes reconciled. Exact replay returned 4 existing receipts.
  The Supabase snapshot and mapped evidence were checked again before COMMIT.
- Final legacy snapshot SHA-256:
  `728547084c54d01bb78ab40a360d2a0b27a29ec99e09fffab1ff6c54fe622d87`.
- All four canonical imported records have missing source evidence. Three are active;
  one is the archived terminal of a two-row history. They remain caregiver-visible
  but excluded from semantic retrieval until an authorised caregiver confirms them.
  Migration does not fabricate senior quotes or new caregiver confirmations.
- Retained Supabase personal rows are immutable historical evidence. New application
  memory uses Neon; no automatic Supabase personal-memory fallback is permitted.

## Local checks

- Full suite: 980 passed, 38 skipped; 140 test files passed, 5 skipped.
- Additional atomic rollback assertion passed in the five-test backfill suite.
- TypeScript and ESLint passed. Production npm audit: zero vulnerabilities.
- `npm run build` originally failed because Turbopack could not bind its helper port,
  including a retry with expanded permissions. Build script now selects Webpack,
  the compiler already verified for this app. Final standard build result recorded
  below during release verification. Final `npm run build`: exit 0, TypeScript
  passed and 23/23 static pages generated.
- Independent review found two importer reconciliation safeguards; both fixed:
  exact total row count and final mapped-evidence digest comparison.
- Supabase security advisor reports pre-existing auth/function configuration notices;
  no notice names the new guard function. The guard is invoker with fixed empty
  search_path and no public EXECUTE grant. Existing service-only tables intentionally
  have RLS without client policies. Existing RPC authorization is covered separately.
  [Advisor reference](https://supabase.com/docs/guides/database/database-linter).

## Deployment preparation

Production secret storage now contains the restricted pooled runtime URL, embedding
endpoint/model/key, calibrated threshold and Neon backend flag. No direct owner URL
was uploaded. Existing deployments retain their previous environment snapshots.

Previous production deployment: `dpl_7pmRyx65RGbHJPurbUEAXto43zTX`.
A previous Supabase-writing deployment cannot be promoted as a normal rollback
once Neon accepts new writes. Prefer a Neon-compatible build rollback; otherwise
pause writers, reconcile both stores, explicitly review unfreezing, then release.
Never just change the backend flag to Supabase.

Initial candidate (not promoted): `dpl_HmiKHbUkQNJ1zfnbipn89zRzAb3C`, commit
`bb12ff1179c6f76b92ad8748b37cbbed574a8ab5`.
Health verifies this revision, Neon enabled, database reachable and embedding
configuration present. Hosted production build passed with the standard command.

Signed-in candidate UI: three expected fictional seniors visible; known context
shows migrated personal preferences plus operational care context. No case,
contact, schedule or existing memory was changed during the UI check.

The unaliased production candidate is deployment-protected: credential-free smoke
was rejected at the protection layer. Equivalent `/api/health`, `/privacy` and
`/data-deletion` checks passed using existing Vercel CLI authentication; no protection
setting was weakened. Public alias smoke remains required after promotion.

Fresh live semantic benchmark: 30/30, 10/10 each English/Mandarin/Singlish,
zero forbidden facts and unavailable queries, warm p95 460ms, cleanup verified.
[Full sanitized result](2026-10-15-neon-cutover-retrieval.json).

The first generated-reply gate failed: an older preference in conversation was
chosen over the newer caregiver correction. Conversation timestamps were missing
from the shared prompt. Commit `beabf0554fffe734394fcc560911815f75f520a0`
adds timestamps and explicit chronological precedence while preserving current
senior-statement and safety priority. Regression observed failing before the fix,
then passing; independent review found no remaining code blocker. A separate smoke
script assertion was corrected to the actual top-level `fallback` response field.
Full suite after fix: 981 passed, 38 skipped; typecheck, lint and standard build
passed. The initial restricted full-suite attempt failed ten loopback tests with
`listen EPERM`; the permitted rerun passed all runnable tests.

New candidate generation verification and promotion: pending.

The timestamp-only candidate `dpl_HAuwfSGPzecMVgC6WMpKdfBw5D4K`
passed health/legal endpoints and signed-in roster visibility, but still failed the
corrected-preference generation assertion. It was not promoted. The deployed
retrieval status was not yet observable; no claim that prompt changes fixed it.
An earlier smoke preflight also failed without a bounded cause; independent health
verification passed and the controlled retry reached the generation assertion.

Next experiment: commit `16aa43513f4b1d925e634c0579866ff9ac42c7b6`
pins runtime execution to Singapore (`sin1`) beside Neon. Build region may still
be US East; that is separate from function execution. Normal retrieval performs
three scoped transactions plus embedding HTTP under a two-second deadline, so
cross-region round trips are a plausible cause. New telemetry reports only fixed
status/reason and numeric diagnostics, never scope, content or credentials.
Full suite: 982 passed, 38 skipped; typecheck, lint and standard build passed.
Independent review found no important issue; acceptance requires live retrieval
diagnostics and generated replies from this candidate, not the latency hypothesis.

Singapore candidate `dpl_2GtCTAMFFuQ685as3aH9jVs4d3Jr` confirms
function placement `sin1`. Its server telemetry shows available memory, one
selected fact, 407ms retrieval. It still failed generation by repeating the
superseded preference and describing the confirmed preference as a new suggestion.
Therefore latency is ruled out for that observed failure; region alignment is
retained for bounded latency, and promotion remains blocked on grounding.
The next prompt change explicitly labels the current incoming message and historical
conversation, defines which senior statement is current, and prohibits presenting
superseded preferences alongside the confirmed answer. The smoke now checks the
actual generated-input envelope before judging the reply.

The explicit-label candidate `dpl_314F1brgqUk2bxpYwCpf5cKSPnnL`,
commit `094fb029239c1884406b6871b53285adb1dba57e`, still failed generation.
Additional assertions proved the actual model input contained the corrected content
and excerpt, later confirmation timestamp, new labels and available status. A clean
safe-use-note comparison also failed; the injected note was not the sole cause.

## Accepted candidate

Commit: `4a262ac094dc46c3071476cf8b749da73e9c4949`.
Deployment: `dpl_HtpjiTdLCvcNWi5A88xxyYfpZZZy`.
URL: https://trustkaki-ke8fd23o7-minxie-ngs-projects.vercel.app.

This revision distinguishes server-selected current personal records from embedded
instructions, removes ambiguous optional-context wording and repeats factual
precedence after the evidence. Record text remains data in the user prompt; it is
not elevated to system instructions. Existing retrieval/data budgets are unchanged.

- Full suite: **984 passed, 38 skipped**; 140 test files passed, 5 skipped.
- Typecheck, lint and `npm run build`: exit 0. Hosted standard build also passed.
- Exact commit health, Neon enabled/database/embedding configuration: passed.
- Protected health/privacy/data-deletion endpoint equivalents: passed with existing
  Vercel CLI authentication. Public alias smoke remains a post-promotion gate.
- Live fictional extraction into Neon only, authenticated read, unauthenticated and
  foreign-senior denial, semantic retrieval, correction, exact retry, stale conflict,
  archive and old-extraction non-resurrection: passed.
- Actual generated-input content, excerpt and chronology: passed.
- Three live generated replies: corrected preference used without superseded value;
  current incoming choice respected; archived/empty memory did not invent a preference.
  All used the configured LLM without fallback. The injection-bearing note was
  present (`cleanNotesDiagnostic:false`); its canary was absent from replies.
- Fictional Neon, Supabase and Auth fixture cleanup: passed.
- Independent final review: no Critical or Important source finding remains.

Signed-in exact-candidate UI: passed. Expected three fictional seniors, priority
case, recommended human action and care-setup context were visible. Existing case
and memory records were not edited. Demo-admin orientation was inspected and exited
without preparing or mutating its scenario. Normal-caregiver API isolation and UI
boundaries are covered by the automated checks; this manual account is demo-admin.

## Production promotion

On 15 October 2026 at approximately 14:12 Singapore time, the verified production
candidate was promoted without rebuilding. `vercel promote` returned success for
`dpl_HtpjiTdLCvcNWi5A88xxyYfpZZZy`. Subsequent `vercel inspect
https://trustkaki.vercel.app` resolved to that exact deployment, status Ready,
functions in `sin1`.

Public `npm run release:smoke -- https://trustkaki.vercel.app` exited 0:

```text
PASS /api/health
PASS /privacy
PASS /data-deletion
RELEASE SMOKE PASSED
```

Production health: HTTP 200, commit `4a262ac094dc`, personal memory enabled,
embedding configured, scoped Neon database reachable and LLM configured. The
production-alias fictional memory and generated-response verification exited 0:

```sh
TRUSTKAKI_MEMORY_MIN_SCORE=0.200106996389696 npm run memory:neon:app-smoke -- \
  --confirm-live --confirm-provider-budget --confirm-production-candidate \
  --evaluate-generation --origin=https://trustkaki.vercel.app
```

Result booleans: passed, publicConfig, authenticatedRead, unauthenticatedDenied,
foreignSeniorDenied, acceptedExtractionInNeonOnly, liveSemanticRetrieval,
caregiverCorrection, correctedFactRetrieved, exactRetry, staleEditorConflict,
archiveExcluded, oldExtractionCannotResurrect, fictionalFixturesCleaned and
generatedReplyEvaluated all true. `cleanNotesDiagnostic:false` confirms the
injection-bearing note was retained for all three real generated-reply cases.
The script reports `productionCandidate:true` for its remote transport mode and
`productionCutover:false` because it never promotes deployments itself; the separate
promotion and alias inspection above prove the actual cutover.

All three production reply cases passed without model fallback. Temporary fictional
Neon/Supabase/Auth records were cleaned and cleanup verified. Existing care records,
outbound channels, schedules and webhooks were not changed. This completes the
personal-memory migration, bounded retrieval checks and application production
cutover; it does not constitute a fresh transport certification or care-pilot approval.

Hosted triage telemetry for the accepted run: available/selected=1 at 602ms and
582ms; archived/empty selected=0 at 408ms. These are three observed checks, not a
production latency percentile.

Local `.env.local` now explicitly selects Neon and the calibrated threshold;
other variables were preserved and file mode is 600. Built app started successfully
(`Ready in 108ms`). Health reports Neon enabled, reachable and embedding configured.
Overall local health is HTTP 503 because local chat/channel credentials are absent;
the accepted hosted candidate has those credentials and passes HTTP 200 health and
live generation. No dummy key was used to manufacture local readiness. Local server
was stopped after verification.

Temporary rehearsal branch deletion verified; production branch retained. Temporary
environment copies and raw failed-reply/request logs removed. Sanitized result
evidence retained. No outbound channel message, webhook or schedule was changed.

`16aa435` is Neon-compatible but has a reproduced grounding regression, so it is
not a normal rollback target. The accepted `4a262ac` deployment is the first verified
Neon baseline for future releases. Prefer a forward fix for an initial-cutover issue;
do not restore the old Supabase writer or silently unfreeze historical rows.

Commands begun before cutover may conflict instead of replaying their historical
Supabase receipt. Refresh the dashboard and reissue only after reviewing current
facts. Post-cutover Neon commands preserve exact-request retries; no claim of
exactly-once replay across both historical backends is made.

## Remaining operations after cutover

Scheduled indexing worker, retention/deletion of historical legacy copies, broader
model evaluations, restore drills and production-scale load remain follow-up work.
Current indexing is bounded and retries on subsequent writes/retrieval. No claim of
clinical suitability, broad multilingual generation quality or unbounded scale.
