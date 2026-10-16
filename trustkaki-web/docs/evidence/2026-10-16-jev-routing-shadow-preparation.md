# Jev routing shadow evaluation: preparation

Date: 16 October 2026. Status: first execution stopped on network failure;
no model observations recorded.

Historical preparation/first-stop record. The owner later approved both retry
amendments and the screen completed; see [final results](2026-10-16-jev-routing-results.md).

## Scope

Compare Jev's six structured routing decisions with the actual Triage prompt,
formatter and output schema. Use 36 fictional messages across 12 semantic families,
with English, Mandarin and Singlish variants. Six families are reserved. This is
a small screening experiment with developer labels reviewed by another AI, not
clinical validation or proof of whole-application performance.

The production application does not import this evaluation code. Jev's existing
social-intent integration and hosted candidate remain separate from this work.

## Verification

Focused command:

```sh
npm run test -- src/lib/agents/evaluation/routingShadow.test.ts scripts/routing-shadow-live.test.ts scripts/social-intent-budget.test.ts scripts/agent-comparison-budget.test.ts
```

Result: **4 test files passed; 25 tests passed**. Transport is mocked.
`npm run typecheck`, targeted ESLint and `git diff --check` also exited 0.
The full suite and production build were not rerun for this evaluation-only slice.

Independent AI review found no remaining Critical or Important issues after
fixing fallback handling, baseline social mapping, held-out daily-living coverage
and ambiguity labels. This is a code/protocol review, not expert safety review.

Offline preflight: 72 attempts, US$0.472516 reserved across the complete plan,
zero network requests. Reservation is a conservative budget bound, not measured
spending. Dataset/question SHA-256:
`c89cafc8cf4eb7535a4b5e02c50d307e8bf8a7ee4408133697c53e287e817e9e`.
The runner additionally hashes the actual baseline bodies and protocol version.

## Pricing check

Read-only provider checks on this date matched the runner's rates:

- [OpenRouter Jev endpoint metadata](https://openrouter.ai/api/v1/models/typesafe/jev-1.14/endpoints): US$0.042/M input tokens, zero output-token price, 262,144-token context.
- [OpenAI GPT-4o-mini documentation](https://developers.openai.com/api/docs/models/gpt-4o-mini): US$0.15/M input and US$0.60/M output tokens. The page labels the pinned model deprecated; actual endpoint availability has not been tested in this experiment.

If the pinned baseline is unavailable, stop under the same no-retry rule. Do not
silently substitute a model; that changes the comparison and frozen protocol.

## Pending approval and execution

Separate authorization is required for up to US$1 total on this routing
comparison: 36 Jev calls and 36 GPT-4o-mini calls, at most 72 attempts, no automatic
retries. A failure stops the run and retains its reservation. Existing social
evaluation approval does not cover this new experiment.

The owner subsequently approved this US$1 routing scope. Execution stopped on
the first Jev attempt in the restricted sandbox. A read-only DNS diagnostic
returned `ENOTFOUND` for `openrouter.ai`; the same diagnostic outside the sandbox
succeeded. No retry was made. The ledger retains one attempt and US$0.011011
reserved, with `stopped: true` and `inFlight: jev:routing_01_1`; no observations
were saved. Reservation is not evidence of billing. Protocol hash:
`ba504aa5e4bb9af8c4b67d36cc863a9d058b3d5c691eaa47c88168b143553d88`.
Continuing requires approval for the failed-attempt retry under the promised
no-retry protocol, retaining this reservation and the US$1 cap.

After approval, with current prices verified:

```sh
node --env-file=.env.local --import tsx scripts/routing-shadow-live.ts --confirm-live --cap-usd=1 --prices-verified
```

The ignored `.jev-routing-evaluation/` directory holds its separate persistent
ledger and observations. No database access, production writes or messages to
seniors are part of the experiment. Runtime adoption and deployment require
subsequent evidence and release checkpoints.
