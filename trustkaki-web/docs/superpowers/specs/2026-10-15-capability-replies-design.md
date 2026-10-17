# Capability-safe replies

<!-- documentation-context -->
> **Historical design / evaluation record.** This document preserves the plan and decisions at its recorded stage. Proposed work and approval checkpoints are not claims about the current deployed product. Start with the [documentation index](../../README.md) or [current architecture](../../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


User approved proceeding after the failed comparison on 15 October 2026.

The reply is generated and bound for retry before memory persistence returns.
Telegram and WhatsApp also select/store it before persistence. Changing it after
the write would make retry bindings, stored messages and deliveries disagree.

Use server-owned neutral acknowledgement while memory extraction is requested;
save status is unconfirmed at this point, including extraction failure or no safe
candidate. No success confirmation is needed for this slice. Keep actual storage
outcomes in existing persistence metadata. Preserve candidate validation, retry
envelopes and all channel callers.

For recognised requests to relay/contact someone or change text size, use fixed
capability wording. Urgent health and Digital Safety replies retain priority.
Memory acknowledgements with health/daily-living signals retain a caregiver
follow-up suggestion. English/Mandarin selection follows the incoming text or
existing draft script; this is a language hint, never a capability claim.

This replaces repeated prompt tuning for these bounded paths. A new judging agent
adds cost and another probabilistic decision; post-write rewriting changes channel
replay contracts. Neither is needed. General conversation and RAG recall retain
their existing drafts. Unsupported-action intent matching is bounded to explicit
English/Mandarin requests; this does not guarantee detection of every paraphrase.

Acceptance: adversarial promises cannot escape on selected paths; empty/failed
extraction cannot claim success; one reply, existing safety priority, candidate
provenance and final briefing context remain intact. Verify regression tests,
bounded fictional live follow-ups against the existing US$1 ledger, full validation
and independent review if available. No new dependencies, migrations or deployment.
