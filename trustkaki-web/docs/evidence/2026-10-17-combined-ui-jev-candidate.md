# Combined UI, Jev and memory candidate

**Final release status:** sidebar correction `e0de978` promoted successfully on 17 October
2026 (Singapore); see the final promotion entry below. Earlier checkpoint notes
record their status at execution time.

17 October 2026 (Singapore). Owner approved exact commit `708f9cf`, linked-service
inspection, candidate deployment and read-only smoke. This does not authorize
model calls, authenticated account use, fixture writes or promotion.

## Source and target

- Source: `708f9cf232256158a36a204e5f9ba61db6a6e6be` from a clean tracked Git archive.
  Local environment files excluded; independent visual/functional review completed.
- Deployment: `dpl_gr3Gj6MWG6GostFGP8SrSY3Fm4KB`, READY, Production target with
  `--skip-domain`, existing configuration unchanged. API metadata confirms exact
  source SHA and expected TrustKaki project. Remote build completed in 45 seconds.
- Candidate: https://trustkaki-902kzg48v-minxie-ngs-projects.vercel.app
- Public domain remains on `dpl_4yfi39CYn2gtnHN5r9p7fJrSbCbR` (`410b6ef`).
  Vercel also assigned its generated project alias, as with earlier candidates.

## Checks

- `npm run validate`: 160 test files passed, 5 skipped; 1,273 tests passed,
  38 skipped. Typecheck, lint and production build passed. Initial sandboxed
  tests could not bind localhost; full validation passed outside that sandbox.
- `npm audit --omit=dev`: zero vulnerabilities. Working tree was clean at deploy.
- All 41 Supabase local/remote migration versions match; none applied.
- Required Production variable names/scopes present, including Jev routing,
  OpenRouter and Neon memory settings. Secret values were not printed/read back.
- Direct credential-free smoke was blocked by existing deployment protection.
  Existing authenticated Vercel CLI requests passed the equivalent checks;
  protection settings were unchanged.

```text
PASS exact project/source metadata READY
PASS /api/health HTTP200; operational database and Neon memory readiness
PASS /privacy HTTP200
PASS /data-deletion HTTP200
PASS /api/agents/aac-nudge HTTP200; Jev enabled/configured, no inference
PASS /api/agents/orchestrate GET HTTP200; model configured, no inference
PASS public domain unchanged
PROTECTED CANDIDATE SMOKE PASSED
```

Existing remote npm cache-dir/install-script warnings remain. No live fixtures,
model requests, outbound messages, database mutations or promotion occurred.

## Pending

The original hosted preference-memory example failed with an RPC conflict.
The approved diagnostic retry passed on `6992b79` (details below). Exact-candidate
authenticated release gates and explicit promotion approval remain pending.

## Signed-in demo dashboard — passed

Owner signed in and approved read-only inspection on the exact candidate.
Laptop inspection confirmed three fictional seniors, selected identity, labelled
priority, case reason, recommended action and sourced/dated personal context.
Manrope computed styling and refreshed green controls/panels render on the hosted
build. Judge workspace opens with a disabled empty-message submit control and
historical recorded traces; it explicitly requires a new message to show that
request's retrieval/save outcome. No inference or write was submitted.

The session later returned to sign-in after these checks. Inspection used a
separate tab after the original view changed during review. Temporary viewport
was reset and the review tab closed; the owner's tab was retained. This account
has demo-admin controls, so this check does not establish ordinary-caregiver
restrictions. Screenshot evidence is local and excluded from the release record.

## Ordinary-caregiver isolation — passed; cleanup complete

Owner approved two temporary ordinary caregivers, eight isolated fictional rows,
checks and full scoped cleanup on candidate `708f9cf`. Project/source identity was
rechecked before setup. No memberships/admin claims, messages, schedules or Neon
memory rows were created. Existing records were not edited by the check.

Both accounts passed:

- RLS roster contains only the assigned senior.
- Candidate dashboard returns only that senior, with no technical traces.
- Cross-senior dashboard and context reads return HTTP 403; own context HTTP 200.
- Empty-body admin-context POSTs for own and other senior return HTTP 403.
- Normal browser sign-in shows the assigned fictional senior only; Judge
  workspace, Live system demo and technical controls are absent.
- Sequential A-to-B sign-out/sign-in clears A's senior before B's roster appears.
  Initial loading cleared without an application error. Both accounts signed out.

Setup initially rejected an uppercase fixture slug before creating an account;
planned fixture absence was verified, slug corrected to match the schema, and
checks completed. This was a runner input defect, not a production change.

First cleanup verification raised an assertion; cleanup continued and repeated
its exact-owned-record verification successfully. The runner retains exit 1 from
that earlier assertion. Final verification confirms all eight rows absent, both
Auth users return 404, both former tokens return 401, and the restricted manifest
is removed. No unresolved residue remains. Temporary browser tab closed and
credential bindings cleared. No model call, outbound message or promotion.

Limits: fixtures have no populated traces; suppression of populated traces has
local regression coverage. Write denial covers the admin-context gate, not every
mutation route. Production remains on `410b6ef`.

## Final hosted chat/memory case — partial pass; cleanup complete

Owner approved one fictional chat request, a fresh US$1 cap, one temporary
caregiver, four isolated setup rows, scoped verification and cleanup.
Read-only preflight passed exact candidate/source/project and provider
configuration provenance before fixture setup.

- One HTTP 200 response; actual active Jev model
  `typesafe/jev-1.14-20261014` requested and executed `context_memory` and
  `aac_nudge`. Actual social intent was `declining`.
- One reply matched the source-reviewed refusal reply; green final policy,
  zero alerts, zero provider fallbacks and zero trace errors.
- Conversation persistence reported true. Memory attempted 1, accepted 0,
  rejected 0, failed 1: `rpc` / `conflict`. Memory acceptance failed.
- No HTTP retry. One US$0.319795 reservation retained under the separate US$1
  cap; actual billed cost was not measured.
- All exact-owned setup/generated Supabase rows, scoped audit/private bindings,
  Neon records/revisions/commands and temporary Auth account removed. Audit
  trigger restored, former token denied, Neon scope rechecked empty. Restricted
  response/credential/cleanup files removed; budget ledger retained.

Root cause is not established by the grouped conflict. Application-layer
diagnostic reason labels are prepared locally with a real-database regression
for missing update targets versus duplicate creates. All 47 focused tests pass;
typecheck, lint and production build also pass. Independent review found no
actionable issues. No relaxation of conflict checks,
new deployment, paid retry or public promotion occurred.

[Exact procedure and outcome](../operations/2026-10-17-final-memory-confirmation.md).

## Diagnostic candidate and explicit retry — passed; cleanup complete

Owner approved reviewed commit `6992b79f18a93c26689523fd205a44600e0aa246`,
linked-service inspection, candidate deployment, one explicit fictional retry
under the existing US$1 cap, scoped diagnostic inspection and cleanup.

- READY deployment `dpl_FyG8szAcZgYYiqt7tXbCL2iFKp8Y`:
  https://trustkaki-bvkiopp8f-minxie-ngs-projects.vercel.app.
  Exact source archive with no local env files, Production settings, `--skip-domain`.
  Remote build 36 seconds. Existing configuration unchanged.
- Local validation: 1,275 tests passed, 38 skipped; typecheck/lint/build passed.
  All 41 migration versions match; expected project and configuration names.
- Credential-free health returned HTTP 200. Authenticated Vercel CLI health,
  privacy and deletion reads passed. Public domain verified on `410b6ef`.
- One retry, HTTP 200. Actual active Jev routing and declining social intent;
  source-reviewed refusal reply, green final policy, no alerts/fallbacks/errors.
- Conversation persisted. Memory attempted 1, accepted 1, rejected 0, failed 0.
  Scoped Neon preference confirmed, no Supabase personal copy, two saved messages
  and actual Jev traces. Ordinary-caregiver dashboard hides technical traces.
- Verifier corrected its nonexistent agent_runs.senior_id filter to the check_ins
  foreign-key join after 42703. Read-only verification completed; no extra chat.
- Two total attempts retain US$0.639590 reserved under the original US$1 cap.
  This is not measured billing. No automatic HTTP retries or promotion.

The prior conflict did not recur; its cause remains unconfirmed. Static diagnostic
labels do not fix model semantics or relax concurrency rules. This confirms one
regression example, not general memory reliability or semantic recall.

Full scoped cleanup verified: Neon records/revisions/commands, Supabase setup and
generated rows, private receipts/audit events and temporary Auth account absent.
Context-event trigger restored, former token HTTP 401, Neon zero counts rechecked.
Private response/credential/cleanup files removed; budget retained. An expired
Supabase tool request was recovered by the idempotent guarded cleanup. No residue
remains. No diagnostic logs were needed after the successful chat/verification.
Exact-candidate signed-in demo and remaining release checks are still pending;
the earlier `708f9cf` checks do not establish those on this deployment.

## Final-candidate authenticated checks — API passed; browser blocked; cleanup complete

Owner signed in on exact candidate `6992b79` and approved read-only demo
inspection plus the documented two-caregiver/eight-row setup, checks and cleanup.
The demo UI displayed the three expected fictional seniors, priority ordering,
selected identity, case reason and recommended human action. Chrome then reported
that an extension panel blocked automation; owner was asked to close it. No
inference, case action or demo mutation was submitted.

Both temporary ordinary caregivers passed API and Supabase RLS assertions:
assigned senior only, cross-senior dashboard/context HTTP 403, own context 200,
admin-context POSTs 403 and technical traces absent. Fixtures contain no messages,
check-ins, contacts, schedules or Neon memories. Browser sign-in/account-switch
checks remain pending while Chrome is blocked. No promotion.

With browser automation still blocked, scoped cleanup was completed rather than
retaining live fixtures: all eight public rows and both Auth users absent, both
former tokens HTTP 401, restricted credential/recovery manifest removed. No
unresolved fixture residue. Normal-UI sign-in/account switching on this exact
commit was not completed; earlier `708f9cf` browser results remain earlier-build
evidence only. Owner's original candidate tab was retained.

## Owner-approved promotion — complete

Owner explicitly chose to stop further testing and skip the remaining browser
checks, then approved promoting runtime commit
`6992b79f18a93c26689523fd205a44600e0aa246` to trustkaki.vercel.app with no additional
testing. This supersedes the remaining browser-check release gate for this
hackathon release; it is not a claim that those checks passed.

Executed `vercel promote dpl_FyG8szAcZgYYiqt7tXbCL2iFKp8Y --yes --scope
minxie-ngs-projects`. CLI exited 0 and reported:

> Success! trustkaki was promoted to trustkaki-bvkiopp8f-minxie-ngs-projects.vercel.app (dpl_FyG8szAcZgYYiqt7tXbCL2iFKp8Y) [3s]

Public app: https://trustkaki.vercel.app. No additional model calls, fixtures,
configuration changes, browser checks or post-promotion smoke tests were run.
The earlier memory conflict's originating cause remains unconfirmed despite
the passing approved retry. Release work is wrapped up.

## Rounded follow-up card correction — released

Owner reported square empty follow-up cards for two fictional seniors and
approved deployment/promotion of commit
`f07c4c86bcb888673816d61be24615f6fb9d1c12`. The empty branch of PriorityCase now
reuses `care-case` (16px radius, full border and responsive padding), and its
activity button uses `care-secondary-button` (8px radius). Two class changes;
no care logic, storage or permissions changed.

Deployed from an archive of the approved commit with existing Production
settings and `--skip-domain`; Vercel’s required build passed in 34 seconds.
Deployment `dpl_8iFV5HXkHqrywXePJBzadnWmkvzV` reached READY at
https://trustkaki-uwi4dp057-minxie-ngs-projects.vercel.app.
The explicitly approved promotion exited 0 and reported success in 3 seconds.
Public app: https://trustkaki.vercel.app. No additional tests, browser inspection,
provider requests, fixtures or post-promotion smoke checks were run, as requested.

## Sidebar context layout correction — released

Owner reported overlapping actions and cramped, narrow context text and approved
deployment/promotion of commit `e0de97810e7640bcc70b24ae9ac62a422044df00`.
SeniorContextPanel now gives text the full available width, puts Edit/Archive
actions below with wrapping, separates source/confirmation/expiry metadata into
wrapping items, and uses rounded panel/controls. No care logic, persistence or
permissions changed.

Exact-source archive deployed using existing Production settings and
`--skip-domain`; required Vercel build passed in 38 seconds. Deployment
`dpl_Et75RwkCXREbpEAzALTdV6dBv5Xy` reached READY at
https://trustkaki-63zgggr8x-minxie-ngs-projects.vercel.app. Approved promotion
exited 0 and reported success in 3 seconds. Public app: https://trustkaki.vercel.app.
No additional tests, browser inspection, inference, fixtures or post-promotion
smoke checks were run, as requested.
