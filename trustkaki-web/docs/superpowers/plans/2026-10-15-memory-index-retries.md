# Scheduled memory indexing implementation plan

**Goal:** Recover pending personal-memory embeddings without waiting for a new chat.
**Architecture:** Durable retry/lease state in Neon, shared foreground/background
claims, scoped publication and one protected daily Vercel job.
**Tech stack:** Existing pg/pgvector, Next.js, Vercel Cron, Vitest and PGlite.

Execute inline using the approved design and test-first steps.

- [ ] Add failing real-SQL tests in `src/lib/memory/indexQueue.test.ts` for the
  migration's claim contract, RLS, exclusions, backoff, attempt cap and version reset.
  Run `npm test -- src/lib/memory/indexQueue.test.ts`; verify missing function fails.
- [ ] Add `neon/migrations/002_index_retries.sql`, `indexQueue.ts` and shared
  token-fenced publication. Run the SQL tests until green.
- [ ] Change `indexPending.ts` to claim and release durably; add provider-failure,
  cancellation and no-work tests. Add `indexWorker.ts` and authenticated route/tests
  at `src/app/api/internal/memory/process-pending/`. Test authorization and hard caps.
- [ ] Update versioned migration runner and fictional live smoke script. Rehearse
  on an expiring Neon branch; verify runtime permission and cleanup.
- [ ] Run `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`.
  Apply tested migration, stage reviewed code, verify worker endpoint and fictional
  retry lifecycle, then promote and verify production smoke.
- [ ] Configure only the memory daily cron, update operations/roadmap/evidence,
  remove rehearsal resources and commit the final evidence.
