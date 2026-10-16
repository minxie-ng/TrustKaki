# Active-routing evaluation stopped on first response

Date: 16 October 2026. Source: `c30b3f8`.
Owner approved US$1 total, 20 fictional flows, maximum110 attempts and no automatic retries.

## Observed result

The exact documented command ran once with network access and exited1:

```text
Whole-flow evaluation stopped. Preserve ledger; no automatic retry.
```

Persistent ignored ledger `.jev-active-routing-evaluation/budget.json`:

```json
{"capMicroUsd":1000000,"reservedMicroUsd":2224,"calls":1,"protocolHash":"040a7b768fe62165c3abc31e2b170f3ad362441659646dcce6cc2fe2f5e17d68","stopped":true,"failureCode":"response_validation","inFlight":[1],"completedFlows":0,"finished":false,"jevModel":null}
```

One baseline OpenAI Triage attempt reached response validation. No validated
request record, completed flow, Jev request, summary or comparison result exists.
US$0.002224 is a retained reservation, **not confirmed billed cost**. The original
response was not retained; its exact defect cannot be reconstructed. HTTP error
was not the recorded failure stage. No database or production changes occurred.

## Local diagnostic improvement

Separated fixed diagnostic stages: response JSON, OpenAI envelope, agent JSON,
agent schema, Jev schema, Jev usage and Jev model. No provider prose, output,
credentials or error values enter the ledger. Validation and no-retry behavior
are unchanged. This improves future diagnosis; it does not fix an identified
model-output defect or establish why the original response failed.

Four mocked diagnostic cases first failed against the old broad error stage,
then passed after the change. Related active/shadow/budget suites:24 tests passed.
Typecheck and targeted lint passed. The failed ledger remains untouched and the
source fingerprint changes, so the runner continues to refuse resumption.

## Recovery checkpoint

Any next attempt needs explicit owner approval because the approved protocol
promised no retries. A recovery must preserve this ledger/reservation, fit within
the same US$1 total, explicitly count the failed attempt, record source/protocol
changes and stop on the next error. No recovery or paid retry has been executed.
No claims about active Jev quality, cost savings or latency can be made from this
attempt.

## Owner-approved recovery result

Owner subsequently approved one retry/continuation, max111 total attempts,
same US$1 cap, preserving the failed reservation and stopping on another error.
Recovery source `be930a1` was independently reviewed with no Critical/Important
findings.27 related mocked tests, typecheck and targeted lint passed before
execution. Conservative recovery preflight:111 attempts / US$0.886314.

The following command executed once and exited1:

```sh
node --env-file=.env.local --import tsx scripts/whole-flow-shadow-live.ts --confirm-live --cap-usd=1 --prices-verified --active --recover-first-validation
```

It stopped at **agent_schema** on baseline Triage: the HTTP response envelope
passed validation and message content parsed as JSON, but that object failed
Triage's schema. The precise field and rejected value were not retained, so they
cannot be reconstructed. This does not identify a Jev defect; Jev was never
called. No full chat or paired result exists. Do not claim the schema defect is
fixed or that active routing has been evaluated successfully.

Current ledger snapshot:

```json
{"capMicroUsd":1000000,"reservedMicroUsd":4448,"calls":2,"protocolHash":"4204a626c03fb51c614c6ed311164bd44007e72906dae563dd6e5c56fb3e422d","stopped":true,"failureCode":"agent_schema","inFlight":[2],"completedFlows":0,"finished":false,"jevModel":null}
```

US$0.004448 is total retained reservation, not confirmed billing. The original
ledger bytes are preserved in `first-failed-budget.json`; SHA256
`da9a74604a95ef0d2d41dd52cb083158f9800fc4364bbcfa97d6502140569faa`.
The stopped recovery ledger SHA256 is
`4b52328e91abb64400c3b3bf4ed9d9976c2cb78e872708b58eac5091c2ddadc8`.
No further request or automatic recovery occurred.

After stopping, diagnostics were improved locally to retain up to10 schema issue
codes and paths restricted to known field names/numeric indices; arbitrary field
names become `field`. Raw values, provider prose and credentials are omitted.
28 related mocked tests, typecheck and targeted lint pass. These new diagnostics
cannot retroactively recover the rejected field. No runtime prompt/schema changes
were made based on guesses. The next useful paid step is one explicitly approved
diagnostic request before attempting another full comparison.

## Single diagnostic and prompt correction

Owner said proceed to the proposed single diagnostic. Runner `13f0f77` was
reviewed independently and checked with three mocked tests, typecheck and lint.
It verified the exact stopped recovery ledger hash, reserved before its sole
network request, kept historical ledgers unchanged and used an exclusive
`triage-diagnostic.json` artifact to refuse reruns. No further requests were made.

Command:

```sh
node --env-file=.env.local --import tsx scripts/triage-output-diagnostic.ts --confirm-one-diagnostic
```

Result (exit1 because the observed output failed validation):

```json
{"capMicroUsd":1000000,"reservedMicroUsd":6672,"calls":3,"previousLedgerHash":"4b52328e91abb64400c3b3bf4ed9d9976c2cb78e872708b58eac5091c2ddadc8","runtimeBaseCommit":"79c3fd7","caseId":"urgent_scam","status":"agent_schema","schemaValid":false,"successfulCostUsd":0.00038114999999999997,"issues":[{"code":"invalid_value","path":["signals",1,"type"]}]}
```

The second signal's broad `type` was outside the allowed enum. The rejected value
was intentionally not saved, so it is unknown whether the model confused category
and type, combined values or returned another invalid value. This diagnostic does
not retroactively establish that the earlier two attempts failed on the same
field. Cost is token-based estimated diagnostic response cost, not an invoice;
costs of the earlier two responses remain unknown within retained reservations.
US$0.006672 is cumulative reservation for three attempts, not total billed cost.

Local prompt correction makes the four broad types explicit (`health`,
`daily_living`, `digital_safety`, `social`), distinguishes category labels and
shows a concrete urgent health-plus-scam example with separate signal objects.
No schema was weakened; output was not coerced. A new prompt contract test failed
before the change and passed afterward, checking the mixed example against the
actual signal schema. This improves guidance for the observed contract failure;
**it has not been verified with another live model response**.

Fresh verification after correction:

- 193 focused prompt/orchestration/diagnostic tests passed.
- Full suite:155 files passed,5 skipped; **1,227 tests passed,38 skipped**.
- Typecheck and targeted lint:exit0.
- Production build:exit0;24 static pages generated.
- Independent review of diagnostic and prompt correction:no Critical/Important
 findings; live effectiveness remains unverified.

No Jev requests, complete chat flows, production changes or database operations
occurred. Next stage requires a separately authorized evaluation recovery carrying
all three attempts and their reservations; do not reset the historical ledger.
