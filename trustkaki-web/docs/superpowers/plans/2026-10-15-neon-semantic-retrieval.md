# Neon semantic retrieval slice

<!-- documentation-context -->
> **Historical design / evaluation record.** This document preserves the plan and decisions at its recorded stage. Proposed work and approval checkpoints are not claims about the current deployed product. Start with the [documentation index](../../README.md) or [current architecture](../../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


Approved continuation of the Neon memory foundation. No production memory cutover.

## Scope

- Reuse the configured Pinecone inference endpoint/model; no vector-index calls.
- Add a server-only embedding client independent of storage, with TLS endpoint,
  model, dimension, response, input-size and error-payload checks.
- Add one bounded pending-source indexing attempt (20 sources). Keep failures
  pending and use the repository's current-version guard when publishing vectors.
- Evaluate the same 1,007 fictional records and 30 frozen English/Mandarin/Singlish
  questions against live Neon sources and pgvector. Freeze the prior independently
  calibrated threshold, use random org/senior UUIDs, check cross-senior isolation,
  and delete only that scope's records/revisions/receipts in a finally block.
- Record quality, elapsed time, token usage, cleanup and unmeasured gates.

## Verification

Tests written before new embedding/indexing implementation; assert provider errors,
invalid vectors, version races, pending retries and no-work behavior. Run existing
memory tests, typecheck, lint and production build. The live script itself asserts
fixture creation/indexing/isolation/cleanup and exits nonzero on gate failure.

No new dependencies, services, schema changes, chat integration, real senior data,
scheduler, migration, or production deployment in this slice. The inference API
still uses Pinecone; changing provider/model requires reindexing and re-evaluation.

## Recorded outcome

137 memory tests passed; typecheck and changed-file lint passed. Live semantic
benchmark passed: 30/30 questions, zero forbidden/unavailable results, warm p95
501 ms, 20,482 embedding tokens. All fictional rows/revisions/receipts cleaned.
Production webpack build passed; default Turbopack is blocked by this environment's
local-port restriction. See dated semantic evidence for exact limits.
