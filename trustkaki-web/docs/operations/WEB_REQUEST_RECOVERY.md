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
- The browser preserves pending IDs during the mounted conversation and access
  token refresh. Reloading or leaving that conversation does not restore the
  pending browser ID; inspect Activity before resending.

## Storage and rollout

Apply `20261020062325_web_request_idempotency.sql` before deploying its route.
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
