# Jev routing: incomplete screening results

16 October 2026. **Incomplete; no runtime adoption or production change.**

Historical checkpoint: the owner later approved continuation and the experiment
completed. See [final results](2026-10-16-jev-routing-results.md); figures below
describe only the earlier incomplete run.

The owner approved US$1, then explicitly approved retry of the initial sandbox
DNS failure with 73 total attempts, retaining its reservation. The runner
completed 30 paired cases (60 observations), then stopped at
`jev:routing_11_1` on attempt 62. No further request was made.

The original runner sanitized away the exception detail. Consequently the second
failure cannot be attributed to HTTP, timeout, response parsing or validation
from the retained evidence. No raw response was saved. Added safe stage/status/
error-kind diagnostics for future failures; this cannot recover the lost detail.
Two focused test files pass, 15 tests, including one-time recovery and diagnostics.

## Paired observations only

These are the first 10 of 12 semantic families, each translated into English,
Mandarin and Singlish. They are not 30 independent real-world scenarios. The
durable-context/scam mixed family and ambiguity family remain untested. Labels
are developer-authored and independently AI-reviewed, not clinical annotation.

| Metric | Jev | Current Triage adapter |
| --- | ---: | ---: |
| Cases with all six expected labels | 24/30 | 21/30 |
| False-positive flags | 6 | 7 |
| Missed positive flags | 0 | 6 |
| Missed explicit urgent/scam positives | 0 | 0 |
| Successful-call cost (USD) | 0.00184023 | 0.00954420 |
| Observed request p95 | 801 ms | 3,413 ms |

These endpoint timings and costs compare structured classification with Triage's
full response generation; they do **not** establish whole-app savings. Jev resolved
to `typesafe/jev-1.14-20261014`; the baseline returned the pinned
`gpt-4o-mini-2024-07-18` model successfully.

Jev's six extra flags comprise daily-living flags on all three knee-pain variants,
health flags on English/Singlish skipped-meal variants, and a durable-context
flag on the English social-activity request. Some reflect overlapping care
concepts and warrant rubric review rather than a clinical error claim.
The baseline adapter missed daily-living labels in both skipped-meal families
(six variants); some were classified under health instead. This suggests a
taxonomy/adapter difference as well as possible routing benefit. It does not
mean the baseline ignored all care needs.

## Budget and next decision

Ledger: 62 attempts, US$0.415967 reserved, stopped, with the failed key retained.
Recorded successful-call cost totals US$0.01138443. Failed-call billing is unknown;
reservations remain intact. No budget reset or new retry occurred.
Protocol SHA-256:
`ba504aa5e4bb9af8c4b67d36cc863a9d058b3d5c691eaa47c88168b143553d88`.

The partial results support continuing evaluation of Jev as a routing coordinator.
They do not justify making it the sole decision maker. Completing six remaining
paired cases requires another explicit retry amendment, retaining both failed
reservations, at most 74 attempts and the same US$1 cap. Then assess the complete
screen before planning a whole-flow shadow integration.
