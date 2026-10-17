# Neon memory metadata and runtime credential plan

<!-- documentation-context -->
> **Historical design / evaluation record.** This document preserves the plan and decisions at its recorded stage. Proposed work and approval checkpoints are not claims about the current deployed product. Start with the [documentation index](../../README.md) or [current architecture](../../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


> Execute inline as the next bounded prerequisite to the approved external-memory migration. Continue the existing feature branch; no production cutover.

**Goal:** Preserve editing/extraction metadata in Neon and replace the local runtime's database-owner login with a verified restricted login.

**Architecture:** Extend the existing JSON source contract without changing tables. A pure mapping boundary classifies legacy memory records and preserves attribution, confidence, tags, timestamps and provenance. Missing evidence is explicit and excluded from indexing/retrieval. A provisioning script uses the direct owner URL, creates a NOINHERIT login with only runtime-role membership, verifies privileges, then atomically updates only pooled DATABASE_URL in the ignored local env file. The owner direct URL remains for migration/fixture cleanup and must not be deployed to the application.

## Tasks

- [x] Write failing metadata/mapping tests: preserve every editable/source field; reject wrong senior and unsupported evidence; distinguish personal, operational and ambiguous records; preserve missing-source state and long safe notes.
- [x] Extend retrievalContracts.ts with optional typed metadata; add personalMemoryMapping.ts with source and caregiver read-model mapping. Filter missing-evidence records in pending/search/retrieval. Keep old fictional fixtures compatible.
- [x] Add SQL integration assertions for metadata round trip, correction/history/erasure and missing-evidence exclusion with scoped RLS.
- [x] Add tested provisioning/env helpers: no secret output, preserve unrelated env values, atomic file mode 600, reject unknown existing roles and mismatched database endpoints.
- [x] Test provisioning and safe repeat on a temporary Neon branch; delete branch/env. Provision selected branch and verify lifecycle using the restricted login.
- [x] Verify login flags/membership, no-scope and cross-senior reads, DDL and DELETE denial. Use only random fictional scopes; clean with direct owner.
- [x] Run memory/mapping/provisioning tests, typecheck, lint and webpack build; update roadmap/setup/evidence.

## Remaining application integration

Authenticated editing, query-aware agent retrieval, automatic extraction, channel retries, scheduled indexing, grounded generation, restore/backfill and retirement of legacy personal-memory paths follow this prerequisite. No senior import, Supabase mutation, deployment or cutover is claimed here. Operational Supabase auth/care/messages remain.

## Result

Selected branch and temporary branch passed restricted login and fictional source/
metadata/vector lifecycle checks. Temporary branch/env removed; local runtime URL
now uses the restricted login. Full suite 937 passed/38 skipped before final URL
guard; final focused suite 154 passed. Typecheck, lint, webpack build passed.
Independent review verified the query-override guard fix. Supabase env placeholders
are still empty; authenticated app verification and actual cutover remain open.
