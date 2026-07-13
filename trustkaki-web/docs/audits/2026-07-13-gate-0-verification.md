# Gate 0 Verification Report

Date: 2026-07-13

Branch: `codex/gate-0-audit-remediation`

Reviewer status: **focused re-audit completed; requested changes addressed**

## Scope

This report covers only the approved Gate 0 authorization, actor identity,
RLS, atomic command, timeout, maintainability, and validation findings. It does
not approve deployment or add WhatsApp, scheduler, fan-out, Realtime,
analytics, memory, or Pattern Watch features.

## Implementation checkpoints

| Commit | Result |
| --- | --- |
| `9361f6c` | Captured failing Gate 0 structural regressions |
| `3d5a1bf` | Added authoritative server-side senior context loading |
| `f87055f` | Bound authenticated agent routes to explicit senior scope |
| `b7b8153` | Removed demo identity defaults from normal persistence |
| `60cec5b` | Added locked RLS helpers and atomic database commands |
| `50912db` | Switched caregiver actions and demo reset to authenticated RPCs |
| `2e8369e` | Added opt-in two-user Supabase integration coverage |
| `1f265a5` | Handled the runtime `TimeoutError` from `AbortSignal.timeout()` |
| `7614591` | Split persistence by existing responsibilities |
| `b34b506` | Split caregiver dashboard by existing workflows |

## Supabase migration

- Generated migration: `20260713101217_gate_0_auth_transaction_hardening.sql`.
- Linked project metadata was checked and identified the project as
  `trustkaki` before any remote operation.
- The Gate 0 SQL file was executed through the linked Management API.
- The focused re-audit identified two older local migrations missing from
  remote history. A dry run confirmed that only those two files were pending,
  and they were then applied to the linked `trustkaki` project:
  `20260712030000_senior_address_details.sql` and
  `20260713010000_senior_profile_gender.sql`.
- Remote migration history now matches all twelve local migrations through
  `20260713101217`.
- Read-only schema verification confirmed both `public.seniors.address_text`
  and `public.seniors.gender` exist as nullable text columns.
- No secret, project reference, token, password, email, or raw row was printed.

## Demo-reset rollback proof

`supabase/tests/database/reset_trustkaki_demo_rollback.test.sql` runs inside an
explicit transaction against the linked database. It:

- authenticates as the linked demo administrator without embedding credentials;
- inserts uniquely identified check-in, scheduled-job, and alert fixture rows;
- installs a transaction-local trigger that forces the alert deletion to fail;
- calls `public.reset_trustkaki_demo()` and requires the injected error;
- verifies a row targeted before the failure, the triggering row, and a row
  targeted after the failure all remain; and
- ends with `ROLLBACK`, removing the fixture and trigger.

The direct linked SQL run returned
`ok - failed demo reset left no partial state`. A separate read-only cleanup
query confirmed zero fixture rows and zero test triggers remained.

## Two-user database proof

The opt-in suite creates random temporary Auth users and rows, then removes
them in enforced cleanup.

| Senior | Caregiver A | Caregiver B |
| --- | --- | --- |
| Shared senior | Visible | Visible |
| B-private senior | Not visible | Visible |

Verified results:

- Caregiver A could not mutate B's private queue item.
- The rejected private mutation inserted zero caregiver-action rows.
- Caregiver A assigned the shared case to caregiver B.
- The persisted actor remained caregiver A; the assignment target was
  caregiver B.
- Caregiver B could read the shared action and assigned queue state.
- An invalid resolve command left action count, queue status, and linked
  pattern statuses unchanged.
- A valid resolve command atomically persisted the action, resolved the queue,
  and resolved both linked open patterns.
- Final live result: 4 tests passed in one suite.

## Other regression proof

- Normal agent requests require an authorized `seniorId`; senior context is
  loaded server-side.
- Browser-supplied authoritative context is rejected by strict Zod schemas.
- Normal orchestration persistence receives explicit senior and client-message
  IDs and does not seed demo identities.
- Unknown WhatsApp phone numbers are not mapped to the demo senior.
- The provider timeout test observes the runtime error name `TimeoutError` and
  maps it to the bounded message `LLM request timed out`.
- `npm run validate` completed with 45 test files passed, 1 opt-in database
  file skipped, 177 tests passed, 4 database tests skipped, then successful
  typecheck, lint, and production build.

## Module boundaries

| Module | Lines |
| --- | ---: |
| `trustkakiRepository.ts` compatibility facade | 22 |
| `orchestrationRepository.ts` | 337 |
| `patternRepository.ts` | 263 |
| `dashboardRepository.ts` | 555 |
| `Dashboard.tsx` coordinator | 88 |
| `CaseUpdateForm.tsx` | 234 |
| `DemoControls.tsx` | 171 |
| `PriorityCase.tsx` | 140 |
| `CaseDetails.tsx` | 123 |

No generic CRUD layer or disconnected dashboard state system was introduced.

## Advisor results

- Supabase performance advisor: no issues found.
- Supabase security advisor: no errors, with warnings requiring reviewer
  disposition.
- The authenticated `record_caregiver_queue_action` and
  `reset_trustkaki_demo` `SECURITY DEFINER` RPC warnings are expected for the
  command boundary. Their functions use empty `search_path`, explicit grants,
  trusted actor lookup, role checks, and senior authorization. Live tests prove
  isolation for the queue command.
- Older warnings remain for mutable search paths on existing trigger/WhatsApp
  functions, executable `public.rls_auto_enable()`, and disabled leaked-password
  protection. They were not introduced by Gate 0 and remain deployment review
  items.

## Remaining release checks

1. Authenticated dashboard visual verification in the isolated worktree was
   blocked because the available browser had no caregiver session and creating
   a privileged temporary browser user was not permitted. The sign-in surface,
   component tests, typecheck, lint, and production build passed.
2. Supabase advisor warnings listed above require explicit disposition before
   public production use; they were classified as non-blocking for Gate 0.
3. The in-process API rate limiter remains single-instance and is not a
   production distributed abuse-control mechanism.

No deployment, merge, or push was performed.
