# Neon personal-memory foundation

Updated: 15 October 2026. This is a foundation, not a production agent migration.

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
The CLI-provided database owner credential is used for this foundation, with
queries switching to the restricted runtime role. Before real senior cutover,
provision a separate login credential granted only that role; do not claim the
owner credential itself has least privilege. Scope variables are set by trusted
server code, not an authentication mechanism for untrusted SQL clients.

`GET /api/health` verifies scoped schema access and exposes booleans only.
Memory remains optional until production cutover, so its failure does not yet
change the existing operational health status. No application agent uses external
personal memory until its generation/access/migration gates pass.

## Remaining gates

- Complete type/application-tag/confidence mapping for existing context records.
- Embedding provider and live semantic retrieval are verified in the bounded
  fictional slice below; automatic production scheduling remains open.
- Add scheduled bounded indexing with recovery/cost controls.
- Dedicated database login, export/restore/erasure replay checks, retention policy.
- Wire authenticated reads/edits, extraction, channels and role-specific prompts;
  validate grounded generation, backfill and cutover under a single writer.

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
