# Final-Commit Channel Verification

**Date:** 29 July 2026  
**Production:** `https://trustkaki.vercel.app`  
**Verified commit:** `b0ea11b`  
**Scope:** bounded hackathon verification using fictional demo data

This record excludes credentials, Auth UUIDs, phone numbers, Telegram
identifiers, provider identifiers, destinations, payloads, and message bodies.

## Preflight

- Vercel production reported commit `b0ea11b` and passed the credential-free
  release smoke check.
- The sanitized health endpoint reported the app, database, LLM, WhatsApp,
  Telegram, scheduler, and protected processors configured.
- Vercel listed every required channel configuration name as encrypted in the
  Production environment. Secret values were not read or recorded.
- Requests without the Telegram webhook secret received HTTP 403.
- WhatsApp webhook verification using an invalid token received HTTP 403.

## Telegram Result

Telegram passed the final-commit bounded live path.

- Provider webhook diagnostics reported the expected Vercel callback, zero
  pending updates, no current webhook error, and only message updates enabled.
- One approved fictional inbound event reached production.
- The durable event completed in one attempt with no stored error.
- Orchestration completed and selected the Triage reply.
- Telegram accepted one outbound reply and returned an external message ID.
- The recipient confirmed that the TrustKaki reply was visible in Telegram.
- Receipt-to-processed time was approximately 38 seconds.

Persisted bounded counts for the linked check-in:

| Record | Count / result |
| --- | --- |
| Telegram webhook events | 1, processed |
| Telegram conversation messages | 2: one inbound and one outbound |
| Agent and deterministic-policy runs | 8 |
| Detected signals | 6 |
| Risk transitions | 0 |
| Alerts | 1 |
| Briefs | 1 |

Both linked conversation messages retained Telegram provenance metadata.

## Duplicate Verification

The exact stored provider update was replayed through the authenticated
production webhook. Production returned:

- HTTP 200;
- acknowledgement `accepted`;
- result `duplicate`;
- scheduled `false`.

Webhook-event, message, agent-run, signal, risk-event, alert, and brief counts
all remained unchanged. No second orchestration or reply was scheduled.

## Dashboard Evidence

The authenticated EdgeOne care workspace, which reads the same production
Supabase records, was refreshed after the Vercel webhook completed. It showed:

- the updated latest-response time;
- the new senior message in the chronological timeline;
- two new medium observed signals;
- the active priority case; and
- the generated caregiver summary and recommended action.

The user confirmed sign-in on Vercel, but the authenticated Vercel tab was not
available to the automated browser session for a captured inspection. Exact
Vercel-host UI capture therefore remains pending; no claim is made that it was
automatically verified in this checkpoint.

The 31 July timeline update now maps persisted Telegram and WhatsApp provenance
to bounded channel and processing/delivery labels. It includes semantic event
times and recent TrustKaki replies while discarding raw provider-message,
phone, webhook-update, and metadata identifiers before dashboard rendering.
Focused repository and presentation tests passed, followed by desktop and
390x844 browser checks with no console errors, framework overlay, or horizontal
overflow. Vercel then reported product commit `78aa64e1e2a5` healthy, and
Vercel and EdgeOne passed health, privacy, and data-deletion release smoke.

## WhatsApp Result

WhatsApp final-commit live verification is blocked by external Meta access.

- Application health reports the WhatsApp variables and processor configured.
- Read-only Graph API checks for both the configured phone and WABA app
  subscription failed with OAuth error code 200.
- No WhatsApp message was sent during this checkpoint.
- The historical 14 July live proof remains valid for its then-deployed commit,
  but it is not represented as final-commit verification.

Restoring Meta account access or replacing the credential is required before a
new WhatsApp live send. Do not bypass account recovery or run an unbounded
credential rotation.

## Status

- Telegram final-commit verification: **PASS**
- WhatsApp final-commit verification: **BLOCKED - META ACCESS**
- Exact Vercel authenticated UI capture: **PENDING**
- Overall channel workstream: **BLOCKED**, with Telegram available as the
  verified judge demonstration transport

The external WhatsApp blocker does not prevent work on the isolated one-click
public demo, channel-origin presentation, slides, or recorded Telegram proof.

## 31 July WhatsApp Recovery Checkpoint

Meta dashboard access returned for the published TrustKaki app with no required
actions shown. Sanitized read-only Graph API checks confirmed that the existing
token remained valid and the configured phone and WABA were accessible with
HTTP 200. No credentials, provider identifiers, or phone numbers were recorded.

The existing TrustKaki app was then re-subscribed to the existing WABA through
the supported idempotent `subscribed_apps` operation. Meta returned HTTP 200 and
`success: true`; immediate read-back returned HTTP 200 with two subscriptions
and no OAuth error. No WhatsApp message was sent during this checkpoint.

Status changed from externally blocked to **IN PROGRESS**. Completion still
requires one approved fictional inbound message, one policy-controlled reply,
provider delivery confirmation, durable persistence, and dashboard evidence on
the current production release.

### Bounded live retry result

One approved fictional inbound message was sent after re-subscription. The
current production pipeline accepted and processed the webhook once, completed
orchestration, selected the Triage reply, and submitted one outbound reply to
Meta without an application error.

Sanitized persisted evidence for the linked check-in showed:

- two conversation messages: one inbound senior message and one TrustKaki reply;
- eight agent and policy runs with zero fallback and zero recorded errors;
- six medium signals across health, daily-living, and social categories;
- one non-urgent alert and one Yellow briefing; and
- no risk transition because the authoritative result did not change risk.

Meta then delivered a processed `status_failed` webhook with provider error
`131031` (`Business Account locked`). No successful delivery claim is made and
no phone number, message body, provider identifier, or credential is recorded.

The WhatsApp application path is therefore verified through Meta send
acceptance, but final delivery remains **BLOCKED - META BUSINESS ACCOUNT LOCK**.
Token rotation and application changes are not indicated by this result.

Account Quality subsequently exposed the restriction details. Meta classifies
the WhatsApp Business Account restriction as permanent until the Business
Portfolio completes formal business verification. While restricted, the
account cannot start customer conversations, respond to customer messages, or
add phone numbers. No eligible review shortcut was shown; the only offered
action was business verification. TrustKaki must not submit fabricated or
mismatched entity documents for a hackathon verification attempt.
