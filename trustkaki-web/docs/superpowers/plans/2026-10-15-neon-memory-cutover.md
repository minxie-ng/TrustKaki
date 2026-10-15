# Neon memory migration and cutover

> Execute inline; independently review migration and release changes before promotion.

**Goal:** Make Neon authoritative for personal memory while retaining essential care context in Supabase.

**Architecture:** Freeze legacy personal writes at the database boundary, take an exact snapshot, import grouped histories into Neon transactionally with stable IDs and a source digest, reconcile, then stage and verify a production-target deployment before promotion. Keep retained Supabase rows as read-only historical evidence, never runtime fallback. Rollback after new Neon writes must keep Neon or pause/reconcile writers first.

## Tasks

- [x] Inspect legacy purpose, lineage and provenance; retain the family contact route in Supabase with an audited operational tag. Never invent source excerpts.
- [x] Test and implement a deterministic import planner that groups scope/key histories, preserves original row IDs in snapshots, keeps archived histories non-retrievable, rejects ambiguous lineage and creates idempotent digest receipts.
- [x] Test/apply a versioned Supabase write guard for personal memories; existing receipt replays must still work. Preserve essential tagged writes and care data.
- [x] Rehearse import/reconciliation on a temporary Neon branch; apply to selected branch; verify rows, revisions, source hashes and retry safety.
- [x] Complete health/readiness reporting and generated-reply retrieval checks using fictional fixtures; no outbound channel messages.
- [x] Install restricted pooled credential and embedding settings in production secret storage; keep direct owner URL local. Deploy exact reviewed commit with --prod --skip-domain.
- [x] Verify public smoke, authenticated dashboard/access and candidate lifecycle; promote only after gates pass. Record deployment, source commit and previous deployment.
- [x] Verify production, cleanup fictional fixtures and temporary branch, update roadmap/evidence and operating/rollback instructions.

## Files

- src/lib/memory/legacyBackfill.ts and .test.ts: pure validated history planner and digest.
- scripts/neon-memory-backfill.ts: bounded trusted-source snapshot, preflight, atomic per-senior imports/reconciliation; no content/IDs in output.
- supabase/migrations: audited classification plus personal-write freeze, generated with Supabase CLI.
- src/app/api/health/route.ts and tests: explicit Neon enabled/configured/readiness booleans.
- scripts and evidence: fictional retrieval/generation checks, reproducible migration and release results.

Transition limitation: pre-cutover Supabase command identities are retained in the old audit store, not replayed as Neon receipts. See release evidence for refresh/reissue guidance.
