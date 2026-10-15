# Neon personal-memory cutover — 15 October 2026

## Owner authorization and boundary

Owner requested completing migration, retrieval checks and production cutover today.
Scope: conversational personal memory. Supabase retains authentication, access,
messages, care data and essential operational context. No outbound transport test
messages or schedule/webhook changes are authorized by this release work.

## Migration evidence

- Reviewed six legacy rows: five personal; one existing family-contact route retained
  in Supabase with an audited `trusted_contact_route` tag.
- Tested import planning, lineage validation, missing evidence, stable receipts,
  changed-input rejection, real SQL import/replay and full transaction rollback.
- Rehearsal on a temporary Neon branch: 4 canonical records, 1 historical revision,
  5 original personal rows; sources/history reconciled; exact retry reused 4 receipts.
- Applied versioned Supabase migration `20261015051653_neon_personal_memory_cutover`.
  Its trigger freezes personal INSERT/UPDATE/DELETE, including attempts to retag
  existing personal rows. Essential operational writes remain available.
- Live no-op personal UPDATE was rejected with SQLSTATE 55000; no source changed.
- Production Neon import: 4 canonical records and 1 preserved original-ID snapshot;
  all source/history hashes reconciled. Exact replay returned 4 existing receipts.
  The Supabase snapshot and mapped evidence were checked again before COMMIT.
- Final legacy snapshot SHA-256:
  `728547084c54d01bb78ab40a360d2a0b27a29ec99e09fffab1ff6c54fe622d87`.
- All four canonical imported records have missing source evidence. Three are active;
  one is the archived terminal of a two-row history. They remain caregiver-visible
  but excluded from semantic retrieval until an authorised caregiver confirms them.
  Migration does not fabricate senior quotes or new caregiver confirmations.
- Retained Supabase personal rows are immutable historical evidence. New application
  memory uses Neon; no automatic Supabase personal-memory fallback is permitted.

## Local checks

- Full suite: 980 passed, 38 skipped; 140 test files passed, 5 skipped.
- Additional atomic rollback assertion passed in the five-test backfill suite.
- TypeScript and ESLint passed. Production npm audit: zero vulnerabilities.
- `npm run build` originally failed because Turbopack could not bind its helper port,
  including a retry with expanded permissions. Build script now selects Webpack,
  the compiler already verified for this app. Final standard build result recorded
  below during release verification.
- Independent review found two importer reconciliation safeguards; both fixed:
  exact total row count and final mapped-evidence digest comparison.
- Supabase security advisor reports pre-existing auth/function configuration notices;
  no notice names the new guard function. The guard is invoker with fixed empty
  search_path and no public EXECUTE grant. Existing service-only tables intentionally
  have RLS without client policies. Existing RPC authorization is covered separately.
  [Advisor reference](https://supabase.com/docs/guides/database/database-linter).

## Deployment preparation

Production secret storage now contains the restricted pooled runtime URL, embedding
endpoint/model/key, calibrated threshold and Neon backend flag. No direct owner URL
was uploaded. Existing deployments retain their previous environment snapshots.

Previous production deployment: `dpl_7pmRyx65RGbHJPurbUEAXto43zTX`.
A previous Supabase-writing deployment cannot be promoted as a normal rollback
once Neon accepts new writes. Prefer a Neon-compatible build rollback; otherwise
pause writers, reconcile both stores, explicitly review unfreezing, then release.
Never just change the backend flag to Supabase.

Candidate verification and promotion: pending.

## Remaining operations after cutover

Scheduled indexing worker, retention/deletion of historical legacy copies, broader
model evaluations, restore drills and production-scale load remain follow-up work.
Current indexing is bounded and retries on subsequent writes/retrieval. No claim of
clinical suitability, broad multilingual generation quality or unbounded scale.
