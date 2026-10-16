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
