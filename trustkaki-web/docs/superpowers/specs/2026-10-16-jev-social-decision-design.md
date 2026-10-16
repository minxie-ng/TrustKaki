# Jev social-decision integration

Status: owner approved normal-chat integration on 16 October 2026. The owner wants
Jev included in the final judge demonstration. Benchmark-only inclusion does not
satisfy that request. Runtime integration is implemented and enabled locally;
hosted release is pending separate approval.

## Decision and alternatives

Recommended: integrate Jev into normal chat's activity-related branch, with an
observable decision and a bounded reply. This makes the model perform a real
product function and gives the judge a reproducible demonstration.

Smaller alternative: replace classification in the standalone AAC nudge tool.
This affects fewer paths but does not demonstrate Jev in ordinary chat.
A read-only shadow decision provides evidence but does not meet the request for
a model that affects the final application.

## Behavior

Use the existing three-label contract and criteria from the frozen benchmark:
`interested`, `declining`, `unclear`. Interest means willingness to explore options,
never permission to contact, book, attend or change long-term preferences.

For normal chat, invoke Jev only for an activity-related current message or an
validated Triage social signal or legacy social-support route, not every message. Existing urgent-health,
scam and capability replies retain priority. A social signal alone never means
interest. Requests to stop suggestions remain eligible for classification.
Overlong inputs are not silently truncated into a different meaning; skip the
model with an explicit unavailable result.

Jev's validated result selects a short, language-appropriate social reply:

- Interested: ask about activity preferences without claiming event availability,
  booking or completed contact.
- Declining: acknowledge the refusal and stop the activity suggestion.
- Unclear: ask one neutral question to clarify willingness, with no invitation.
- Unavailable: acknowledge the limitation without suggesting an activity.

This replaces the unrestricted social reply for the selected branch. It does
not replace Triage's care-signal extraction or deterministic risk policy.
No new autonomous agent, event API, memory write or outbound action is added.
Keep the existing standalone AAC route consistent with this decision helper.

## Provider and observability

Use the existing server-only `OPENROUTER_API_KEY`, exact OpenRouter System One
endpoint and pinned `typesafe/jev-1.14` request. Reuse the verified request/response
contract through a shared runtime module; runtime code must not depend on the
fictional dataset. No additional SDK is needed.

Feature configuration must explicitly enable Jev. Bound input and timeout; make
one request with no automatic retries. Reject bad distributions, invalid labels,
unexpected models and provider failures. Missing configuration or failure selects
unavailable behavior, never an inferred interested label. Preserve existing API
authorization and rate limits; keep secrets out of errors and traces.

Record one existing AAC trace named `Jev Social Decision` with the actual resolved
model, decision, latency and fallback status. The current demo-admin Run details
panel already supports these fields; ordinary caregivers must not receive
technical traces. Use summaries rather than duplicating raw message content.
A fallback must not claim Jev successfully classified a message.

## Verification and release

Test the provider boundary, no-retry/timeout behavior, disabled/missing config,
input limits and invalid output. Test normal-chat refusal/uncertainty/interest,
urgent/scam/capability priority, one selected reply, and unchanged risk/memory
authority. Confirm the existing AAC endpoint and dashboard trace remain usable.
Run focused tests, typecheck, lint and `npm run build`.

Use mocked provider responses for integration tests. The earlier paid benchmark
approval is not open-ended approval for further live evaluation. Extra paid
checks need a bounded scope and remaining-budget accounting. Deployment, hosted
secrets and promotion follow the existing release runbook and its approvals.

Judge walkthrough: demonstrate an activity request, a polite refusal and an
ambiguous message; show Jev's real decision/model and corresponding reply.
Show urgent-help priority and an honest provider-failure fallback.
Describe the 36-case pilot as developer-authored fictional data, not proof of
general reliability. Explain Jev's bounded decision role accurately.
