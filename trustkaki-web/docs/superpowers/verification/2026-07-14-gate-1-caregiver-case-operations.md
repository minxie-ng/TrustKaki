# Gate 1 Caregiver Case Operations Verification

**Date:** 2026-07-14
**Status:** Ready for independent Gate 1 audit; not a deployment approval.

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
criteria. An independent reviewer should audit this evidence before Gate 1 is
accepted or any deployment decision is made.
