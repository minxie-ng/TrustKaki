# Neon personal-memory setup and operations

Updated: 15 October 2026. Migration is reconciled; Neon-enabled candidates are under release verification. Production promotion is pending. See the [cutover record](evidence/2026-10-15-neon-memory-cutover.md).

## Selected setup

- Existing project `floral-hall-40623128`, org `org-muddy-mud-78267559`.
- Linked branch `production`; `neon.ts` declares Postgres only (`auth: false`).
- Existing Supabase Auth, care and messaging data remain operational.
- Personal-memory facts, revisions, receipts and vectors share Neon Postgres.
- Embedding generation is separate; this setup does not enable Neon AI Gateway.

## CLI and agent tooling

Owner-requested commands were used:

```sh
npx neon skills -y
npm i -g neon@latest
neon init -y --org-id org-muddy-mud-78267559 --project-id floral-hall-40623128 --branch production --services postgres
neon deploy
```

CLI 8.4.4 installed Neon plugins/MCP integration for detected local agents. The
user completed `neon login`; initialisation first linked offline, then deploy
verified the target and pulled three Neon variables. MCP can require its own
OAuth consent/reload on first use; CLI verification is the evidence in this chunk.
The app has no runtime MCP dependency. Agent skills are local tooling, ignored by
Git, and can be reinstalled with the command above.

`.neon`, `.env.local` and temporary `.env.neon-check.local` are ignored. The CLI
updates Neon variables and preserves the existing application's environment.
Never paste URLs or credentials into chat/logs. `DATABASE_URL` is pooled;
`DATABASE_URL_UNPOOLED` is direct. Code explicitly requests TLS `verify-full`.

## Versioned schema and verification

```sh
npm run memory:neon:migrate -- --confirm-live
npm run memory:neon:smoke -- --confirm-live
npm run build
npm start -- --hostname 127.0.0.1 --port 3100
```

The migration is intentionally one-time: refuses an existing `personal_memory`
schema rather than silently altering live tables. Test new migrations on a Neon
branch first. This script adds only its own schema, the vector extension and a
non-login runtime role; imports zero senior records. It does not reset Supabase.

The fictional smoke uses a newly generated org/senior scope, deterministic vectors,
assertions for source/retrieval/corrections/concurrency/archive/erasure, then deletes
only that exact scope's test artifacts. It makes no embedding or chat model calls.
This is database/vector lifecycle verification, not semantic-quality evaluation.

The application uses a lazy `pg` pool, applies `SET LOCAL ROLE` and trusted scope
inside each transaction, rolls back errors, and destroys cancelled connections.
The local pooled `DATABASE_URL` now uses `trustkaki_memory_app`, a SQL-created
NOINHERIT login with only non-admin runtime-role membership. Live checks deny
schema creation, direct DELETE and personal-memory access before SET LOCAL ROLE;
after role selection, missing scope returns zero rows. The direct owner credential
remains in local `DATABASE_URL_UNPOOLED` for migrations and fixture cleanup. Do not
ship that owner URL to the production application. Production secret storage now
contains the restricted runtime credential. Scope variables are set by trusted server code, not an
authentication mechanism for untrusted SQL clients.

`GET /api/health` verifies scoped schema access and exposes booleans only.
When `TRUSTKAKI_PERSONAL_MEMORY_BACKEND=neon`, health requires database reachability
and embedding configuration. It exposes enabled/configured booleans, not secrets.
Health does not replace live embedding, retrieval or generated-response checks.

## Remaining operations

- Metadata mapping, restricted credentials, authenticated integration, exact legacy
  import/replay and multilingual semantic retrieval are verified.
- Grounded generated replies passed on the accepted candidate. Its signed-in UI
  check, promotion and public smoke remain; consult the cutover record.
- Add scheduled bounded indexing with recovery/cost controls.
- Complete backup restore and retention operations. Lifecycle erasure is tested,
  but historical Supabase copies remain frozen evidence until retention is decided.

## Semantic retrieval verification (15 October)

```sh
npm run memory:neon:evaluate -- --confirm-live --confirm-provider-budget
```

Reuses the existing `TRUSTKAKI_MEMORY_EMBEDDING_ENDPOINT`,
`TRUSTKAKI_MEMORY_EMBEDDING_MODEL`, `TRUSTKAKI_MEMORY_PINECONE_API_KEY`,
`TRUSTKAKI_MEMORY_PILOT_MIN_SCORE`, and `TRUSTKAKI_MEMORY_PILOT_BUDGET_USD`.
This comparison deliberately fixes llama-text-embed-v2, the native inference
endpoint, and the previously calibrated score. It never calls a Pinecone vector
index. Existing account spending controls must remain in place: the script records
a declared budget, not a real-time dollar meter. No new services are provisioned.

`embeddings.ts` is independent of database storage and supports native Pinecone
inference or an explicitly configured OpenAI-compatible embeddings endpoint. All
vectors must be 1,024-dimensional, finite and nonzero. Changing embedding model
requires rebuilding vectors and evaluating the threshold again.

`indexPendingMemory` attempts at most 20 sources. Provider failures leave sources
pending; version-checked publication rejects corrections/erasures made during the
API call. This is the indexing operation, not a deployed scheduler or durable retry
policy. Source content is sent to the configured embedding provider.

The benchmark uses random fictional org/senior UUIDs and reads source facts from
Neon through the same scoped repository. It deletes records/revisions/receipts for
that exact scope in `finally` and asserts zero remaining rows. A cleanup failure
exits nonzero and requires investigation; no global deletion is performed.

Measured: 30/30 questions, zero forbidden facts, warm p95 501 ms.
[Evidence and limitations](evidence/2026-10-15-neon-semantic-retrieval.md).

## Metadata and runtime credential (15 October)

```sh
npm run memory:neon:runtime -- --confirm-live
```

The command reads the current ignored `.env.local`, uses its direct owner URL to
create the restricted login, proves role attributes/membership and privilege
boundaries, then atomically replaces only DATABASE_URL. It preserves other lines
and writes mode 600. A normal repeat reuses the saved password; an existing role
without a matching local credential fails rather than rotating it. Unknown query
options and duplicate URL options are rejected because pg query parameters can
override hostname or userinfo. Passwords, connection strings and SQL are never
printed. This is a provisioning tool, not an application endpoint.

`neon deploy`/`neon env pull` can restore a CLI owner URL. After an env pull, check
the runtime identity before release; do not silently accept owner credentials.
If the runtime role already exists but its local credential was lost, recover it
from your secret store or perform an explicit coordinated rotation. This script
refuses that rotation. The restricted credential is installed in Vercel production
secret storage; the owner URL remains local.

Sources now optionally carry typed metadata for memory type, confidence,
importance, application tags, extraction method, source attribution, timestamps,
follow-up, legacy status and supersession. Existing fictional fixtures remain
compatible. `personalMemoryMapping.ts` preserves all senior_memories row fields
and maps to the current caregiver read model. It performs no database reads/writes.
The caller must resolve trusted organisation/senior access and fetch source text.

Routing/accessibility tags classify a record as operational; family/other records
require explicit review. Reviewed personal classification cannot override an
operational tag. Missing evidence is represented by an empty excerpt and explicit
missing_source provenance, excluded in pending SQL, search SQL and final source
validation. No quote is fabricated from a stored fact. Status/lineage are retained
by the verified importer. Do not rerun the one-time schema migration or use the
backfill as post-cutover reconciliation after legitimate new edits.

## Deployment and rollback rules

- Runtime functions use `sin1`, alongside the Singapore Neon database. Build-region
  output may still say US East; inspect function placement separately.
- Keep the Neon backend selected after cutover. A compatible application build may
  be rolled back, but an old Supabase-writing build cannot safely resume without
  pausing writers, reconciliation and an explicit unfreeze plan.
- Retained Supabase personal rows are immutable historical evidence. New runtime
  memory reads/writes use Neon; there is no automatic Supabase personal fallback.
- Retrieval diagnostics contain fixed status/reason and numeric counts/timing only.
  Do not add source content, identifiers, connection strings or provider bodies.

[Verification evidence](evidence/2026-10-15-neon-memory-metadata-and-credentials.md).
