# Neon personal-memory operations

[Documentation](../README.md) · [RAG architecture](../PERSONAL_MEMORY.md) · [Recovery and retention](PERSONAL_MEMORY_RECOVERY_RETENTION.md)

Neon Postgres is the canonical personal-memory store. Personal facts, evidence references, versions, revisions, receipts and vectors share one database. Supabase continues to provide authentication and operational care data.

![Personal-memory storage, indexing and retrieval](../media/memory-lifecycle.svg)

## Configuration boundary

| Setting | Purpose |
| --- | --- |
| `TRUSTKAKI_PERSONAL_MEMORY_BACKEND=neon` | Selects the Neon personal-memory repository |
| `DATABASE_URL` | Pooled application traffic using the restricted runtime login |
| `DATABASE_URL_UNPOOLED` | Direct migration/provisioning credential; not an application runtime credential |
| `TRUSTKAKI_MEMORY_EMBEDDING_ENDPOINT` | Configured embedding API endpoint |
| `TRUSTKAKI_MEMORY_EMBEDDING_MODEL` | Embedding model compatible with the index |
| `TRUSTKAKI_MEMORY_MIN_SCORE` | Model-specific calibrated retrieval threshold |

The [environment template](../../.env.example) lists the complete configuration. Production uses Pinecone inference for 1,024-dimensional `llama-text-embed-v2` vectors; vectors are stored and searched in Neon, not the historical Pinecone pilot index.

The runtime uses a lazy `pg` pool, TLS verification, transactions and scoped role selection. Trusted server code resolves access before setting organisation/senior scope. Scope settings are not a substitute for authenticating arbitrary SQL clients. Runtime functions are configured in Singapore; build location is a separate platform concern.

## Provisioning and schema changes

Neon CLI and MCP are development/operations tools, not runtime dependencies. The application declares Postgres in `neon.ts`; it retains Supabase Auth. Service linking and environment pulls are performed against the intended project and branch.

The initial schema command is intentionally one-time and refuses an existing `personal_memory` schema:

```bash
npm run memory:neon:migrate -- --confirm-live
```

The indexing-retry migration has an explicit version:

```bash
npm run memory:neon:migrate -- --confirm-live --migration=002_index_retries
```

These are mutating operator commands, not local quickstart steps. New migrations require an isolated-branch rehearsal and the release procedure. Applied migrations must not be rerun blindly.

## Restricted runtime identity

```bash
npm run memory:neon:runtime -- --confirm-live
```

This provisioning command uses the direct owner credential to create/verify the restricted login and update only the local pooled `DATABASE_URL`. Credentials are not printed. It refuses an implicit rotation when an existing role has no matching local credential.

A CLI environment pull can restore an owner connection string. Runtime identity therefore requires verification after environment changes. Owner credentials belong in controlled migration/provisioning storage, not deployed application runtime settings. Lost credentials require an explicit recovery or coordinated rotation procedure.

## Indexing recovery

| Control | Bound |
| --- | --- |
| Foreground indexing claim | At most 20 sources |
| Protected worker claim | At most ten sources |
| Claim lease | Two minutes |
| Attempts | Five per source version |
| Retry backoff | 15 / 30 / 60 / 120 / 240 minutes |
| Publication fences | Source version, model and claim token must match |

Corrections create a new version and reset its attempt cap. Exact command replay does not. A failed embedding call preserves the accepted source; it does not imply the fact is searchable. Exhausted pending facts require review and intentional correction/reconfirmation.

The protected `/api/internal/memory/process-pending` worker uses `CRON_SECRET`. Its configured daily schedule supports bounded recovery rather than immediate indexing or a dollar-spending guarantee. Deployment configuration is the source of truth for the active schedule; provider spending controls remain necessary.

## Verification procedures

```bash
# Live database/vector lifecycle fixture; not a language-quality benchmark:
npm run memory:neon:smoke -- --confirm-live

# Live semantic benchmark; includes provider use:
npm run memory:neon:evaluate -- --confirm-live --confirm-provider-budget

# Offline application checks:
npm run validate
```

Live checks require the corresponding environment, budget and fixture scope approvals. Fixture tools operate on isolated fictional scopes and verify cleanup. They are separate from the standard local development path.

`/api/health` reports sanitised readiness booleans. It does not prove live embeddings, response faithfulness or conversational quality. The [validation summary](../VALIDATION.md) records the scope and limitations of the retained retrieval and integration evidence.

## Rollback and data lifecycle

Neon mode has no silent fallback to legacy Supabase personal memory. An application rollback must remain compatible with the current memory store. Resuming an old Supabase writer requires a deliberate writer pause and reconciliation plan; changing a backend flag is not a safe data rollback.

Archiving, correction and erasure have distinct semantics. Restoring a historical database can reintroduce erased information unless erasure operations are replayed. Independent backup and post-restore erasure checks remain open prerequisites for real senior use. The [recovery/retention runbook](PERSONAL_MEMORY_RECOVERY_RETENTION.md) preserves the operational procedure and known limitations.
