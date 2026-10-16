# Active Jev routing evaluation — preparation

Date: 16 October 2026. Runtime base: `e19435b`.
Status: prepared locally; separate paid-run approval pending. No provider calls,
database access, deployment or hosted configuration changes during preparation.

## Fixed scope

Ten fictional scenarios, each baseline then active: twenty complete orchestration
flows. The original six cases cover urgent scam/care, mixed care/preference,
grounded recall, ambiguity, social refusal and unavailable memory. Four added
cases cover implicit scam, indirect communication preference, benign recipe help
and social interest requiring the previous message.

Baseline keeps existing social Jev enabled, with routing and shadow disabled.
Active enables specialist routing and disables shadow. Each run records selected
reply, signals, risk, alerts, memory candidate count, actual specialists, routing
trace, Jev-only invocations, requests, elapsed time and successful-call cost.
Automated screens are recorded even when they fail; every reply needs manual
review. Supplied fictional recall evidence does **not** test live RAG retrieval.

## Money and transport

- Separate cap: **US$1**; maximum **110 attempts**.
- Conservative maximum reservation: **US$0.88409** (80 OpenAI requests and 30
  full-context Jev requests). Actual invocation counts may be lower.
- Reserve persistently before transport; failures retain reservations. Fixed
  endpoints/models, key separation, bounded bodies/output, schema/model/usage/cost
  checks, exclusive lock and stopped-ledger refusal are retained.
- No automatic network retries or partial resumption. Runtime fallback is tested
  with mocks; a real provider error stops this experiment.
- New ignored directory: `.jev-active-routing-evaluation/`. Historical ledgers are
  neither reset nor reused. Default shadow scope remains six pairs / 66 attempts.

Prices checked using public sources on 16 October 2026:
[OpenRouter Jev endpoint metadata](https://openrouter.ai/api/v1/models/typesafe/jev-1.14/endpoints)
lists US$0.042/million input tokens, zero completion price and 262,144 context;
[official GPT-4o-mini documentation](https://developers.openai.com/api/docs/models/gpt-4o-mini)
lists US$0.15/million input and US$0.60/million output tokens. OpenAI snapshot
`gpt-4o-mini-2024-07-18` is marked deprecated; unavailable models stop the run,
without substituting another model.

Final offline preflight (no env loaded):

```json
{"protocolHash":"040a7b768fe62165c3abc31e2b170f3ad362441659646dcce6cc2fe2f5e17d68","maxAttempts":110,"reservedUsd":0.88409}
```

## Verification

- Seven related harness/budget suites: **40 tests passed** (six suites / 39 plus
  comparison harness / one). Mocks exercise actual orchestration, active routing
  failure, retained reservations, no retry/resumption, flag restoration, completed
  reuse without calls, separate protocols and outcome-screen negative cases.
- `npm run typecheck`: exit 0.
- Targeted ESLint on all five changed/new TypeScript files: exit 0.
- `git diff --check`: exit 0.
- Independent review: no Critical/Important findings. Minor supplied-memory
  provenance comment added. No new dependencies or runtime code changes.
- App build not repeated for this scripts-only change; runtime base already has
  full test/build evidence in the specialist-routing runtime report.

## Approved command, only after separate spending approval

```sh
node --env-file=.env.local --import tsx scripts/whole-flow-shadow-live.ts --confirm-live --cap-usd=1 --prices-verified --active
```

Interpretation: report helpful extra invocations, false positives, reply quality,
cost and elapsed time honestly. No benefit is a valid result. Tiny baseline-first
paired samples cannot establish general superiority or care safety. Active mode
adds routing work while retaining Triage; no savings claim is assumed.
