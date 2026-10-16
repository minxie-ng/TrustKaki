# Jev full-chat evaluation: preparation

16 October 2026. **Prepared; zero live model requests. Production unchanged.**

## Exact proposed scope

Six fictional scenarios, each run with routing shadow disabled and enabled:
urgent/scam overlap, mixed care/communication preference, grounded memory recall,
ambiguous issue, social refusal and unavailable memory. English, Mandarin and
Singlish are represented. Existing social decisions are enabled in both variants.
These are 12 calls to actual orchestration, not 12 provider calls. The maximum
plan permits **66 provider attempts** under a separate **US$1 total cap**.

Supply fabricated context in memory. No database queries, memory retrieval,
application endpoints, persistence, real senior records or messages are part of
the test. It exercises use of supplied RAG evidence, not live retrieval.

The runner intercepts fetch only inside a standalone CLI process. It fixes GPT
to `gpt-4o-mini-2024-07-18`, keeps actual application prompts, enables Jev social
decisions, and varies only the routing shadow flag between pairs. Temporary env,
fetch and console state is restored. The provider singleton is process-local;
this harness must not be embedded in an application server.

## Spending and stop safeguards

- Fixed OpenAI and OpenRouter endpoints, exact keys per destination, no redirects.
- Frozen source/corpus/prompt/dependency/Node fingerprint; exclusive run lock.
- Atomic reservation before each request; retained reservations on failure.
- 40,000-byte OpenAI request maximum, 1,024 output tokens; full-context Jev reservation.
- Three-second Jev and 15-second OpenAI transport abort limits. The wrapper consumes
  and validates provider JSON before returning a response to the application.
- Model, token usage, application schema and cost-bound checks.
- No network retry: repeated internal agent attempts are blocked. HTTP, transport,
  validation, unpriced request, duplicate agent request, unexpected endpoint or
  application fallback stops the experiment. Already-started companion requests
  may finish; their reservations and successful costs remain recorded.
- No automatic continuation of a partial/failed ledger. Completed matching runs
  return saved results without new requests.

Offline full-plan maximum: **US$0.530454 reserved**, not measured spending.
Protocol SHA-256:
`765900a14cf0c70ed34dd2a5a90ef0e752d295dc32fb1803f34033f9c8d124dd`.

Public read-only pricing checks on this date matched the guard:
[OpenRouter Jev metadata](https://openrouter.ai/api/v1/models/typesafe/jev-1.14/endpoints)
reports US$0.042/M input and zero output-token price, with 262,144-token context.
[Official OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-4o-mini)
reports US$0.15/M input and US$0.60/M output. The pinned OpenAI model is marked
deprecated; it worked in the earlier routing screen. If unavailable, this runner
stops rather than substituting a model.

## Evidence and limits

Four focused test files: **29 tests passed** (11 new harness tests). Tests use
mocked transport with the actual orchestrator. Coverage includes budget-before-
request, restoration, stopped-ledger refusal, blocked retries, invalid model/
schema/cost/usage, forbidden endpoint, parallel success/failure and lock collision.
Typecheck and targeted ESLint exited 0. Independent AI review found no remaining
Critical or Important issues after extending dependency fingerprints. Minor
findings were addressed with token-usage artifacts, targeted checks, an explicit
pending human review status, concurrency and lock tests.

No runtime application code changed in this preparation slice. The full suite
and production build were not rerun; their prior verification belongs to the
committed shadow-runtime slice, not this harness.

Ignored `.jev-whole-flow-evaluation/` artifacts retain fictional selected replies,
bounded care outcomes, routing comparisons, timings, token usage and successful
costs. No raw prompts, provider bodies, keys or exception prose are saved. Reply
checks are lightweight screens and every result remains `manualReview: pending`.

Baseline is run first in each pair. Separate stochastic generations, provider
warm-up and a tiny sample mean timing/output differences cannot establish causal
improvement or broad safety. Shadow adds a call and can add latency. Offline
paired tests establish noninterference; this screen measures actual complete-flow
functionality and overhead. A later authority change still needs its own design
and verification.

## Pending execution

Separate owner approval is required for this US$1 scope; earlier classification
benchmark approval does not authorize it. After approval, run from the app root:

```sh
node --env-file=.env.local --import tsx scripts/whole-flow-shadow-live.ts --confirm-live --cap-usd=1 --prices-verified
```

Do not deploy, promote, enable hosted shadow mode or change current care routing
as part of this evaluation. Inspect the completed fictional replies and failures
before proposing the next implementation slice.
