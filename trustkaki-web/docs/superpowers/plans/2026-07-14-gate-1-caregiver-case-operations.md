# Gate 1 Caregiver Case Operations Plan

**Goal:** Let multiple authorized caregivers update one shared case without lost updates, duplicate actions, or stale UI state.

## Invariants

- Every mutation carries a client-generated UUID command ID.
- Replaying the same command returns the original result and creates no new action.
- Every mutation carries the queue row's last-seen `updated_at` value.
- A stale mutation returns conflict and never changes action, queue, or pattern state.
- Resolved cases cannot be reopened through stale commands.
- Action history preserves actor, assignment target, snooze expiry, transition, and note.
- Realtime payloads are refresh hints only; authoritative dashboard state is reread through the authenticated API.
- Polling remains as a fallback when Realtime is disconnected.

## Implementation

- [x] Add command identity and immutable action metadata to `caregiver_actions`.
- [x] Replace the caregiver queue RPC with an idempotent, conflict-aware transaction.
- [x] Extend typed API and repository contracts and return HTTP 409 for conflicts.
- [x] Keep one command ID across network retries in the case form.
- [x] Subscribe to authorized queue/action Postgres changes and debounce dashboard refresh.
- [x] Prove duplicate, conflict, rollback, and shared refresh behavior with unit and live database tests.
- [x] Expose acknowledge and assignment in the caregiver case form and preserve actor/assignee separation in visible history.
- [x] Add an explicit escalation command with destination, reason, active-case status,
   emergency guidance, and no automatic external notification.
- [x] Run the two-caregiver browser workflow, linked migration check, advisors, and `npm run validate`.
- [x] Record internal verification evidence for independent Gate 1 audit.
- [x] Prevent acknowledge, assign, or outcome commands from downgrading an escalated case.
- [x] Hide invalid escalated-case actions and default the form to a valid follow-up action.
- [x] Diagnose Realtime subscription, delayed-event, and missed-event outcomes separately.
- [x] Verify the bounded authenticated polling fallback independently.

## Exit Criteria

- Two caregivers cannot silently overwrite each other.
- One command ID persists exactly one caregiver action.
- Both caregivers see the shared case update through Realtime or polling fallback.
- Full validation and live database integration pass.

## Verification Evidence

- Migration dry-run and application completed against the linked `trustkaki` project.
- Seven live two-user tests passed: isolation, actor/assignee separation,
  idempotent replay, atomic resolution, stale-write conflict, and Realtime refresh.
- `PT409` is used for a prompt business conflict response; retryable PostgreSQL
  serialization code `40001` is intentionally not used.
- The escalation migration was applied to the linked `trustkaki` project.
- Live database verification proves one idempotent escalation action, shared
  caregiver visibility, active `escalated` queue status, and later atomic resolve.
- Escalation records intent only; external recipient notification remains Gate 2.
- Two isolated authenticated browser sessions proved shared acknowledge,
  assignment, contact outcome, escalation, one-success/one-409 concurrency,
  resolution, unchanged policy risk, and unrelated-caregiver isolation.
- Browser automation used separate `localhost` and `127.0.0.1` cookie domains
  in one controlled browser engine; this is not evidence from two browser engines.
- Full evidence is recorded in
  `docs/superpowers/verification/2026-07-14-gate-1-caregiver-case-operations.md`.
- The first independent audit found an escalated-state downgrade and insufficient
  Realtime diagnostics. Migration `20260714044604` closes the transition defect;
  repeated live tests and an escalated-case browser workflow now pass. Gate 1
  remains pending independent re-audit.
