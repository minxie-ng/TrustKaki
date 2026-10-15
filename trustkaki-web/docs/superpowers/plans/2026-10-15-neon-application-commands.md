# Neon application memory commands

> **For agentic workers:** Execute inline using executing-plans; keep the existing feature checkout. Follow test-driven-development and verification-before-completion.

**Goal:** Adapt caregiver corrections and accepted extraction to Neon's canonical command lifecycle without breaking exact retries.

**Architecture:** One scoped transaction locks the senior, checks the original request digest before inspecting mutable records, and applies a versioned source command. Embeddings remain outside the transaction. Supabase still supplies authenticated scope and message evidence; this chunk does not switch production readers or writers.

**Tech Stack:** Existing pg pool, Zod, SHA-256, pgvector, Vitest/PGlite.

## Files and checks

- `src/lib/memory/neonDatabase.ts`: expose a transaction callback using the existing scope, role, timeout, abort and rollback handling. Reject connection-string parameter overrides.
- `src/lib/memory/applicationCommands.ts`: validate original requests; replay receipts before mutable-state checks; preserve metadata, evidence and expected-version conflicts. Reject attempts to turn personal facts into essential operational context.
- `src/lib/memory/applicationCommands.test.ts`: real SQL lifecycle tests with restricted role and fictional data.
- `src/lib/memory/neonDatabase.test.ts`: callback rollback and URL override tests.

## Execution

- [x] Write failing transaction tests; run `npm test -- src/lib/memory/neonDatabase.test.ts` and observe failure.
- [x] Implement `withNeonMemoryTransaction(scope, work, signal)`; make `neonMemorySql` delegate to it. All callback queries use the same scoped transaction.
- [x] Write failing application-command tests for create, exact retry after correction, changed-payload conflict, stale edit, unsupported evidence, archive and foreign scope.
- [x] Implement original-request SHA-256 receipts and versioned writes. Require caller-supplied verified scope and senior-authored message evidence. Manual corrections use explicit caregiver confirmation rather than inventing senior quotes.
- [x] Run focused tests, typecheck, lint, full suite and production build. Run a fictional live command round trip and clean fixtures.
- [x] Review security-sensitive changes and record evidence/roadmap. Keep production cutover closed until shared readers, writers, indexing, classification/backfill and release gates pass together.

## Completed application extension

Added trusted scope/provenance adapters, bounded source/tag reads, extraction and
caregiver commands, shared agent retrieval, purpose collision locks, index retry
with cancellation, prompt evidence envelopes and an opt-in authenticated smoke script.
Production remains on the default backend. Migration/classification, generated-reply
evaluation, deployment credentials and release checks remain open.

See [verification evidence](../../evidence/2026-10-15-neon-application-integration.md).
