# TrustKaki Agent Benchmark

All inputs are fictional; no persistence or messaging was used.

## Deterministic Offline Run

| Run detail | Value |
| --- | --- |
| Mode | Deterministic (offline) |
| Generated | 2026-07-30T09:35:39.852Z |
| Model | not used |
| Case count | 42 |

| Metric | Result |
| --- | --- |
| Route exact-match rate | Not measured |
| Required-specialist recall | Not measured |
| Forbidden-specialist avoidance | Not measured |
| Digital Safety recall | Not measured |
| Durable-context precision | 100.0% |
| Schema-valid response rate | 100.0% |
| Fallback rate | 0.0% |
| Median latency | 0.0 ms |
| P95 latency | 0.1 ms |

Failed case IDs: None

## Bounded Live Run

| Run detail | Value |
| --- | --- |
| Mode | Live (bounded) |
| Generated | 2026-07-30T09:43:21.327Z |
| Model | gpt-4o-mini |
| Case count | 18 (three per category) |

| Metric | Result |
| --- | --- |
| Route exact-match rate | 88.9% |
| Required-specialist recall | 100.0% |
| Forbidden-specialist avoidance | 95.2% |
| Digital Safety recall | 100.0% |
| Durable-context precision | 100.0% |
| Schema-valid response rate | 100.0% |
| Fallback rate | 0.0% |
| Median latency | 10380.7 ms |
| P95 latency | 13971.7 ms |

Failed case IDs: care_01, social_01, protected_data_01, care_02,
protected_data_02, care_03, social_03, durable_context_03,
protected_data_03

### Limitations

- This was one stochastic run over 18 of the 42 committed fictional cases; it
  is not a user study or a clinical-safety evaluation.
- Failed cases remain in the report. A failed ID means at least one strict
  routing, risk-boundary, follow-up, memory, schema, or fallback expectation
  was not met.
- Latency covers the full multi-agent orchestration for each case, which may
  include several sequential or parallel model requests. It is not a measure
  of dashboard rendering time.
- The run did not write to Supabase or invoke messaging providers.
