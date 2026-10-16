# Jev routing screening results

16 October 2026. **Completed screening; production unchanged.**

## Execution and verification

Owner approved the original US$1 experiment and two explicit retry amendments.
Final continuation exited 0: **74 attempts, 72 successful observations, 36 paired
messages**. Both failed reservations were retained. Reserved US$0.494538 is below
the US$1 cap. Successful-call cost totals US$0.013677648; failed-call billing is
unknown and is covered by retained reservations. No database access, care writes,
messages or deployment occurred.

The initial failure was sandbox DNS; the second failure's cause was not retained
by the original error handler. No cause is inferred. Both were retried only after
explicit owner approval. Safe diagnostic metadata was subsequently added.

Frozen protocol:
`ba504aa5e4bb9af8c4b67d36cc863a9d058b3d5c691eaa47c88168b143553d88`.
Dataset/questions:
`c89cafc8cf4eb7535a4b5e02c50d307e8bf8a7ee4408133697c53e287e817e9e`.
Prompts, dataset and labels were unchanged during execution. Models returned
`typesafe/jev-1.14-20261014` and `gpt-4o-mini-2024-07-18`.

Focused verification: **3 files passed, 20 tests passed**, including both approved
recovery paths and reservation retention. Typecheck, targeted ESLint and
`git diff --check` passed. No full production build was rerun for this evaluation-only
slice. [Machine evidence](2026-10-16-jev-routing-results.json) preserves all 72
fictional judgments, model identities, measured durations and successful costs.

## Results

| Metric | Jev | Current Triage adapter |
| --- | ---: | ---: |
| All six labels match, all messages | 24/36 | 21/36 |
| All six labels match, reserved families | 12/18 | 8/18 |
| False-positive flags | 9 | 9 |
| Missed expected-positive flags | 0 | 9 |
| Missed explicit urgent/scam positives | 0 | 0 |
| Expected-unclear flags matched | 11/15 | 0/15 |
| Successful-call cost (USD) | 0.002204748 | 0.011472900 |
| Observed endpoint p95 | 859 ms | 3,494 ms |

There are **12 independent semantic families**, each translated into English,
Mandarin and Singlish, not 36 independent real-world scenarios. Six families were
reserved. Developer labels were independently AI-reviewed, not clinician-annotated.
Only one urgent-positive family exists (three translations); zero misses here
does not establish general safety. Neither model perfectly matches the rubric.

Jev detected all labelled positives, including daily-living needs and durable
accessibility preferences in mixed messages. The Triage adapter missed six
daily-living and three durable-context labels. Some meal concerns were classified
under health, so missing a specific routing flag does not mean ignoring care.
The adapter and existing Triage taxonomy influence this comparison.

Jev overclassified knee pain as daily-living needs, skipped meals and a larger-text
preference as health, and one social request as durable context. It also returned
`absent` instead of `unclear` for all three social ambiguity labels and one urgent
ambiguity label. Therefore its negative labels must not independently suppress
clarification or safety checks. Its confidence scores are not calibrated evidence
of elder-care accuracy.

The baseline has no explicit per-field abstention contract, so the ambiguity
rubric favors an ability Jev exposes and Triage does not. This is an architecture
difference, not a fair standalone general-intelligence ranking. Endpoint cost and
latency compare Jev classification with full Triage response generation, not
whole-flow cost or response time. Running both initially adds work.

## Decision

The screening's explicit urgent/scam miss gate and held-out positive-recall gate
pass. This supports a **bounded whole-flow shadow experiment**, not replacement
of Triage or independent care-risk authority. Keep the corpus frozen; any revised
rubric or prompt is a new experiment and needs fresh reserved cases.

Recommended next slice: add optional Jev routing in shadow with visible decisions
and disagreement traces, leaving current routing and policy in control. Verify
mixed intents, memory grounding, clarification, provider failure, and whole-flow
cost/latency before proposing runtime adoption. Live model spending and release
remain separate checkpoints. Presentation now: “We evaluated Jev for broader
structured routing; current hosted integration handles social intent.”
