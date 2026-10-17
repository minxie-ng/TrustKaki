# Storage and query-growth baseline — 14 October 2026

<!-- documentation-context -->
> **Dated evidence / release record.** Results and operational details apply to the recorded build, scope and date. They do not establish current deployment health or supersede the public architecture guides. Start with the [documentation index](../README.md) or [current architecture](../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


## Scope

Aggregate-only SELECTs ran against the linked TrustKaki Supabase project. No care
content, destinations, provider identifiers, secrets, or raw payloads were read
into this report. No database writes, maintenance commands, migrations, scheduler
runs, or outbound messages were performed.

[Reproduction SQL](../operations/STORAGE_BASELINE.sql) contains the inspected
queries. Run statements separately; inspect relation sizes before full-table
counts on larger deployments. Results are a point-in-time snapshot around
14:30 UTC, not an ongoing growth monitor or a performance/load test.

## Live storage snapshot

Application tables plus indexes in `public` and `trustkaki_private` total
8,601,600 bytes (8.20 MiB). This excludes Auth, platform internals, WAL, backups,
and other database storage. Relation allocation includes free space and dead
rows; it is not the same as live payload bytes or measured PostgreSQL bloat.

| Table | Exact rows | Mean row bytes (`pg_column_size`) | Relation bytes including indexes |
| --- | ---: | ---: | ---: |
| `proactive_check_in_events` | 15,003 | 197 | 4,939,776 |
| `agent_runs` | 88 | 1,856 | 368,640 |
| `messages` | 48 | 358 | 163,840 |
| `senior_memories` | 6 | 379 | 114,688 |
| `senior_health_contexts` | 3 | 373 | 81,920 |
| `routine_baselines` | 7 | 424 | 81,920 |
| `senior_context_events` | 8 | 940 | 188,416 |

Active memory/routine/health rows: 4 / 7 / 3. None of those active rows were
expired at inspection time. This does not establish a historical retention rate.

## Immediate growth issue: repeated scheduler work

- `job_retry_scheduled`: 14,996 events since 19 July; 1,172 in the last seven days.
- Categories: 9,387 `telegram_transport`, 5,547 `quiet_hours`, 62 `processor_error`.
- One current failed `initial_send` job reports 15,018 claim attempts and was
  scheduled on 19 July. Claim count and retry-event count measure different steps.
- Retry history does not establish that any corresponding message was delivered.

Source inspection explains the growth path:

- `src/lib/checkins/service.ts`: `deferJob` always delays five minutes. Quiet
  hours and ordinary failures both use this path. No attempt/age cap is applied.
- `20260715084838_gate_4_proactive_check_ins.sql`: claiming increments
  `attempt_count`; failed due jobs remain eligible without a maximum. Every
  `retry_proactive_check_in_job` call inserts an audit event.
- The service classifies errors starting with `Telegram` as transport errors
  before its missing-identity branch. Consequently the category does not prove
  a credential, network, identity, or provider root cause.

**First remediation candidate:** terminal handling for exhausted/permanent
failures, bounded transient retry with backoff, and quiet-hour deferral to the
next allowed time. Preserve uncertain-send reconciliation and delivery
idempotency. Separate normal waiting from failure attempts and avoid repetitive
wait events. Surface actionable failures to operators. Define attempt/age limits
before implementation; preserve evidence rather than deleting these events now.

No live job was paused, cancelled, retried, or repaired during this baseline.
Its current retry behaviour can continue until a remediation is deployed or an
operator changes the schedule.

## Other storage findings

- Replay-binding correction: `bind_orchestration_persistence` receives the full
  envelope but stores an HMAC plus binding identifiers, **not** the full envelope.
  Do not remove this integrity control to reduce storage.
- Channel inboxes do retain `orchestration_context` and `orchestration_result`
  for recovery. Telegram: seven events, all with context, mean context/result
  sizes 978 / 4,900 bytes. WhatsApp: 17 events, eight with context, means 271 /
  1,978 bytes across all 17 rows, counting null as zero. These are column-size
  measurements, not total event storage or network payload sizes.
- Agent traces store input, reasoning, output, structured output, and summaries.
  Decide which detail remains necessary after the operational retry window.
- No general automatic purge/archival path for message, trace, inbox, or memory
  audit history was found in the inspected code/migrations. Demo reset routines
  are scoped cleanup and do not constitute retention policy.
- Memory expiry limits retrieval eligibility; it does not delete stored rows.
  Retention policy must preserve required care/audit evidence and idempotency.

## Query growth from source inspection

| Path | Current bound | Growth concern |
| --- | --- | --- |
| Agent context | Latest active check-in, at most 50 messages; at most 12 candidates per context store and 12 combined | Bounded output, selection is importance-based rather than question-relevant |
| Selected dashboard conversation | No application pagination/limit | History grows with active check-in; platform default caps can silently truncate oldest-first results |
| Admin technical traces | No application pagination/limit | More agent runs increase response size or silent truncation |
| Caregiver queue | Up to 20 cases per accessible senior, queried separately | One queue query per senior; each case also loads actions and may load patterns/evidence |
| Case action history | No application pagination/limit | Long-lived cases accumulate actions |

For S accessible seniors and Q returned cases (Q <= 20S), the queue path issues
S queue requests, Q action requests, and up to 2Q pattern/evidence requests, plus
fixed dashboard requests. At S=100 and Q=2,000 this is up to 6,100 queue-related
requests by code structure. This is an upper-bound calculation, not an executed
workload. Existing indexes help scans but do not remove request fan-out.

Remediation candidates: page roster/queue, batch related reads, page selected
history/actions, load traces on demand, and retain clear continuation indicators.

## Synthetic annual storage scenario

Assumptions: four inbound messages per senior/day, one stored reply per inbound,
five stored agent runs per inbound, 365 days, current sample mean row widths.
Five runs is a scenario assumption, not the measured average or maximum.

| Seniors | Message rows/year | Agent-run rows/year | Combined row bytes, GiB |
| ---: | ---: | ---: | ---: |
| 100 | 292,000 | 730,000 | 1.36 |
| 1,000 | 2,920,000 | 7,300,000 | 13.59 |
| 10,000 | 29,200,000 | 73,000,000 | 135.92 |

Reproduce with standard Python:

```python
for seniors in (100, 1_000, 10_000):
    inbound = seniors * 4 * 365
    row_bytes = inbound * (2 * 358 + 5 * 1856)
    print(seniors, inbound * 2, inbound * 5, round(row_bytes / 1024**3, 2))
```

This is arithmetic, not a capacity forecast. It excludes indexes, free space,
TOAST effects, inboxes, audit events, embeddings, retries, backups, and changing
content sizes. RAG does not remove these stored rows. Retention and operational
retry controls need their own design and measurements.

## Next chunk and verification limits

Baseline complete for aggregate storage inspection, source-level query bounds,
and a reproducible synthetic sizing scenario. No large synthetic workload was
inserted; no query latency, throughput, execution plan, or production capacity
claim is made. Documentation and SQL only; runtime tests were not repeated.

Next recommended chunk: design and implement bounded scheduler retries and
quiet-hour deferrals, with focused tests. Then finish retrieval acceptance
thresholds and scope the first RAG change. Event discovery depends on reliable
outreach controls and verified source access.
