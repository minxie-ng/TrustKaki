# Jev routing shadow runtime

16 October 2026. Local implementation; **disabled by default, not deployed**.

## What changed

Extracted the screening's six-question request/parser and baseline adapter into
`src/lib/agents/routingContract.ts`. Evaluation re-exports preserve existing
callers. The dataset/questions SHA-256 remains
`c89cafc8cf4eb7535a4b5e02c50d307e8bf8a7ee4408133697c53e287e817e9e`.

Added a server-only opt-in named `TRUSTKAKI_JEV_ROUTING_SHADOW_ENABLED`.
Only the exact value `true` enables it. The template defaults to `false`; local
and hosted environment files were not changed. It is independent of the existing
social-decision flag. When enabled, it starts one OpenRouter Jev request alongside
Triage, with a three-second abort, redirect rejection and no retry. Existing input
bounds reject oversized messages/context without sending them; no silent truncation.

Jev observes health, daily-living, digital-safety, social, durable-context and urgent
labels. Its result enters only an appended `Jev Routing Shadow` trace using the
existing orchestrator identity. Replies, specialist selection, policy risk,
briefings and memory proposals keep their existing inputs and authority.

The existing technical panel displays all six labels, disagreement summary,
resolved model, request duration and fallback status. No UI components or access
rules changed. Ordinary caregivers retain existing trace restrictions.

Trace data excludes current-message text, context, prompts, baseline prose and
provider errors. It records only validated labels, disagreement names, numeric
usage/cost, bounded model identifier, timing, message character count and fixed
error codes. Triage fallback/invalid output produces a null comparison baseline,
not all-negative evidence. No state changes are attributed to the shadow.

## Verification

- Full suite: **151 test files passed, 5 skipped; 1,142 tests passed, 38 skipped**.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run build`: exit 0; compiled successfully and generated 24 static pages.
- Dataset/question hash check and `git diff --check`: exit 0.
- Independent read-only AI review: no Critical or Important findings.

New tests first failed before their implementation. Paired enabled/disabled
orchestration tests assert unchanged replies, signals, policy, risk, alerts,
briefings, internal memory candidates and specialist prompts for urgent/scam
overlap, mixed care/preference, RAG recall, ambiguity, Triage fallback, Jev failure
and social refusal. Another test verifies both Jev paths can coexist without
shadow overriding a social refusal. Observer tests cover disabled/missing-key/
oversized-input suppression, sanitization, invalid output and three-second abort.
Transport is mocked; no paid API calls or database writes occurred in this slice.

The first sandbox full-suite attempt failed ten existing smoke tests because
localhost binding returned `EPERM`. Running outside that restriction passed.
The existing Vite configuration deprecation notice is non-blocking.

## Limits and next checkpoint

This verifies wiring and noninterference on fixtures, not live end-to-end
classification quality, memory retrieval or performance. The prior completed
[routing screen](2026-10-16-jev-routing-results.md) remains a small model comparison.

Shadow mode adds one request per eligible orchestration turn; enabling social
decisions too can produce a second Jev request for a social turn. Parallel execution
can still add latency when the existing path finishes first. No whole-flow cost
or speed savings are claimed. Usage in traces is reported successful-call cost,
not a spending control or accounting for failed requests.

Before enabling it, separately prepare and approve a capped fictional whole-flow
evaluation. The current message and bounded supplied context will be sent to
OpenRouter when enabled; enabling against real records requires a separate data
scope decision. Runtime authority and hosted release remain later checkpoints.
No new dependencies, schema migrations, tables or frontend redesign were added.
