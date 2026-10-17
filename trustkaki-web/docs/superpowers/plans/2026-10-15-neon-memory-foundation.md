# Neon memory foundation implementation plan

<!-- documentation-context -->
> **Historical design / evaluation record.** This document preserves the plan and decisions at its recorded stage. Proposed work and approval checkpoints are not claims about the current deployed product. Start with the [documentation index](../../README.md) or [current architecture](../../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


> **For agentic workers:** Use superpowers:executing-plans inline for this bounded slice.

**Goal:** Configure the owner-selected Neon Postgres service and implement a tested
personal-memory source/pgvector repository without switching production agents.

**Architecture:** One transactional Postgres schema stores current sources,
revisions, command receipts and 1,024-dimensional vectors. RLS requires trusted
org/senior scope per transaction. Existing bounded retrieval consumes its search
and bulk-source methods. `pg` and Vercel pool attachment use CLI-managed env vars.

**Tech stack:** TypeScript, Zod, pg, pgvector; PGlite with real Postgres/vector for
local SQL integration tests. No ORM, retrieval framework or new agent.

## Tasks

- [x] Install/read Neon skills and CLI; initialise specified project, configure MCP,
  run `neon deploy` and securely pull database env. Preserve existing env entries.
- [x] Create failing repository/SQL tests before implementation. Exercise create,
  command replay/mismatch, correction conflict, stale embedding rejection, tenant
  isolation, scope reset, expiry, archival, erasure and bounded cosine retrieval.
- [x] Add `neon/migrations/001_personal_memory.sql`: three private RLS tables;
  transactional command function and minimal receipt. Expected version guards all
  modifications; erase removes content in revisions and retains tombstone.
- [x] Add `src/lib/memory/postgresStore.ts` with parameterised, scoped SQL and
  validated commands/vectors/results. Inject transaction executor for SQL tests.
- [x] Add `src/lib/memory/neonDatabase.ts`: lazy pg pool, Vercel pool management,
  transaction-local scope/timeout, sanitised errors and safe optional health check.
- [x] Wire optional Neon readiness into existing `/api/health`, cover it with tests.
  Keep app build independent of live DB; no production memory read/write switch.
- [x] Add guarded migration and fictional lifecycle smoke commands using direct
  migration URL and pooled runtime URL. Never print connection strings/payloads.
- [x] Run local SQL tests; test migration and fictional lifecycle on isolated Neon
  branch first, then owner-requested target after verification; verify build and
  started app health endpoint. Record exact evidence and unrun gates.
- [x] Update README, env example, roadmap and RAG guide; record actual status.

## Checks and commands

`npm run test -- src/lib/memory/postgresStore.test.ts` must fail before source is
added, then pass against real embedded Postgres/pgvector. Tests use transaction
`SET LOCAL ROLE` to check non-owner RLS rather than a superuser bypass.

`npm run typecheck`, `npm run lint`, `npm run build` must pass. Start built app
with `npm start -- --hostname 127.0.0.1 --port 3100`; request `/api/health` and assert
Neon readiness true. Live fixture smoke must check real source/vector round trips,
correction, stale publication and erasure. Cleanup only the exact fictional scope.

## Excluded release gates

No senior-data backfill, agent-generation gate, production memory cutover,
retention deletion, automatic index worker, backup restore claim or load claim.
These remain tracked follow-up chunks rather than passed by setup tests.

## Recorded result

918 passed, 38 skipped; typecheck/lint/build passed. Temporary Neon branch migration
and fictional lifecycle passed, then selected production branch passed. Test branch
and its ignored env file removed. App started and home returned 200; HTTP health
showed Neon true but overall 503 because local Supabase credentials are absent.
Thus Neon E2E is verified, whole-app operational E2E is incomplete. No real senior
migration or agent memory cutover is claimed. See dated foundation evidence.
