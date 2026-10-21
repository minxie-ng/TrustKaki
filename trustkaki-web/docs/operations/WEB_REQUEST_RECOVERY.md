# Web request recovery

The web orchestration endpoint claims a client message ID before loading context
or calling models. The ID is bound to its authenticated user, senior, and text.
Completed requests replay their saved response with current-role filtering.
Distinct IDs represent distinct messages, even when their text is identical.

A frozen orchestration snapshot supports persistence recovery without another
model run. Pending web requests are serialized per senior so an older recovery
cannot overwrite a newer web request's risk. This does not serialize Telegram,
caregiver actions, or every other channel against the web endpoint.

## Failure handling

- Concurrent duplicates return 409 with `request_in_progress`.
- Reusing an ID with different identity or text returns 409.
- A retryable persistence failure resumes from the encrypted snapshot.
- An uncertain model execution is not automatically taken over. Inspect its
  outcome before proceeding; do not invent a replacement ID to force a retry.
- Receipts expire after 24 hours. Expired and pre-rollout saved IDs return 410
  rather than rerunning models. Expired pending requests stop blocking new IDs.
- The browser preserves pending IDs across navigation and access-token refresh.
  Same-tab session storage keeps only the ID, text fingerprint, timestamp and
  expiry, scoped to the account and senior; it stores no message text or token.
  Navigation can restore text from memory. After a full reload, re-enter the
  original wording to resume the same ID. Nothing is sent automatically.
- Browser receipts expire after 24 hours and clear on sign-out or account change.
  When browser storage is blocked, in-memory navigation recovery remains available,
  but reload recovery is unavailable. Check Activity before starting a new message.

## Storage and rollout

Apply `20261020064005_web_request_idempotency.sql` before deploying its route.
The private receipt table is inaccessible to browser roles. Its service-only
function checks the service role and fences writes with worker tokens.
Snapshots and replay responses use AES-256-GCM with identity-bound additional
data and a purpose-derived key from `SUPABASE_SERVICE_ROLE_KEY`.

Rotating that secret makes existing encrypted receipts unreadable; recovery
fails closed. Plan rotation around pending work. Ciphertext is cleared lazily
for up to 100 expired receipts per claim; this is not a timed deletion SLA.
ID tombstones remain to prevent old IDs executing again.

Local tests cover SQL transitions, route recovery, response filtering, and UI
retry IDs. They do not prove live multi-instance behaviour or exactly-once
execution at an external model provider.

## Demo reset coordination

`20261020071209_demo_reset_web_coordination.sql` makes the disposable demo senior's
reset use the same advisory transaction lock as durable web claims. A reset
returns a conflict while any web receipt is unfinished, including expired
receipts: expiry alone cannot establish that its worker stopped. Complete
recovery or perform an approved investigation before trying reset again.

Successful reset expires completed receipts and clears their encrypted payloads,
retaining ID tombstones so a pre-reset ID cannot rerun. Existing context-event
evidence remains protected. This does not serialize Telegram, WhatsApp, caregiver
writes or a full demo replay's later processing against reset. Local embedded
Postgres tests verify transitions; they are not a live multi-instance race test.

## Admission and inference budgets

`20261020072510_web_inference_admission_limit.sql` admits at most 20 new web
orchestration receipts per account in a rolling 60-second window. The account
advisory lock covers admission across seniors and server instances. Completed
replays and frozen-result resumes do not consume a new admission. Existing
receipts start outside the accounting window. A denied admission returns 429
and Retry-After: 60 before context retrieval or model work.

The separate in-process HTTP limiter remains a best-effort flood guard, including
for replay traffic; it cannot establish a global HTTP limit. Its storage is
bounded to 10,000 active buckets and does not evict active limits to make room.
Other model endpoints do not inherit the durable web-receipt admission cap.

Each `orchestrate` invocation shares a 45-second inference deadline and a maximum
of 12 model starts across retries, specialists and Jev. Requests inherit the
remaining deadline, abort active transport when it expires, and use existing
fallbacks without starting later model work. Policy still runs and persistence
happens outside the inference budget. Public weather calls inherit the deadline
but do not consume model starts. Standalone agent endpoints retain their own
attempt timeouts; a full replay has multiple orchestration invocations.

This reserves nominal headroom under the web route's 60-second platform duration;
it does not bound auth/context retrieval, database writes or total response time,
nor prove a cancelled provider request incurs no charge. Local tests use embedded
SQL and mocked transports; no live load or cross-session race test is implied.
