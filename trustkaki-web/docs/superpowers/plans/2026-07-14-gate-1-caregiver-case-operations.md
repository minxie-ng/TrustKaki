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

1. Add command identity and immutable action metadata to `caregiver_actions`.
2. Replace the caregiver queue RPC with an idempotent, conflict-aware transaction.
3. Extend typed API and repository contracts and return HTTP 409 for conflicts.
4. Keep one command ID across network retries in the case form.
5. Subscribe to authorized queue/action Postgres changes and debounce dashboard refresh.
6. Prove duplicate, conflict, rollback, and shared refresh behavior with unit and live database tests.
7. Apply the migration, run `npm run validate`, update roadmap evidence, commit, push, and deploy.
8. Add an explicit escalation command with destination, reason, active-case status,
   emergency guidance, and no automatic external notification.

## Exit Criteria

- Two caregivers cannot silently overwrite each other.
- One command ID persists exactly one caregiver action.
- Both caregivers see the shared case update through Realtime or polling fallback.
- Full validation and live database integration pass.

## Verification Evidence

- Migration dry-run and application completed against the linked `trustkaki` project.
- Six live two-user tests passed: isolation, actor/assignee separation,
  idempotent replay, atomic resolution, stale-write conflict, and Realtime refresh.
- `PT409` is used for a prompt business conflict response; retryable PostgreSQL
  serialization code `40001` is intentionally not used.
- The escalation migration was applied to the linked `trustkaki` project.
- Live database verification proves one idempotent escalation action, shared
  caregiver visibility, active `escalated` queue status, and later atomic resolve.
- Escalation records intent only; external recipient notification remains Gate 2.
