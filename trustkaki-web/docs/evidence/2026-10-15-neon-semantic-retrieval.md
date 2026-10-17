# Neon semantic retrieval evidence — 15 October 2026

<!-- documentation-context -->
> **Dated evidence / release record.** Results and operational details apply to the recorded build, scope and date. They do not establish current deployment health or supersede the public architecture guides. Start with the [documentation index](../README.md) or [current architecture](../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


## Scope and measured result

The configured Pinecone inference API generated `llama-text-embed-v2` embeddings
(1,024 dimensions). Neon Postgres/pgvector stored both fictional source facts and
vectors; no Pinecone vector-index operation was called. Existing Supabase agents
were not switched. No real senior data was read, uploaded or migrated.

Command exited **0**:

```sh
npm run memory:neon:evaluate -- --confirm-live --confirm-provider-budget
```

[Raw result](2026-10-15-neon-semantic-retrieval.json):

- Same `fictional-memory-v1` corpus: 1,007 sources, 1,006 active vectors. The expired
  dance fact was indexed but excluded by time filtering; old contact was archived.
- Same 30 frozen questions: English 10/10, Mandarin 10/10, Singlish 10/10 Recall@6.
- Zero forbidden facts or unavailable queries; gate passed.
- Warm p95 **501 ms**, including query embedding, scoped search and live source
  validation. Ingestion and database cold start excluded; one explicit embedding
  probe/isolation query preceded measurement. This is not a controlled speed
  comparison with the earlier Pinecone run or a production-load claim.
- Same model and independently calibrated minimum score **0.200106996389696**;
  no tuning against these final questions.
- Cross-senior source and vector reads returned no rows.
- **20,482 embedding tokens**, including isolation probe. Dollar cost unmeasured;
  declared budget US$1 with previously configured provider controls. No account
  upgrade or added infrastructure. The script does not enforce a dollar cap.
- Random fictional scope deleted in `finally`; zero records, revisions and command
  receipts remained. Cleanup success was asserted after deletion.

The current contact retains fixture version 2 through a real correction command.
The old contact is archived through the lifecycle command (version advances to 2),
so content/status/question labels match the original fixture while archive version
reflects a real lifecycle transition.

## Implementation

- Server-only embedding client validates endpoint, input size, model, 1,024 finite
  nonzero dimensions, response order/usage and safe errors. Native passage/query
  modes preserved; redirects rejected. No new dependency.
- Bounded indexing attempts 20 pending sources, leaves failed embeddings pending,
  and uses version-checked publication. A correction during embedding cannot
  publish the stale vector. The next attempt can recover pending work.
- Live benchmark asserts insertion, indexing, isolation and cleanup. Only generated
  fixtures and random scopes are used. At most three fixture writers run together;
  all writers settle before cleanup begins.

## Local checks

New embedding and indexing behavior: **8 tests passed**. Existing memory regression
suite: **137 tests passed across 8 files**. Typecheck and changed-file lint passed.
Production build passed with `npm run build -- --webpack` (exit 0, compiled
successfully and generated 23/23 static pages). Default Turbopack build failed on
its CSS worker binding a local port (`Operation not permitted`), including a
permission retry. The first webpack attempt could not download existing Google
Fonts; retry with network permission passed. No build settings or fonts changed.

## Remaining gates

No chat generation/groundedness test, authenticated dashboard/channel integration,
real data migration, scheduler/retry/cost metering, dedicated runtime login,
restore drill, retention or production capacity claim. Supabase operational env
was missing locally in the preceding foundation slice; no whole-app health pass
is implied. This slice neither deploys nor cuts over production memory.
