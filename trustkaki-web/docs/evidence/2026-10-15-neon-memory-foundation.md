# Neon memory foundation evidence

<!-- documentation-context -->
> **Dated evidence / release record.** Results and operational details apply to the recorded build, scope and date. They do not establish current deployment health or supersede the public architecture guides. Start with the [documentation index](../README.md) or [current architecture](../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


Date: 15 October 2026. Scope: owner-requested Neon Postgres setup and first
personal-memory source/pgvector slice. Production agents still use Supabase memory.

## Configuration and provisioning

- CLI `8.4.4`; `npx neon skills -y` installed local skills; installed Neon and
  Neon Postgres skills read. `neon init` installed plugins/MCP for detected agents.
- Owner completed CLI login. Initial init linked offline, explicitly unverified;
  authenticated `neon deploy` then verified the supplied target.
- Project `floral-hall-40623128`; org `org-muddy-mud-78267559`; branch `production`
  (`br-hidden-bird-b3xbfqzo`). Postgres only, no new auth/gateway/object/functions.
- Deploy output: `No changes — branch production already matches the policy.`
  `Utilized services: Postgres`; `Pulled 3 Neon variables into .env.local`:
  `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_BRANCH`.
- `.env.local` mode 600 and Git ignored. No credentials logged or committed.
- `neon.ts`, versioned SQL, `pg`/Vercel pool code and reproducible scripts saved.

## Implemented behaviour

Three tables in private `personal_memory` schema: records, revisions and command
receipts. All have RLS enabled and forced, with org/senior scope policies. Verified
on actual Neon, vector extension version `0.8.6`. Runtime queries use transaction-
local scope and restricted role, parameterised SQL, timeouts and verified TLS.

Canonical source updates clear old embeddings transactionally. New embeddings
publish only against the current active source version/model. Correction conflicts
and command replays are explicit. Archive retains evidence but excludes retrieval.
Erasure clears current/revision content, reasons, vectors and original context key;
a minimal tombstone/receipt prevents replay resurrection. External derivative or
backup erasure is not proven by this bounded schema test.

Exact cosine search is scoped before ranking and returns at most 20 candidates;
existing retrieval then bulk-checks current sources and applies its six-fact/4,000-
character budget. Query work grows with per-senior corpus; no scale guarantee.

## Verification

1. Tests written before repository and pool implementation. Initial missing-module
   and missing-health-field failures observed. SQL tests ran real embedded Postgres
   plus pgvector, including non-owner role/RLS tests rather than superuser reads.
2. Temporary Neon branch `memory-foundation-check` used to test migration and
   fictional lifecycle. After a small erasure/TLS refinement, recreated from the
   unmodified parent and final migration/lifecycle passed. Both temporary branches
   were removed; branch list afterward contains only the selected production branch.
3. Applied verified migration to selected `production`:

```json
{"migration":"001_personal_memory","applied":true,"branch":"production","importedSeniorRecords":0}
```

4. Live fictional smoke passed source round trip, exact command replay, concurrent
   correction conflict, scoped vector retrieval through `retrievePersonalMemory`,
   atomic old-vector invalidation, stale publication rejection, archive exclusion,
   erasure and replay-after-erasure. Only a random fictional scope was written and
   cleaned. Saved stdout: [lifecycle JSON](2026-10-15-neon-memory-lifecycle.json).
   Deterministic vectors were used; no embedding/chat API calls or semantic-quality
   measurements were performed in this chunk.
5. `npm run test`: `130 passed | 5 skipped` files;
   `918 passed | 38 skipped` tests. First sandboxed run could not bind loopback in
   existing release-smoke tests; rerun with loopback access passed.
6. `npm run typecheck`, `npm run lint`: exit 0. `npm run build`: exit 0:

```text
Next.js 16.4.0 (Turbopack)
Compiled successfully in 845ms
Finished TypeScript in 1335ms
Generating static pages ... (23/23)
```

7. Started built app:

```text
npm start -- --hostname 127.0.0.1 --port 3100
Ready in 89ms
```

HTTP check actual result:

```json
{"httpStatus":503,"status":"degraded","personalMemoryConfigured":true,"personalMemoryDatabase":true,"operationalDatabase":false}
{"homeStatus":200,"html":true}
```

**Neon service path works end to end. Whole-app health did not pass.** Local
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` are absent. The HTTP assertion requiring overall 200
therefore exited 1. No operational database or full authenticated care flow pass
is claimed. Configure those existing Supabase variables privately to verify that
flow; Neon credentials cannot replace them while operational data remains there.

8. Independent reviewer: no material findings, independently ran all 21 new/touched
   database/connection/health tests. No live calls or env reads by reviewer.
9. Production dependency audit: zero vulnerabilities. Installer's full audit
   reported 10 issues in the development dependency set; no broad upgrade attempted.
   `git diff --check` passed; local env/tooling files confirmed ignored.

## Remaining gates

- Dedicated least-privilege login credential (foundation uses owner URL then
  restricted `SET LOCAL ROLE`), complete legacy field mapping and access callers.
- Bounded indexing scheduling, retry/cost controls, multilingual semantic Neon
  benchmark, latency with remote source reads, ANN only if measurements need it.
- Export/restore, deletion replay and retention of all derived copies/backups.
- Grounded generation, prompt injection tests, authenticated/channel integration,
  classification/backfill, one authoritative writer and release cutover.
- MCP is installed/configured; its own first-use OAuth/tool session was not tested.

No Supabase memory rows were changed, no new chat/embedding requests were made,
and no Vercel application deployment was performed.
