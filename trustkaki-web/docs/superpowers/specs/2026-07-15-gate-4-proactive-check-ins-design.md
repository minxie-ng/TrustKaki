# Gate 4 Proactive Check-ins Design

**Status:** Approved on 15 July 2026

## Purpose

TrustKaki should initiate a senior-specific check-in without requiring an AAC
worker to press a demo button. A missed message must not immediately create an
alert: seniors may be away from their phones. The system gives the senior two
reasonable response windows before asking a caregiver to follow up.

## Scope

Gate 4 delivers one bounded operational workflow:

1. Send a configured check-in to a senior.
2. Wait two hours for a response.
3. If there is no response, send one gentle retry.
4. Wait one additional hour.
5. If there is still no response, create one Yellow caregiver queue case.

The first live transport is Telegram. The scheduler and workflow use a typed
transport boundary so the existing WhatsApp implementation can be enabled when
Meta removes the external account lock.

Gate 4 does not add family notification fan-out, memory extraction, organisation
tenancy, emergency calling, broad dashboard redesign, or new pattern types.

## Operating Rules

### Response timing

- The initial response window is two hours from the accepted initial send.
- Exactly one gentle retry is allowed.
- The retry response window is one hour from the accepted retry send.
- A response received before the second deadline cancels remaining workflow
  jobs and prevents creation of a non-response case.
- Delivery failure is not treated as senior non-response. It is recorded as a
  transport failure for staff visibility and retry policy.

### Escalation semantics

- Non-response alone creates a Yellow follow-up case, never an emergency claim.
- The case reason states that two check-in attempts received no response within
  the configured windows.
- Existing message policy remains authoritative for genuine urgent content.
- The non-response workflow does not rewrite policy risk.
- A response after case creation updates the case with `senior_replied_after_escalation`
  and the response time. It does not silently resolve the case; a caregiver must
  review and resolve it.

### Human controls

- Schedule configuration is admin-only in this gate.
- A senior's proactive check-ins can be paused and resumed with an auditable
  reason and authenticated actor.
- A manual run uses the same durable job and send path as a scheduled run.
- Quiet hours are evaluated in the senior's configured timezone before every
  send. A normal check-in never overrides quiet hours.

## Architecture

Use Vercel Cron to invoke a protected internal processor every five minutes.
Supabase is the durable source of truth; no correctness depends on an in-memory
timer or a particular Vercel instance remaining alive.

```text
Vercel Cron
  -> protected internal processor
  -> atomically claim due Supabase jobs
  -> evaluate pause and quiet-hours policy
  -> send through typed Telegram transport
  -> persist message/check-in/delivery metadata
  -> schedule response deadline
  -> detect reply or schedule one retry
  -> create one consolidated caregiver case after final timeout
```

The processor must return promptly, process a bounded batch, and be safe to run
concurrently. A database command claims each job before external I/O. Expired
claims can be recovered; completed effects remain protected by idempotency keys.

## Data Model

Extend the existing persistence foundation rather than introducing a parallel
workflow store.

### Check-in schedules

A senior-specific schedule records:

- senior and transport identity
- local send time, timezone, and active weekdays
- initial and retry response windows (default 120 and 60 minutes)
- enabled/paused state
- pause reason, actor, and timestamps
- message template key and version
- audit timestamps

Only one active default morning schedule is required per senior in Gate 4.

### Scheduled jobs

Extend `scheduled_jobs` to support:

- schedule and workflow identifiers
- stages: `initial_send`, `initial_deadline`, `retry_send`, `final_deadline`
- deterministic idempotency key
- claim owner and claim expiry
- attempt count, last error category, and next eligible time
- completion and cancellation metadata

The unique idempotency key prevents duplicate sends and duplicate queue cases.

### Check-in workflow state

Each workflow links its schedule, senior, initial message, retry message,
response, and queue item. It records current stage and timestamps without
duplicating conversation content.

## Reply Matching

Inbound Telegram processing already resolves a transport identity to one
senior. After persisting an inbound senior message, it checks for that senior's
open proactive workflow:

- before escalation: mark responded and cancel pending deadline/retry jobs;
- after escalation: record the late response and update the linked active case;
- unrelated or older messages do not satisfy a newer workflow.

The matching window begins at the accepted initial send and is scoped to the
senior and workflow.

## Queue Integration

Final timeout uses the existing transactional caregiver case operation rather
than writing a second kind of queue record. The command is idempotent and links
the workflow to one active queue case. The case exposes:

- Yellow follow-up level
- both attempt times
- last known response time
- concise reason and suggested human action
- subsequent late-response status, if any

Resolution remains a caregiver decision and does not rewrite policy risk.

## Security and Privacy

- Cron processing requires a server-only secret and rejects public requests.
- Telegram and WhatsApp credentials remain server-only.
- Admin schedule APIs use existing authenticated caregiver identity and senior
  authorization.
- Logs contain workflow IDs and error categories, not raw phone numbers, chat
  IDs, tokens, or message bodies.
- Every pause, resume, manual run, send decision, and queue transition is
  auditable.

## Reliability and Observability

- Provider acceptance and delivery state are distinct from senior response.
- Retry external sends only for retryable transport failures; never interpret a
  failed send as non-response.
- Record stage latency, attempt count, claim recovery, send outcome, response
  timing, and queue creation.
- Expose a concise admin status for next run, paused state, last send, and last
  failure without showing provider payloads.

## Verification

Automated tests must prove:

- the initial send occurs once;
- no retry occurs before two hours;
- one retry occurs after two hours without a response;
- no second retry is possible;
- no case occurs before the one-hour retry window ends;
- one Yellow case occurs after the final deadline;
- non-response does not create emergency risk or rewrite policy risk;
- a timely reply cancels pending jobs and prevents a case;
- a late reply annotates but does not resolve the case;
- paused schedules and quiet hours prevent sends;
- manual and cron runs share idempotency behavior;
- concurrent processors cannot duplicate sends or cases;
- unauthorized users cannot manage another senior's schedule;
- secrets and raw transport destinations do not appear in responses or logs.

Live verification must cover one real Telegram check-in, one timely reply path,
one accelerated no-response path, dashboard persistence after refresh, and
`npm run validate`. Production timing does not need to wait three real hours;
an admin-only test schedule may use short windows while exercising the same
database and processor path.

## Success Criteria

Gate 4 is complete only when a real scheduled Telegram check-in sends without a
manual demo button, duplicate cron invocations do not duplicate effects, missed
response follows the approved two-hour/one-hour policy, and the resulting case
is visible and actionable through the existing caregiver queue.
