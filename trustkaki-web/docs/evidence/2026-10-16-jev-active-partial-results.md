# Active Jev comparison — incomplete results

Date:16 October 2026. Source:`474382f`; runtime prompt correction:`2703405`.
Status:**stopped after three completed flows, not a completed evaluation**.
Owner authorized proceeding with the corrected comparison under the same US$1
cap, retaining all three earlier attempts/reservations and stopping on errors.

## Recovery and execution

Recovery requires exact hashes of the original failed ledger, stopped recovery
ledger and one-shot diagnostic record. It preserves the second failed ledger
with an exclusive backup before starting, carries three attempts/US$0.006672,
and refuses further recovery after another error. Independent review found no
blocking issues.31 related mocked tests, typecheck and lint passed before run.

Offline preflight:

```json
{"protocolHash":"6df05a47f8e2692a33d77621ef03f04ef74128d453fef7c354539714deeaefc1","maxAttempts":113,"reservedUsd":0.890762}
```

Executed once, exit1:

```sh
node --env-file=.env.local --import tsx scripts/whole-flow-shadow-live.ts --confirm-live --cap-usd=1 --prices-verified --active --recover-after-diagnostic
```

Stopped ledger:15 cumulative attempts,US$0.047590 retained reservation,
`failureCode=jev_schema`,unresolved request14,three completed flows.12 new
attempts comprised11 validated responses and one invalid Jev response; a parallel
Triage request15 completed after the failure was latched. No further network
retry or case execution occurred. The application may attempt its internal
retry logic, but the harness blocks further network calls once stopped.

Validated responses from this run cost US$0.002934744. Including the earlier
diagnostic's known response gives US$0.003315894 in known response cost. Costs
of the first two failed attempts and rejected Jev response remain unknown within
retained reservations. Token/usage-derived figures are not billing invoices.

## Manual review of every saved reply

| Scenario | Result |
|---|---|
| Urgent symptoms plus scam, baseline | Red policy risk; immediate human/emergency help response; explicit inability to contact help; two alerts and briefing. |
| Same, active | Same selected reply, risk, alerts and specialists. Jev correctly labels health/digital-safety/urgent present, agrees with Triage, adds one request but no specialist. |
| Missed meal/pain plus communication preference, baseline | Mandarin response asks what help is needed now and suggests telling the caregiver. Two memory proposals include communication preference. However, signals are health/social without daily_living despite missed food; risk stays green. This extraction gap needs review and is not validated as adequate care handling. |

The mixed active flow stopped at Jev response validation; no completed result
exists. The remaining eight scenario pairs were not reached. Automated checks on
the three saved flows passed, but several screens are case-specific and vacuously
true elsewhere. Manual review exposes the missed-meal gap they did not assert.

The urgent baseline used3 requests/US$0.0008118; active used4/US$0.000876294.
One pair cannot establish performance or latency superiority; separate stochastic
generation and baseline-first order confound comparisons. No useful extra
invocation was observed in the sole completed pair. Other active benefits remain
unmeasured. Supplied memory fixtures do not test live database retrieval.

## Jev failure and local diagnostics

The wrapper failed inside `parseRoutingShadowResponse` for mixed preference.
That parser validates six labeled answers, choice distributions, model and usage.
The failing field/value was not saved, so the exact defect is unknown. It cannot
be attributed to a specific model judgment, probability invariant or parsing bug
from this record alone. No schema was weakened and no retry was made.

After stopping, safe Zod issue recording was extended to Jev schema/usage and
OpenAI envelope errors, with allowlisted field paths and no rejected values.
A new mocked Jev enum failure verifies field diagnostics and no retry/resumption.
Fresh results:35 tests across4 related suites passed; typecheck/lint exit0.
This instrumentation cannot reconstruct the failed response or establish a fix.

## Decision and next work

Keep broader Jev routing disabled pending response-contract investigation,
mixed-care extraction review and completion of the evaluation. Do not promote
based on these partial results. Existing production was not changed; no database
reads/writes or messages to seniors occurred.

Before another paid attempt, prepare a focused response-contract diagnosis.
Consider an explicitly approved protocol revision that records invalid model
outputs as quality failures while continuing to other cases without retries;
the current stop-on-error protocol truncates coverage. Such a revision needs
owner approval and verified budget/transport guards before execution.

Bounded fictional artifacts:[saved flows and request accounting](2026-10-16-jev-active-partial-results.json).
Original local ledgers remain preserved in the ignored evaluation directory.
