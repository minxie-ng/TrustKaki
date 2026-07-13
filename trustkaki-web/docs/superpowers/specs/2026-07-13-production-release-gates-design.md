# TrustKaki Production Release Gates Design

**Date:** 2026-07-13  
**Status:** Approved direction; Gate 0 awaits implementation planning and reviewer acceptance

## Purpose

Move TrustKaki from a strong hackathon product candidate to a system that an
AAC or caregiver organisation can operate safely. Product expansion must follow
release gates so authorization, data integrity, communication consent, and
operational accountability are proven before automated outreach expands.

## Current Decision

Feature development pauses at the current baseline. Audit remediation is the
mandatory next release gate. Caregiver workflow, multi-recipient communication,
live WhatsApp, scheduling, and broader product work resume only after the Gate 0
regression suite passes and the reviewer accepts the remediation.

This does not discard the existing WhatsApp, Pattern Watch, memory, or dashboard
work. It makes their shared foundation safe enough to extend.

## Confirmed Baseline Risks

The current code and independent audit identify these release blockers:

1. Agent and manual-briefing routes accept browser-supplied senior context
   without binding every operation to an authorized `seniorId` and loading the
   authoritative context server-side.
2. Normal persistence paths still contain a demo-senior default, which can hide
   missing scope in authenticated requests.
3. Caregiver action history can use the assignment target or demo caregiver as
   the actor instead of the authenticated caregiver who performed the action.
4. Current RLS relationship helpers query RLS-protected relationship tables and
   have not been proven with two real authenticated users.
5. Queue action history, queue state, linked pattern state, and demo reset are
   not consistently executed as one short database transaction.
6. `AbortSignal.timeout()` produces a `TimeoutError` in the real runtime, while
   the existing test only simulates `AbortError`.
7. `Dashboard.tsx` and `trustkakiRepository.ts` have accumulated unrelated
   responsibilities, making security-sensitive changes difficult to review.
8. There is no single `npm run validate` command, and the existing auth-security
   plan checkboxes do not reflect actual evidence.

## Production Invariants

The following rules apply to every gate:

- A browser may select a `seniorId`; it may not supply authoritative senior
  profile, risk, baseline, memory, caregiver, or recent-message context.
- Every senior-scoped request is authenticated, authorized for that senior, and
  rejected before model or database work when access fails.
- The authenticated caregiver is the action actor. Assignee and notification
  recipient are separate concepts and fields.
- Deterministic policy remains authoritative for final risk, alerts, briefing
  invocation, and escalation eligibility.
- Multi-row state changes that represent one business action are atomic.
- Cross-caregiver isolation is enforced by both server authorization and tested
  database policy.
- Demo administration never bypasses ordinary senior access rules.
- Service-role credentials remain server-only and never enter browser bundles,
  logs, traces, or API responses.
- UI work is included when needed to operate a gate safely. Cosmetic redesign
  is deferred until the workflow beneath it is stable.

## Gate 0: Audit Remediation

### 0.1 Authoritative Senior Scope

All agent routes that process senior data, including manual briefing, require a
bounded `seniorId`. After authentication, the server verifies the caregiver-to-
senior relationship and loads a typed `AgentRunContext` from persisted senior
data. The browser supplies only the user-authored message and explicitly
permitted operation inputs.

Internal WhatsApp processing resolves the senior from the verified normalized
phone mapping and then uses the same server-side context loader. Demo replay
uses an explicitly authorized demo senior rather than an implicit repository
default.

No normal authenticated repository function may default to
`DEMO_SENIOR_ID`. Demo-only helpers must be named and isolated as demo code.

### 0.2 Actor and Assignment Semantics

`caregiver_actions.caregiver_id` is treated as the immutable actor identity and
is always derived from the authenticated session. Assignment remains on
`caregiver_queue_items.assigned_caregiver_id`. If historical compatibility
requires clearer naming, a migration may introduce `actor_caregiver_id` and
backfill it deliberately; assignment must never be inferred from the action
actor.

The transaction validates that any assignment target is also linked to the
senior. Action history records the actor, action, optional outcome, reason,
previous status, resulting status, and timestamp.

### 0.3 RLS Repair

Recursive relationship checks are replaced with narrowly scoped helper
functions in a non-exposed private schema. Where `SECURITY DEFINER` is required
to read the relationship table without RLS recursion, each function must:

- derive identity from `(select auth.uid())`;
- set `search_path = ''` and fully qualify every relation;
- expose no arbitrary SQL or user-selected identity;
- revoke execution from `PUBLIC` and `anon`;
- grant only the minimum execution required for authenticated policy evaluation;
- have supporting indexes on authorization predicates.

Policies use `TO authenticated` plus the relationship predicate. New public
tables are not assumed to be exposed automatically; grants and Data API
exposure are reviewed separately from RLS.

### 0.4 Atomic Mutations

One database transaction records a caregiver action and updates its queue item
and linked patterns. It locks the queue item first and linked patterns in a
consistent ID order, validates the expected current state, writes the immutable
action record, and returns the resulting case state. External calls and LLM work
remain outside the transaction.

Demo reset uses one protected transactional RPC. Partial client-side deletion
is removed from the normal reset path. The RPC is limited to demo data and
cannot accept an arbitrary senior ID.

### 0.5 Runtime Correctness and Validation

Timeout handling recognises the runtime `TimeoutError` generated by
`AbortSignal.timeout()` while retaining safe handling for compatible abort
errors. Provider failures return bounded, non-secret errors.

`npm run validate` runs, in order:

1. all Vitest tests;
2. TypeScript typecheck;
3. lint;
4. production build.

The existing production-auth plan is updated with completed checkboxes and
evidence, including commit hashes or test commands where appropriate.

### 0.6 Targeted Module Boundaries

Refactoring follows existing responsibilities and adds no generic repository or
component framework.

Suggested dashboard boundaries:

- queue list and senior selector;
- selected senior summary;
- priority case summary;
- case update form and action state;
- case evidence/details;
- demo controls, kept separate from the operational view.

Suggested persistence boundaries:

- orchestration and message persistence;
- dashboard read model;
- caregiver case commands;
- Pattern Watch persistence;
- demo reset/seed operations;
- senior context loading.

Public APIs remain small and typed. The refactor must preserve behavior and be
covered by existing and new regression tests.

### Gate 0 Verification

Gate 0 is complete only when:

- every affected route has unauthorized, inaccessible-senior, and authorized
  regression coverage;
- manual briefing is bound to an authorized senior and remains risk-advisory;
- caregiver action tests prove actor and assignee separation;
- live or local Supabase integration tests use two authenticated caregivers and
  at least one unrelated senior to prove positive sharing and negative isolation;
- transaction failure tests prove no partial action, queue, pattern, or reset
  state remains;
- the real timeout behavior is tested;
- `npm run validate` passes;
- the reviewer re-audits and accepts the result.

## Gate 1: Caregiver Case Operations

Build one auditable case-update workflow: acknowledge, assign, snooze, record
contact, escalate, and resolve. Snooze requires reason and expiry; resolution
requires outcome and note. Add duplicate submission protection, conflict
detection, immutable action history, and shared-caregiver state refresh.

Exit: two caregivers can safely operate one shared case without losing,
duplicating, or misattributing updates.

## Gate 2: Contacts, Consent, and Escalation

Add multiple verified contact methods, relationship, priority, language,
consent, permitted notification categories, quiet hours, escalation order, and
acknowledgement timeout. Keep action actor, case assignee, and notification
recipient distinct. Implement deterministic recipient selection.

Exit: the system can explain who may be contacted, why, through which channel,
and in what order.

## Gate 3: Production WhatsApp

Complete live Meta callback configuration only after Gates 0-2. Reuse the
durable inbox, signature verification, deduplication, and server-side sender.
Add multiple-senior phone resolution, status events, template support,
policy-approved guardian/AAC notifications, delivery tracking, retries, and
acknowledgement-based escalation suppression.

Exit: a real senior receives a real reply, authorized humans are contacted only
when policy permits, and webhook retries create no duplicate processing or
notifications.

## Gate 4: Proactive Check-ins

Add senior-specific schedules, quiet hours, approved WhatsApp templates,
idempotent sends, missed-response detection, retries, and human pause/override.

Exit: scheduled check-ins operate without duplicate sends and feed the same
policy, Pattern Watch, queue, and audit paths as inbound messages.

## Gate 5: Memory Operationalisation

The memory, health-context, and routine-baseline tables already exist. Complete
caregiver review, provenance, expiry, retention, safe extraction proposals, and
memory-aware check-ins without diagnosis inference.

Exit: memory improves personalisation and baseline comparison while remaining
reviewable, correctable, minimised, and auditable.

## Gate 6: Organisation and Scale Readiness

Add organisation tenancy, staff roles, roster administration, Supabase Realtime
or an equivalent shared-case update mechanism, distributed rate limiting,
durable worker observability, backups, recovery, audit retention, data export
and deletion, and concurrency/load testing.

Exit: a small AAC pilot can operate multiple staff and seniors with documented
support, security, and recovery procedures.

## Gate 7: Adoption and UI Refinement

Run caregiver/AAC usability tests, reduce reading and action burden, verify
mobile and accessibility behavior, improve multilingual readiness, and add the
minimum organisation onboarding needed for a pilot. Technical traces remain
progressively disclosed and absent from the default operational workflow.

Exit: representative caregivers can complete the core queue workflow without
assistance and without mistaking AI guidance for diagnosis or emergency care.

## Gate 8: Pilot and Deployment Approval

Complete security and privacy review, production Meta credential setup,
monitoring, incident ownership, rollback rehearsal, controlled AAC pilot, and
go/no-go metrics. Deployment promotion requires reviewer approval after Gate 0;
broad pilot approval requires all preceding applicable gates.

## Delivery Rule

Implement one gate at a time. Each gate receives its own design or scoped plan,
tests, verification evidence, commit, and review. Later-gate schema or UI work
must not be pulled into an earlier gate merely because it is adjacent.
