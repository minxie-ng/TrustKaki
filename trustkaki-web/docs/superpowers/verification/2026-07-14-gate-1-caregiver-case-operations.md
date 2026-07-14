# Gate 1 Caregiver Case Operations Verification

**Date:** 2026-07-14
**Status:** Ready for independent Gate 1 re-audit; not a deployment approval.

## Scope

This verification covers authenticated caregiver case operations only. It does
not add Relationship Layer data, external notifications, WhatsApp callback
configuration, deployment, or production organisation administration.

## Changes Closed During Verification

- Added caregiver-facing acknowledge and assignment choices to the existing
  case update form.
- Loaded assignment candidates only from caregivers linked to the selected senior.
- Qualified the two `caregiver_actions -> caregivers` relationships so actor and
  assignee can be read independently.
- Displayed both the action actor and assignment target in action history.
- Corrected the live Realtime test so its event timeout starts after subscription.

## Automated Evidence

Focused Gate 1 tests:

```text
npm test -- src/app/api/caregiver/queue-action/route.test.ts \
  src/components/dashboard/CaseDetails.test.ts \
  src/components/dashboard/CaseUpdateForm.test.ts \
  src/lib/persistence/caregiverCaseRepository.test.ts \
  src/lib/persistence/dashboardAssignmentQuery.test.ts
```

Result: 5 files, 17 tests passed.

Live two-user Supabase integration:

```text
TRUSTKAKI_RUN_DB_INTEGRATION=1 node --env-file=.env.local \
  ./node_modules/vitest/vitest.mjs run src/lib/security/rls.integration.test.ts
```

Result: 1 file, 7 tests passed in 9.54 seconds. The suite created and removed
temporary Auth users and rows. It proved shared/private RLS, unauthorized
mutation rollback, actor/assignee separation, idempotent replay, atomic resolve,
stale conflict rejection, escalation, and Realtime delivery.

Full repository validation:

```text
npm run validate
```

Result:

- tests: 52 files passed, 1 live-only file skipped; 202 passed, 7 skipped
- typecheck: passed
- lint: passed
- production build: passed; 17 routes generated

The seven skipped default tests are the live Supabase suite shown above and were
run separately with explicit environment loading.

## Browser Workflow Evidence

Two real authenticated temporary caregivers were linked to one shared temporary
senior. A third caregiver was linked only to an unrelated temporary senior.

The browser workflow proved:

1. Caregivers A and B initially saw the same Pending Yellow case.
2. A acknowledged the case; B observed Acknowledged through shared refresh.
3. A assigned the case to B; B observed the assignment.
4. History displayed `assign to Gate 1 Caregiver B · by Gate 1 Caregiver A`.
5. B recorded a contact outcome; A recorded an AAC supervisor escalation.
6. The escalation remained active and never claimed anyone was contacted.
7. A and B submitted stale concurrent updates: B succeeded and A received the
   visible conflict message. Exactly one command persisted.
8. A resolved the case with a meaningful reason. The case disappeared for both
   caregivers, its linked pattern became resolved, and senior risk stayed Yellow.
9. The unrelated caregiver saw only the unrelated senior and not the shared senior.

Browser limitation: the available automation controlled one browser engine.
Session isolation used `localhost` and `127.0.0.1`, which provide separate cookie
domains, and authenticated different real test users in separate tabs. This is
browser evidence from two isolated sessions, not two independent browser engines.

## Live Persistence Evidence

After the browser workflow, a live read showed:

- queue status: `resolved`
- linked pattern status: `resolved`
- policy risk: `yellow`
- action count: 6
- actions: one acknowledge, one assignment, two contact outcomes, one escalation,
  and one resolution
- stale snooze actions: 0
- assignment actor: Caregiver A
- assignment target: Caregiver B
- escalation destination: `aac_supervisor`

Replaying the successful resolve command returned HTTP 200 and persisted status,
while the action count remained 6. No duplicate action was created.

All temporary seniors, caregivers, relationships, queue items, patterns, action
records, Auth users, credential fixture files, and evidence scripts were removed.
Post-cleanup counts for temporary seniors, caregivers, queue items, and patterns
were all zero.

## Database Checks

```text
npx supabase migration list --linked
npx supabase db advisors --linked --type security --level warn --fail-on error
npx supabase db advisors --linked --type performance --level warn --fail-on error
```

- All 18 local migrations match the linked remote history through
  `20260714025125`.
- Performance advisor: no issues.
- Security advisor: no error-level findings. Existing warnings remain for three
  mutable search paths, generic exposure warnings on intentionally guarded
  authenticated transactional RPCs/demo reset, `public.rls_auto_enable()`, and
  disabled leaked-password protection. These are release-hardening follow-ups,
  not hidden as Gate 1 passes.

## Conclusion

Gate 1 implementation and internal evidence satisfy the case-operation exit
criteria. An independent reviewer should re-audit this evidence before Gate 1
is accepted or any deployment decision is made.

## Independent Audit Correction

The first independent audit found one state-transition blocker and one Realtime
reliability evidence gap.

### Root Cause and Adopted Rules

The transactional `record_caregiver_queue_action` function derived the next
queue status from the requested action without considering the existing queue
status. Consequently, acknowledge and assignment could change an escalated case
back to acknowledged. The UI also offered actions that were invalid for an
escalated case.

The corrected transactional rules are deliberately narrow:

- pending and acknowledged flows retain their existing behavior;
- escalated cases reject acknowledge and snooze before any row is changed;
- assignment preserves followed-up or escalated status, while retaining the
  existing acknowledged result for pending, acknowledged, and snoozed cases;
- a non-resolving contact outcome preserves escalated status;
- a resolving outcome moves the case to followed-up, and explicit resolve moves
  it to resolved;
- idempotent command replay is checked before transition validation so a valid
  prior result can still be retrieved safely.

These checks execute inside the database transaction. The UI restriction is a
caregiver usability safeguard, not the enforcement boundary.

### Test-First Evidence

Before the fix, the focused component tests failed because status-specific
actions did not exist. The live Supabase suite then failed two escalated-state
assertions: acknowledge was accepted and a later resolution reported the prior
status as acknowledged. These failures reproduced the audit finding.

After the fix, the focused transition command was:

```text
npm test -- src/components/dashboard/CaseUpdateForm.test.ts \
  src/lib/security/gate1CaseMigration.test.ts \
  src/lib/security/gate1TransitionMigration.test.ts \
  src/lib/security/gate1EscalationMigration.test.ts \
  src/app/api/caregiver/queue-action/route.test.ts \
  src/lib/persistence/caregiverCaseRepository.test.ts
```

Result: 6 files and 26 tests passed. Coverage includes invalid escalated actions,
status-preserving assignment, unchanged pending/acknowledged choices, and the
database migration contract.

### Realtime Investigation

The previous live test waited for `SUBSCRIBED` and a row-change event but did not
retain other channel states. An intermittent failure therefore could not be
classified as subscription failure, delayed delivery, or a missed event.

The live harness now records every channel status, fails explicitly on
`CHANNEL_ERROR`, `TIMED_OUT`, or `CLOSED`, records event arrival time, and uses a
short initial event window followed by a separate authenticated polling check.
If polling observes the committed version but Realtime arrives later, the result
is classified as delayed; if it never arrives in the remaining bounded window,
it is classified as missed. A separate test proves the 250 ms bounded polling
fallback without depending on Realtime.

The complete live two-user suite was run three consecutive times after applying
the migration:

```text
TRUSTKAKI_RUN_DB_INTEGRATION=1 node --env-file=.env.local \
  ./node_modules/vitest/vitest.mjs run src/lib/security/rls.integration.test.ts
```

- run 1: 10/10 passed in 12.12 seconds
- run 2: 10/10 passed in 10.14 seconds
- run 3: 10/10 passed in 10.07 seconds

All three runs subscribed and received the expected event. No delayed, missed,
or subscription-failure classification occurred. Each run independently proved
the authenticated bounded polling fallback and removed its temporary fixtures.

### Escalated-Case Browser Workflow

A temporary escalated case was opened as an authenticated linked caregiver. The
update form showed only Assign caregiver, Record follow-up, Escalate case, and
Close as resolved. Acknowledge and Snooze were absent, and Record follow-up was
the default. Assigning the case to the second linked caregiver succeeded while
the visible status remained Escalated.

A live database read before cleanup confirmed:

- queue status: `escalated`
- assignee: the second linked caregiver
- action previous status: `escalated`
- action resulting status: `escalated`
- action assignment target: the second linked caregiver
- temporary fixture rows remaining after cleanup: 0

This focused correction workflow used one authenticated browser session. The
earlier two-isolated-session workflow remains the evidence for shared visibility,
conflict behavior, resolution, and unrelated-caregiver isolation.

### Migration and Final Validation

Migration `20260714044604_gate_1_case_transition_guards.sql` was created with the
Supabase CLI, dry-run, and applied to the linked `trustkaki` project. All 19 local
and remote migrations match through `20260714044604`.

Security and performance advisors report no error-level findings. The final
`npm run validate` result is:

- tests: 53 files passed, 1 live-only file skipped; 207 passed, 10 skipped
- typecheck: passed
- lint: passed
- production build: passed; 17 routes generated

The ten skipped default tests are the live Supabase integration suite documented
above and were run separately three times. The correction is ready for independent
Gate 1 re-audit; Gate 2 and Relationship Layer work remain blocked until acceptance.
