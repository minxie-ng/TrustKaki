# Jev specialist routing authority

<!-- documentation-context -->
> **Historical design / evaluation record.** This document preserves the plan and decisions at its recorded stage. Proposed work and approval checkpoints are not claims about the current deployed product. Start with the [documentation index](../../README.md) or [current architecture](../../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


Status: **owner approved for local implementation on 16 October 2026**.
Base: local reply corrections `f3b34e1`. Production remains `410b6ef`;
the existing social-decision candidate is still unpromoted.

## Goal and alternatives

Give Jev useful, visible authority over specialist invocation, grounded in the
[routing screen](../../evidence/2026-10-16-jev-routing-results.md) and
[full-chat findings](../../evidence/2026-10-16-jev-whole-flow-results.md).
Those results support a bounded experiment, not superiority or sole care-risk
authority. The [reply corrections](../../evidence/2026-10-16-chat-reply-corrections.md)
are locally verified, without post-fix paid evaluation.

Options:

1. **Jev specialist router with safety overrides — recommended.** Jev can request
   real specialist work. Triage and deterministic guards retain independent
   triggers. Adds a call; useful for detecting missed routing needs, without
   removing existing detection.
2. Keep shadow only. Smallest risk and already implemented, but Jev cannot alter
   routing and does not meet the desired operational role.
3. Replace Triage with Jev. Not recommended: the typed classifier does not supply
   evidence descriptions, severity judgments or conversational replies. A
   replacement would require a separate care-extraction/generation design and
   much broader evaluation.

## Architecture

Reuse the six-label Jev contract, parser, OpenRouter transport and trace format.
No new agent identity, database, framework or dependency.

Start Jev and Triage in parallel using the same bounded, server-authorized
context. Triage remains responsible for care-signal extraction and a reply draft.
After both return, deterministic routing combines Jev requests with existing
Triage/lexical triggers. Each specialist runs at most once per message.
Existing policy determines risk, alerts and Briefing. Select one senior reply
after policy and capability checks; Briefing receives that actual selected reply.

This is **primary specialist routing with independent overrides**, not exclusive
control of the application. Parallel Triage remains; do not claim saved calls,
lower end-to-end cost or lower latency.

## Exact authority table

| Jev label | `present` | `unclear` | `absent` |
| --- | --- | --- | --- |
| Digital safety | Request existing Digital Safety specialist | Request Digital Safety conservatively | Cannot cancel Triage or lexical safety triggers |
| Durable context | Request existing Context Memory extractor, subject to existing exclusions | No additional extraction; existing triggers still apply | Cannot cancel existing durable-context triggers |
| Social | Make existing social-intent specialist eligible, subject to all care/capability/refusal checks | No Jev-added social eligibility; existing eligibility remains subject to care gates | Cannot cancel existing explicit activity/social eligibility |
| Health, daily living, urgent | Pause social suggestions for this message | Pause social suggestions for this message | Cannot cancel care signals, urgent rules or other care gates |

For health/daily-living/urgent labels this slice grants **no severity assignment,
risk change, diagnosis, fabricated signal or memory fact**. Existing Triage and
policy still decide care responses and escalation. Where a Jev care flag pauses
an otherwise eligible activity reply but Triage detects no corresponding care
signal, use a short, non-diagnostic clarification instead of a social suggestion:
“Before discussing activities, what help do you need right now?” (Mandarin
equivalent when appropriate). Record that this was a classifier discrepancy,
not a verified care observation. Do not invent a caregiver alert or persisted
follow-up from it. This does not solve missed care detection generally.

Urgent/digital-safety replies keep priority over that clarification. A requested
scam assessment that returns inconclusive must still use the existing cautious
safety response; never interpret classifier absence or specialist uncertainty as
proof that a sender/link is safe.

Context Memory remains a proposer. Existing secret/recall exclusions, exact
current-message evidence checks, durable-context validation, identity boundaries
and persistence rules apply unchanged. Merely asking about a remembered fact
must not create new memory. A social refusal never becomes consent; the existing
interested/declining/unclear social contract remains necessary.
Social-intent execution also requires its existing `TRUSTKAKI_JEV_ENABLED` flag;
enabling routing alone does not enable social inference.

## Modes, failures and rollback

Add one opt-in authority flag, `TRUSTKAKI_JEV_ROUTING_ENABLED`, default false.
Preserve the existing independent social flag and shadow-only flag. Authority
mode uses one routing request even if the shadow flag is also enabled; its trace
records active routing plus comparison. Shadow alone remains observational.
Turning authority off restores current routing immediately for subsequent
requests; social integration retains its own existing enablement.

Routing timeout stays three seconds, one attempt, no automatic retry. Missing
key, invalid labels/model, input bounds, provider failure or timeout fall back to
the current Triage/guard routing path. Failure is not an all-absent judgment.
Do not add an extra Jev retry or duplicate shadow call. Existing per-agent error
handling still applies after a specialist is requested.

Trace actual model/version, validated six labels, requested specialists, overrides,
executed specialists and fallback reason. State clearly whether the mode was
shadow or active. Persist only bounded routing metadata; no new raw context,
provider error text or secrets in routing traces. Ordinary-caregiver restrictions
remain unchanged. Judges should be able to see a request Jev actually caused,
not merely a renamed trace.

## Acceptance and implementation boundaries

Before implementation, owner reviews this exact authority design. Then prepare
a small implementation plan covering routing combination, orchestrator wiring,
trace semantics and tests. No deployment, new paid run or production flag change
is included in design approval.

Required local verification:

- Flag off preserves current behavior and makes zero routing requests; shadow
  remains non-authoritative; both flags make only one routing request.
- Jev-only positive safety/durable/social decisions cause the specified real
  specialist invocation; calls and trace source attribution match.
- An absent Jev label cannot suppress Triage/lexical safety, care or durable
  triggers. Multiple intents coexist; refusal remains respected.
- Unclear safety invokes assessment; unclear durable does not add extraction;
  unclear care prevents activity suggestions without inventing severity/signals.
- Invalid/timeout/unconfigured routing restores existing behavior with a visible
  fallback. No automatic retry or duplicate specialist invocation.
- Recall, explicit updates, secret exclusion, grounded replies, unsupported meal
  offers, urgent/scam precedence and selected-reply Briefing checks still pass.
- Full tests, typecheck, lint and build pass. Independent code review resolves
  material issues before any live-release proposal.

A later, separately approved fictional evaluation must include cases where Jev
changes invocation, care false positives, uncertainty, actual fallback, and the
post-fix reply cases. Measure complete-flow quality, requests, cost and latency;
do not reuse completed ledgers or call classification-only results full-chat
evidence. Deployment and promotion follow the existing separate release gates.

## Honest pitch language

Until implemented and verified: “We are developing Jev specialist routing.”
After local verification: “Our local integration uses Jev to request specialist
checks, with Triage and explicit safety overrides.” Only after the hosted build
is verified may the hosted demonstration use that claim.

“Jev routes specialist work; the conversational model interprets care needs and
writes replies; Neon RAG supplies personal context; policy constrains actions.”
Avoid “Jev makes every decision,” “clinically safe,” or unmeasured efficiency
claims. This slice does not add community-event discovery, bookings or outreach.
