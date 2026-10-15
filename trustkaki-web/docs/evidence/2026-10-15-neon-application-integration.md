# Neon authenticated application integration — 15 October 2026

## Scope

Implemented behind `TRUSTKAKI_PERSONAL_MEMORY_BACKEND=neon`; saved environment and
production remain on the default Supabase path. No production migration or deploy.
Supabase credentials were verified without printing values (public/auth and
service database checks returned HTTP 200).

## Changes

- Scoped Neon transaction callbacks, original-request receipts and versioned commands.
- Verified Supabase organisation/senior access and source senior-message evidence.
- Canonical evidence normalization, expiry checks, manual caregiver attribution,
  immutable personal keys, stale-edit conflicts, correction/vector invalidation,
  archive and retry protection.
- Shared personal-memory loading for agent routes and verified messaging channels;
  essential operational context stays in Supabase. Optional retrieval outages are
  explicit and never restore legacy personal memory in Neon mode.
- Bounded reads and indexing retries, cancellation propagated through SQL and
  publication, and ready-vector retrieval despite a failed pending indexing attempt.
- Serialised purpose checks prevent accepted extraction from duplicating an active
  essential key across stores. Existing receipts are checked before mutable state.
- Agent evidence envelope retains provenance, bounds context and labels retrieved
  text untrusted. AAC now receives shared senior context.
- Authenticated opt-in smoke runner: `npm run memory:neon:app-smoke`.

## Verification

Commands and actual results:

```text
npm test
Test Files  138 passed | 5 skipped (143)
Tests       973 passed | 38 skipped (1011)

npm run typecheck
exit 0

npm run lint
exit 0

npm run build -- --webpack
compiled successfully; TypeScript passed; 23/23 static pages; exit 0

git diff --check
exit 0
```

Release smoke tests need local loopback permission. The first sandboxed suite
failed for that restriction and caller assertions that needed the new query/auth
arguments; these were fixed and the final full suite passed. The build used
Webpack; this is not a claim that the default Turbopack build passed on this host.

The live app smoke used the production build on 127.0.0.1:3100 with Neon mode
set only on the running process. It created temporary fictional Supabase identity,
organisation, senior and message records, then exercised real authenticated HTTP
routes, Neon commands and configured embedding inference. Its result:

```json
{"passed":true,"publicConfig":true,"authenticatedRead":true,"unauthenticatedDenied":true,"foreignSeniorDenied":true,"acceptedExtractionInNeonOnly":true,"liveSemanticRetrieval":true,"caregiverCorrection":true,"correctedFactRetrieved":true,"exactRetry":true,"staleEditorConflict":true,"archiveExcluded":true,"oldExtractionCannotResurrect":true,"fictionalFixturesCleaned":true,"generatedReplyEvaluated":false,"productionCutover":false}
```

Reproduce with provider spending controls and the calibrated model threshold:

```sh
TRUSTKAKI_MEMORY_MIN_SCORE=0.200106996389696 npm run memory:neon:app-smoke -- --confirm-live --confirm-provider-budget --origin=http://127.0.0.1:3100
```

This threshold belongs to the currently calibrated embedding configuration; do not
reuse it blindly after changing models. Smoke provider usage was fictional and
small; actual dollar billing was not reconciled. Independent code review rechecked
scope, receipts, purpose checks, evidence, indexing failures and cancellation;
no further important correctness/security findings remained.

## Read-only legacy inventory

```json
{"inventoryAvailable":true,"complete":true,"total":6,"personal":5,"operational":0,"reviewRequired":1,"missingMessageReference":5,"active":4}
```

No legacy rows were changed. Next: classify the ambiguous row; reconcile history
and duplicate keys; preserve missing provenance; backfill and compare source counts,
revisions and eligibility before enabling the backend. Missing references must not
be replaced with invented senior quotations.

## Remaining release gates

- Legacy classification, provenance review, backfill and rollback reconciliation.
- Live generated-reply faithfulness and injection evaluations; prompt tests alone
  do not prove model behaviour.
- Deployment credentials, signed-in dashboard/release checks and deliberate cutover.
- Durable indexing scheduling, provider cost controls, restore and retention policy;
  current retries occur on writes/retrieval, not a scheduled worker.
- Production scale and concurrent load measurements. Exact scoped search is bounded
  at its output, but its database work still grows with each senior's corpus.

[Roadmap](../TrustKaki_BUILD_ROADMAP.md) · [Architecture guide](../PERSONAL_MEMORY_RAG_GUIDE.md)
