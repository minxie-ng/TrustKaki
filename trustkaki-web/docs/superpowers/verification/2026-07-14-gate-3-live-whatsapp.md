# Gate 3 Live WhatsApp Verification - 14 July 2026

## Scope

This verification covers one controlled Meta WhatsApp Cloud API inbound-to-reply
path using the published TrustKaki Meta app, Meta test number, verified demo
recipient, Vercel production deployment, and the TrustKaki Supabase project.
No secret values or raw phone numbers are recorded here.

## Configuration findings

- The production callback is `https://trustkaki.vercel.app/api/whatsapp/webhook`.
- GET verification accepted the configured token and rejected an invalid token.
- Meta dashboard test POSTs reached Vercel and returned HTTP 200.
- The initial real messages did not produce webhook requests.
- The configured phone-number ID and WhatsApp Business Account ID were from
  mismatched Meta test state. They were corrected locally and in Vercel.
- Meta then confirmed that the configured phone belongs to the configured WABA,
  has a verified name, and has Green quality.
- The WABA had only Meta's internal test app subscription. Calling the supported
  WABA subscription operation added TrustKaki. A subsequent read showed both
  TrustKaki and Meta's internal test app.

## Successful live path

At approximately 17:05 SGT:

1. The verified recipient sent `Not hungry today. Knee pain.` to the Meta test number.
2. Meta delivered one signed inbound text webhook to Vercel.
3. The durable inbox accepted and claimed it once.
4. Verified phone lookup resolved the configured demo senior.
5. Orchestrator, Triage, AAC Nudge, deterministic Policy, Pattern Watch, and
   Briefing completed with no fallback or recorded error.
6. Digital Safety was not invoked.
7. Triage detected one medium health signal and one medium daily-living signal.
8. Deterministic policy returned Yellow, no risk change, policy-approved briefing,
   and one non-urgent actionable alert.
9. No risk-event row was added because the senior was already Yellow and there
   was no authoritative transition.
10. TrustKaki selected one Triage reply, sent it through Meta, and persisted the
    outbound external message ID.
11. Meta sent `sent` and `delivered` status webhooks.
12. The recipient confirmed that the generated TrustKaki reply was visible in
    WhatsApp.

Observed response time from inbound receipt to Meta `sent` status was about 36
seconds. This is acceptable for controlled proof but remains a production
latency target.

## Persistence evidence

The successful check-in created or updated:

- 3 conversation messages: one senior message, one internal AAC suggestion, and
  one WhatsApp-delivered Triage reply
- 6 agent runs, including the synthetic deterministic policy and Pattern Watch traces
- 2 validated detected signals
- 1 policy-approved non-urgent alert
- 1 policy-triggered Yellow briefing
- 0 risk events because policy reported `riskChange = none`
- 1 inbound webhook event plus Meta sent and delivered transport events

## Follow-up hardening in this checkpoint

- Persist WhatsApp provenance on inbound conversation messages.
- Process sent, delivered, read, and failed transport events through the durable
  inbox without invoking agents.
- Merge structured delivery state into the linked outbound message metadata.
- Preserve existing outbound metadata and reject older status timestamps from
  overwriting newer delivery state.
- Leave a missing outbound-message race retryable through the existing protected
  pending-event processor.
- Production replay processed the stored `sent` and `delivered` events and the
  linked outbound message finished with structured `delivered` metadata.
- The replay exposed an older unmapped-sender event that would otherwise retry
  indefinitely. Unmapped numbers now close as `senior_not_found` without agent
  execution, identity fallback, reply, or repeated retry.

## Remaining Gate 3 work

- Replace the temporary Meta test token with a narrowly scoped durable System User credential.
- Register and verify a production TrustKaki WhatsApp number and business profile.
- Add a scheduled production cadence for retryable webhook events.
- Reduce response latency and instrument stage-level timings.
- Add administrator-driven multi-senior phone onboarding and mapping validation.
- Complete template, consent, quiet-hours, and multi-recipient caregiver notification workflows.
- Perform controlled load, failure, and token-rotation tests before an organisational pilot.

## Status

The controlled real inbound-to-reply path is **LIVE VERIFIED**. Gate 3 is not yet
complete for organisational production because the test number and temporary
credential remain in use and the remaining items above are open.
