# First fictional live personal-memory retrieval pilot

Date: 15 October 2026 (Asia/Singapore). Result: **all configured pilot gates passed**.
This evidence is for an isolated retrieval module, not deployed RAG memory.

## Configuration and scope

- Index: `trustkaki-memory-pilot`, dense 1,024-dimensional cosine vectors,
  AWS `us-east-1`, verified current Starter/free plan in Pinecone console.
- Embedding model: `llama-text-embed-v2`; Pinecone Inference, passage/query modes,
  no truncation. API version `2026-07`. Chat model not used.
- Final namespace: `trustkaki-fictional-memory-pilot-b3ee69d4-d569-4a78-a42e-d5511aaaae93`.
- Dataset: `fictional-memory-v1`, 1,007 records: five relevant facts, one superseded
  preference, one expired fact, and 1,000 distractors. Canonical source records are
  generated local fixtures; Pinecone stores vectors and metadata, not raw fact text.
- User saved the key locally, authorised up to USD 1 with provider controls.
  Actual Starter/free plan was verified before calls; no upgrade or payment action.
  [Current provider limits](https://docs.pinecone.io/reference/api/database-limits/rate-limits)
  state quota exhaustion rejects requests. Budget is declared, not enforced by script;
  the free plan's quotas were the operative provider controls for this run.
- Existing `boundless-laurel` index was not changed by the script. No real senior
  data, messages, Supabase reads, production migration, or application deployment.

## Calibration before final evaluation

[Unmodified calibration report](2026-10-15-memory-calibration.json).

- Dataset: `fictional-memory-calibration-v1`; 1,005 active/unexpired corpus facts.
- Fifteen positive questions (five topics, three languages), five unrelated
  questions. No exact question overlaps with the final 30; topics and source facts
  are shared. This is development calibration, not an independent population sample.
- Exact local cosine between live passage/query embeddings; index not written.
- Lowest positive: **0.28446001017568134**.
- Highest forbidden: **0.11575398260371067**.
- Frozen midpoint cutoff: **0.200106996389696**. Copied into local configuration
  before final run; final evaluation scores were not used for tuning.
- Usage: **20,440 embedding tokens**, no index writes/query read units.

## Final evaluation

[Unmodified live report](2026-10-15-memory-live-pilot.json).

| Gate | Required | Observed |
| --- | --- | --- |
| English Recall@6 | At least 90% | 10/10 (100%) |
| Mandarin Recall@6 | At least 90% | 10/10 (100%) |
| Singlish Recall@6 | At least 90% | 10/10 (100%) |
| Gardening questions | All pass | 6/6 |
| Corrected contact preference | All pass | 6/6 |
| Forbidden facts | Zero | Zero |
| Unavailable queries | Zero | Zero |
| Retrieval p95 | At most 1,500ms | 986ms |

Each question has one required target. Recall@6 here means the fraction of questions
whose target appears in the final bounded set of at most six facts. It does not mean
all selected facts are equally relevant or that generated replies are correct.
Forbidden facts were superseded/expired preferences and inventory distractors.

Thirty sequential retrieval timings include query embedding, vector query, local
source lookup, and validation. Nearest-rank p95 is the 29th sorted timing. Min /
median / max: **585 / 782 / 1,472ms**. Seeding and calibration time are excluded.
Local canonical lookup is faster than a future remote durable source-store lookup;
production latency must be measured again after integration.

Usage reported by the final runner: **20,498 embedding tokens**, **30 query read
units**, **1,007 vectors upserted**. Combined calibration+evaluation embeddings:
**40,938 tokens**. Write units, storage charges, and total dollar billing were not
reconciled. Console verification queries may consume additional read units and
are not included in the runner's counter. No paid plan upgrade was performed.

## Reproduce

From `trustkaki-web/`, configure the ignored local environment and verify current
provider plan, budget and quotas before external calls. Then:

```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/memory-calibration.ts --confirm-live --confirm-provider-budget
```

Inspect calibration. If it passes, freeze its reported threshold in
`TRUSTKAKI_MEMORY_PILOT_MIN_SCORE`, then:

```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/memory-retrieval-evaluation.ts --mode live --confirm-live --confirm-provider-budget
```

A rerun creates a new namespace and incurs fresh usage. Do not tune on final
failures and report the reused questions as new independent evaluation. The current
script uses declared environment values; these do not enforce or verify billing.

Raw artifact SHA-256:

- Calibration: `eacb86f5e05a75d6f9ac9b292f369e254f9e6fa6f13488246cda4dbf8ea9cac4`.
- Final: `09260d4fe91838233b10680fcc6db1bc2dd9d13aedc3d763ca1f9368d5334fb1`.

## Local verification and review

- New calibration tests first failed because implementation was missing; then
  three tests passed (cosine validation, separating cutoff, query-set separation).
- Focused retrieval/transport/CLI/calibration suite: **129 passed, six files**.
- TypeScript and lint passed. Actual calibration invocation without consent flags
  rejected before provider setup. No new dependency or production integration.
- Independent calibration review: no material findings; three tests independently
  passed. Full suite/build were not repeated for this standalone script addition.

## Limits and next step

This is one small synthetic run. Five repeated positive facts and template-based
inventory distractors are easier than diverse real memories and hard negatives.
No broad multilingual-quality, clinical, concurrent-load, generated-response,
prompt-injection resistance, or full live deletion/recovery claim is supported.
Source-of-truth records remain local fictional fixtures; production personal
memory still uses its transitional Supabase path.

The fictional namespace is retained for inspection; no deletion was performed.
Next bounded chunk: select durable external source storage and design one writer,
corrections/deletions, idempotent indexing, export/rebuild/recovery, then migrate
and connect agents under separate verification gates.
