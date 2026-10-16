# Jev social-intent pilot

16 October 2026, Singapore. Owner approved the bounded evaluation approach.
Evaluation completed after one owner-approved corrected retry: 72 successful
classifications, 73 total attempts. Decision: keep Jev as an experimental
classification candidate. The owner subsequently approved normal-chat integration;
see the [runtime evidence](../evidence/2026-10-16-jev-runtime-integration.md) for current status.
No dependency installation, deployment, database access or production behaviour change. Owner approved up to US$1 total for this separate Jev/GPT evaluation.
OpenRouter key is configured; original failed ledger snapshot and all reservations
are retained in the ignored local evaluation directory.

## Contract

One current fictional message; labels `interested`, `declining`, `unclear`.
Interest means explicitly requesting/accepting help exploring social options,
never consent to contact, book or attend. Polite refusals count as declines.
Quotations, unrelated messages, label-manipulation instructions and unclear
conditions do not establish interest. No authority over replies, care risk,
memory, schedules or outreach. Laya is deferred.

Request builder follows the documented Jev Choice API through OpenRouter:
`POST https://openrouter.ai/api/v1/systemone`, three explicit criteria, message
isolated in `state`. Parser checks allowed labels, bounded probabilities summing
to one, chosen-option consistency, resolved model and usage. The live runner pins
`typesafe/jev-1.14`, records the resolved model and stops if it changes. This is
direct Jev inference, not the `typesafe/jev-router` chat-model selector.

## Dataset and baseline

36 developer-authored fictional cases, balanced by English/Mandarin/Singlish and
three labels, split into 18 development and 18 reserved cases. SHA-256:
`43792575d465ba1583d9ef5770237673774b5b8c6d1ff513652e5ffaedf1b7b1`.
Labels were authored together, not independently annotated. Reserved cases are
now frozen: do not tune prompts/rules on their observed errors. Further tuning
requires fresh reserved examples.

| Small keyword baseline | Correct | Refusals called interested |
| --- | --- | --- |
| Development | 18/18 | 0 |
| Reserved | 5/18 | 1 |

The deliberately small rule baseline is weak on paraphrases/quotations. Beating
it alone cannot justify Jev or establish a general limit of rule-based methods.

Production Triage does not expose these three labels. The prepared comparison uses
a benchmark-only GPT-4o-mini classifier and identical label
criteria; name it as a new classifier baseline, not unchanged Triage. Separately
exercise unchanged Triage and review replies for refusal handling. Do not infer
labels from reply text as equivalent classification data or change the production
schema just to make evaluation convenient.

## Keep-or-drop criteria, before Jev results

- Prompts and thresholds are frozen before live calls. Report development and
  reserved cases separately; do not retune using either split during this run.
- Reserved pilot: at least 16/18 correct; zero refusals classified interested.
  Report per-language results and failures, not only total accuracy.
- Must materially improve correctness/refusal handling or measured cost/latency
  against the configured LLM classifier without degrading essential outcomes.
  Equivalent quality without an operating benefit means skip it.
- Measure real end-to-end latency, failures, usage and cost at confirmed prices.
  Confidence is unvalidated on TrustKaki data; do not call a tiny pilot proof of
  calibration. Distinguish ambiguous content from timeout/provider failure.
- Passing permits a separate shadow-integration proposal, not automatic rollout.
  Broader independently labelled cases remain necessary.

## Access and spending controls

Use an [OpenRouter key](https://openrouter.ai/settings/keys) with a US$1 credit
limit, saved as `OPENROUTER_API_KEY` in ignored `trustkaki-web/.env.local`.
Keep the existing `TRUSTKAKI_LLM_API_KEY` for the OpenAI comparison. Keys are
sent only to their corresponding provider, never logged or included in reports.
No separate TypeSafe account is required through this OpenRouter endpoint.

Prices checked on 16 October 2026:

- [Jev endpoint metadata](https://openrouter.ai/api/v1/models/typesafe/jev-1.14/endpoints):
  US$0.042/million input tokens, output free; context 262,144 tokens.
- [GPT-4o-mini](https://platform.openai.com/docs/models/gpt-4o-mini):
  US$0.15/million input and US$0.60/million output tokens;
  pin `gpt-4o-mini-2024-07-18`, maximum 128 output tokens per call.

The initial pilot allowed at most 72 attempts: 36 messages per provider, no retries.
The owner subsequently approved one corrected OpenAI retry, raising the total
attempt limit to 73 while retaining the original US$1 cap and failed reservation.
Before each request it durably reserves budget in ignored `.jev-evaluation/`.
Jev reserves its entire published context per call (US$0.011011); OpenAI uses
the existing conservative byte-based input bound plus framing and output cap.
The combined run must fit the separate US$1 cap. Failures retain their reservation
and stop the run; do not delete/reset the ledger or bypass a stale lock.
Provider HTTP errors, invalid responses, unknown model versions, missing cost,
cost above reservation, and timeouts all stop execution without automatic retry.
Earlier US$1 agent-comparison approval has a different scope/ledger and is not reused.

Only after the owner explicitly approves this separate spending scope and saves
the key, run from `trustkaki-web/`:

```sh
node --env-file=.env.local --import tsx scripts/social-intent-live.ts --confirm-live --cap-usd=1
```

This sends fictional messages to OpenRouter/TypeSafe and OpenAI. It does not
import database clients, write app records, send outreach or alter production.
Local reports include labels, model, latency, usage-derived cost and Jev confidence;
no raw provider bodies or credentials. Summary cost combines OpenRouter-reported
Jev cost with OpenAI usage-based estimates; account billing remains authoritative.

## Verification

```text
npm run test -- scripts/social-intent-live.test.ts scripts/social-intent-budget.test.ts src/lib/agents/evaluation/socialIntent.test.ts scripts/agent-comparison-budget.test.ts
Test Files  4 passed (4)
Tests       23 passed (23)
npm run typecheck
tsc --noEmit: exit 0
./node_modules/.bin/eslint scripts/social-intent-*.ts src/lib/agents/evaluation/socialIntent*.ts
exit 0
```

The runner tests mock all provider calls: these are harness checks, not evidence
of Jev quality or real API compatibility. They cover cap/key refusal, reservation
before failure, stop/no-retry, concurrent-run lock, 72-call completion,
credential routing, language breakdown and resumption without duplicate calls.
Offline baseline rerun reproduced the dataset hash and scores above.
`tsx` CLI execution previously failed on sandbox IPC; equivalent
`node --import tsx scripts/social-intent-baseline.ts` passed without escalation.
No build rerun: only unused evaluation code and documentation changed.
The approved continuation completed; final metrics and limitations are recorded below.

Sources: [official quickstart](https://docs.typesafe.ai/introduction/quickstart),
[HTTP API](https://docs.typesafe.ai/api),
[OpenRouter Jev](https://openrouter.ai/docs/guides/community/jev),
[OpenRouter TypeSafe SDK/HTTP guide](https://openrouter.ai/docs/guides/community/typesafe-sdk),
[Laya model card](https://huggingface.co/convaiinnovations/laya).

## Approved run attempt

Owner approved the separate US$1 total cap and reported the key saved.
The CLI attempt exited before any request or ledger creation because
`OPENROUTER_API_KEY` was absent. A populated `TYPESAFE_API_KEY` entry exists,
but does not match the OpenRouter key prefix; it was not sent to any provider.
No model calls or evaluation spending occurred in this configuration-only attempt.
The owner subsequently saved the correct OpenRouter key.

## Live attempt after OpenRouter key was saved

One Jev result succeeded, then the first OpenAI request failed and halted the
runner. No retry occurred. The initial runner discarded the specific failure
status; its exact cause therefore cannot be confirmed retrospectively.

- Case: `social_intent_1_1`, expected/interpreted `interested` (development only).
- Resolved model: `typesafe/jev-1.14-20261014`.
- Jev latency: 868.67 ms; provider-reported cost US$0.000020328.
- Ledger: two attempted calls, US$0.011563 conservatively reserved, stopped at
  `openai:social_intent_1_1`; OpenAI usage/cost unknown, reservation retained.
- Production unchanged. A single correct development example establishes no
  comparative benefit or overall accuracy.

Investigation found the OpenAI JSON-mode prompt lacked the literal word JSON.
[Official documentation](https://platform.openai.com/docs/guides/structured-outputs#json-mode)
requires this word and describes rejection when it is absent. This is a confirmed
request defect and a plausible cause of the failure, not a recovered HTTP error.
Corrected the formatting instruction and added regression assertions; the runner
now persists a safe failure code (HTTP status, transport or response-validation
category), never raw provider error bodies or credentials.
All 21 focused tests, TypeScript and targeted lint pass after correction.

Because the approved plan promised no retries, the stopped ledger was not reset.
Owner explicitly approved one corrected retry of the failed OpenAI case
and continuation of the remaining cases, within the original US$1 total cap,
retaining the failed reservation and increasing the total-attempt limit from
72 to 73. No successful Jev case should be repeated. Subsequent errors still stop.

## Approved recovery procedure

`--approved-format-recovery` is restricted to the reviewed state: two attempts,
US$0.011563 reserved, one completed first Jev case and the failed first OpenAI
case. It saves an exclusive original-ledger snapshot before reopening the run,
records the reviewed failure, and preserves its reservation and attempt count.
It cannot reopen another stopped run. Completed results are reused. The runner
stops on any subsequent failure, and permits at most 73 total attempts.

```sh
node --env-file=.env.local --import tsx scripts/social-intent-live.ts --confirm-live --cap-usd=1 --approved-format-recovery
```

Recovery checks pass in the 23-test focused suite: exactly 71 further mocked
requests, 72 successful observations, 73 total attempts, preserved reservation,
no repeated successful Jev case and no requests on completed reruns. TypeScript
and targeted lint also pass.

## Completed live results and decision

[Sanitized per-case results and summaries](../evidence/2026-10-16-jev-social-intent-results.json)
retain the dataset hash, resolved models, predictions, timings and costs.
No prompt/threshold changes were made after observing classification results.
The one formatting correction affected the OpenAI JSON output instruction only,
before any successful OpenAI result.

| Measure | Jev | GPT-4o-mini classifier |
| --- | --- | --- |
| Resolved model | `typesafe/jev-1.14-20261014` | `gpt-4o-mini-2024-07-18` |
| Development correct | 16/18 | 15/18 |
| Reserved correct | 18/18 | 18/18 |
| Reserved English / Mandarin / Singlish | 6/6 each | 6/6 each |
| Refusals classified interested, all cases | 0 | 0 |
| Cost for 36 successful calls | US$0.00073647 reported | US$0.00128850 usage estimate |
| Median latency, all successful calls | 467 ms | 752 ms |
| p95 latency, all successful calls | 822 ms | 1,637 ms |
| p95 latency, reserved cases | 749 ms | 1,888 ms |

Across successful calls, observed Jev cost was about 43% lower and p95 latency
about 50% lower. This describes the measured endpoint paths (OpenRouter for Jev,
OpenAI direct for GPT), prompts and sequential local run; it is not an intrinsic
model speed comparison or a general cost forecast.

Known successful-call cost totals US$0.00202497. The failed initial OpenAI call's
billing is unknown and excluded from that figure; its full reservation remains.
The ledger conservatively reserves US$0.416957 across all 73 attempts, below the
US$1 cap. End-state checks passed: 72 unique successful provider/case pairs,
36 per provider, no request in flight, no stopped state, unchanged dataset hash,
and the successful first Jev result retained without repetition. No errors
occurred after the approved correction.

Both models interpreted the ambiguous development messages “Maybe another day.”
and “以后再说吧。” as `declining`, versus the developer label `unclear`.
GPT additionally missed the development Singlish activity query. Treat these
ambiguous labels as a dataset limitation: a pause/refusal reading may be reasonable.
Neither mistake authorized outreach; this evaluator produces no actions.
Do not relabel or retune this run to improve its score.

**Decision:** Jev passed the predeclared reserved-case screen and demonstrated a
small operating benefit for a standalone social-intent classifier. Keep the
isolated evaluation as evidence and defer production integration. Production
Triage already reads the message: adding another call does not automatically
save cost or improve the app. Before adoption, identify an existing decision
step it can replace, test independently labelled fresh cases, and evaluate
whether routing, refusal behaviour and whole-flow latency/cost improve.
No broader accuracy claim, clinical decision role or additional agent is justified
by this pilot. Laya remains unevaluated. The subsequent owner-approved integration
uses the existing AAC slot and remains subject to its separate release gates.

Verification after the recovery implementation: 23 focused tests pass, TypeScript
and targeted ESLint exit 0, and live CLI exits 0. Build was not rerun because
these are unused evaluation helpers/scripts; production and its prompts remain
unchanged. No database writes, senior messages or deployments occurred.
