# Engineering scripts

[Developer setup](../README.md) · [Validation evidence](../docs/VALIDATION.md)

Scripts support reproducible checks and controlled operations; they are not application entry points. Standard local development uses `npm run dev`. The default `npm run validate` runs offline tests, type checking, lint and build.

| Group | Files | Purpose / side effects |
| --- | --- | --- |
| Agent regression benchmark | `agent-benchmark.ts` | Deterministic evaluation by default; live mode explicitly enables provider requests |
| Model comparison | `agent-live-comparison.ts`, `agent-comparison-budget.ts` | Fictional baseline/candidate evaluation with persistent budget reservations; paid network access only when invoked |
| Jev social evaluation | `social-intent-baseline.ts`, `social-intent-live.ts`, `social-intent-budget.ts` | Classification contracts, comparison and budget enforcement |
| Jev routing evaluation | `routing-shadow-live.ts` | Bounded routing comparison and explicit recovery protocols |
| Full-flow evaluation | `whole-flow-shadow-live.ts`, `whole-flow-shadow-cases.ts`, `whole-flow-active-cases.ts` | Shadow/active fictional orchestration cases and response screens |
| Provider diagnostics | `triage-output-diagnostic.ts` | Controlled investigation of failed structured outputs; paid calls and recovery require the recorded protocol |
| Neon provisioning | `neon-memory-migrate.ts`, `neon-memory-runtime.ts`, `neon-memory-runtime-support.ts` | Schema/role/credential changes; never routine startup commands |
| Neon lifecycle checks | `neon-memory-smoke.ts`, `neon-memory-app-smoke.ts`, `neon-memory-index-smoke.ts` | Isolated fictional database/indexing checks; consult each script's preconditions and provider usage |
| Neon retrieval evaluation | `neon-memory-evaluation.ts` | Synthetic semantic benchmark with live embeddings and isolated database fixtures |
| Recovery rehearsal | `neon-memory-restore-smoke.ts` | Creates disposable Neon branches and verifies recovery; not a production rewind |
| Proactive retry check | `check-proactive-retries.mjs` | Fixture-backed checks of bounded scheduling/retry behaviour |
| Public deployment smoke | `release-smoke.mjs` | Read-only HTTP checks of health, privacy and deletion pages; no live AI calls |
| Script tests | `*.test.ts` | Budget, command, cleanup, lifecycle and failure-handling regressions |

The retired Pinecone-vector pilot and one-time legacy backfill are no longer part of the maintained script set. The current runtime uses Neon for canonical personal memory and vector search; Pinecone inference supplies embeddings.

Live scripts have separate risk profiles: paid provider requests, database fixtures, role/credential changes or disposable branches. Command flags, an approved target and appropriate budgets must be checked before execution. Environment variables stay in ignored files; output should not include keys, connection strings or personal records. Budget reservations are conservative bounds, not billing invoices.
