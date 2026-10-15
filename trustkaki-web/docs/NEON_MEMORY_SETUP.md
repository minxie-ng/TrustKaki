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
- Select/configure the embedding provider independently of Pinecone vector storage;
  benchmark Neon with the same multilingual corpus and remote source reads.
- Add scheduled bounded indexing with recovery/cost controls.
- Dedicated database login, export/restore/erasure replay checks, retention policy.
- Wire authenticated reads/edits, extraction, channels and role-specific prompts;
  validate grounded generation, backfill and cutover under a single writer.
