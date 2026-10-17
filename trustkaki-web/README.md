# TrustKaki — developer guide

AI-assisted care coordination for AAC staff. Start with the [project overview](../README.md), [judge guide](docs/JUDGE_GUIDE.md) and [architecture explanation](docs/ARCHITECTURE_GUIDE.md).

## Runtime stack

| Layer | Implementation |
| --- | --- |
| Web application | Next.js, React, TypeScript; Node.js server routes |
| Conversational agents | OpenAI-compatible chat adapter; configured model `gpt-4o-mini` |
| Specialist routing | Jev through OpenRouter, gated by server flags and deterministic policy |
| Personal memory | Neon Postgres, `pg`, pgvector; canonical facts and vectors |
| Embeddings | Pinecone inference, `llama-text-embed-v2`, 1,024 dimensions |
| Authentication and operations | Supabase Auth/Postgres; scoped staff access and care records |
| Outdoor information | data.gov.sg/NEA weather and regional air-quality APIs |
| Hosting | Vercel, connected to GitHub |

## Local setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The no-login **Explore demo** uses fictional browser state. Authenticated **Judge workspace** makes live provider calls and saves demo results; it requires configured services and an existing authorised account.

### Environment configuration

Use [`.env.example`](.env.example) as the full reference. Do not commit secrets.

| Capability | Settings |
| --- | --- |
| Authentication/operations | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Chat provider | `TRUSTKAKI_LLM_API_KEY`, `TRUSTKAKI_LLM_BASE_URL`, `TRUSTKAKI_LLM_MODEL`, timeout |
| Active Jev routing | `OPENROUTER_API_KEY`, `TRUSTKAKI_JEV_ROUTING_ENABLED=true` |
| Jev social decisions | `TRUSTKAKI_JEV_ENABLED=true`; separate from routing |
| Neon memory | `TRUSTKAKI_PERSONAL_MEMORY_BACKEND=neon`, pooled `DATABASE_URL`, embedding configuration and calibrated minimum score |
| Migrations | `DATABASE_URL_UNPOOLED`; restricted runtime credentials must not be migration-owner credentials |
| Messaging/schedulers | Optional channel credentials and processor secrets documented in the environment template |

Only `NEXT_PUBLIC_*` configuration is intended for the browser. Service-role, model, OpenRouter and database credentials remain server-side. The template retains conservative opt-in defaults; copying it alone does not reproduce production services.

Follow [Neon memory setup](docs/NEON_MEMORY_SETUP.md) for database roles, migrations and indexing. Review Supabase migrations under `supabase/migrations/` against the intended project before applying them. Do not seed or reset an unrelated or real-care database. Embedding model changes require a compatible index and reindexing.

## Code navigation

- `src/components/`: care workspace, setup, public walkthrough and authenticated judge conversation.
- `src/lib/agents/`: prompts, typed contracts, schemas, runners, Jev routing and final policy.
- `src/lib/memory/`: canonical store, validation, embeddings, indexing and retrieval guards.
- `src/lib/persistence/`: operational persistence and application repository adapters.
- `src/lib/telegram/`, `src/lib/whatsapp/`: inbound events, automatic replies and channel delivery handling.
- `src/lib/checkins/`, `src/lib/patterns/`: configured Telegram outreach and multi-day signal rules.
- `src/app/api/`: authenticated application routes, channel webhooks and protected workers.
- `scripts/`: migration, evaluation and release tooling; read each procedure before running live commands.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
# Or all four:
npm run validate
```

Tests include deterministic agent/policy checks, memory retrieval guards and local Postgres/pgvector tests. Live database suites create fixtures and remain opt-in. Paid evaluations require explicit budgets; neither is part of the default quickstart.

For read-only deployment checks:

```bash
npm run release:smoke -- https://trustkaki.vercel.app
```

Use the [release runbook](docs/operations/HACKATHON_RELEASE_RUNBOOK.md) for deployment, approval and rollback procedures. GitHub is the source of truth; pushes to the connected production branch trigger Vercel builds. Keep API routes on the supported Node.js runtime.

## Access and limitations

Judges use the existing `demo@trustkaki.com` account with a privately supplied password. Public registration is not exposed. Authorisation uses verified identity and trusted role metadata, not browser-submitted caregiver IDs. There is no public unauthenticated live-AI endpoint.

The browser walkthrough is isolated; the shared authenticated judge workspace is stateful and uses fictional records. Keep real personal information out. Model output remains fallible, the in-process rate limiter is not a distributed quota system, and the application is not clinically validated. WhatsApp final delivery requires external business verification.

Dated operational and evaluation documents preserve the conditions under which checks ran. Historical plans or release records do not imply that every current deployment has repeated every live evaluation.
