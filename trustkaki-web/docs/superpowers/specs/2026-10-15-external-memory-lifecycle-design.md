# External personal memory: source storage and lifecycle

Date: 15 October 2026
Status: proposed; source-store choice needs owner review. No service provisioned.
Authority: `docs/TrustKaki_BUILD_ROADMAP.md`.

## Outcome

Replace Supabase as the authoritative store for personalised conversational memory
and its derived user context. Existing operational authentication, identity,
access relationships, messages, care cases, and schedules remain in Supabase.
Production cutover is complete only when all personal-memory reads and writes use
the external store, including caregiver tools and background/channel paths.

RAG still needs durable source storage. The successful Pinecone experiment used
local fixtures as its source of truth; production must replace that local lookup.

## Storage decision proposed

1. **Neon Postgres source records + Pinecone index — recommended.** Transactions
   support atomic revisions, idempotency, and indexing jobs; ordinary SQL supports
   bounded reads, exports, and portability. Adds one managed database and credential.
2. **Private object storage + Pinecone.** Portable source documents, but concurrent
   corrections, command deduplication, and durable job coordination require more
   custom implementation for this codebase.
3. **Pinecone as both source and index.** Fewer services, but requires redesign and
   verification of canonical revisions, audit history, coordinated writes, and
   recovery instead of reusing the current transactional lifecycle model.

Propose a dedicated Neon project for personal memory. Choose region after checking
application runtime location and data requirements. Singapore is available; the
current Pinecone pilot is in US East and is fictional-only. Do not treat it as an
approved region for real senior data. Verify actual plan, backup/restore features,
and spending controls before provisioning or live use. Previous US$1 permission
covers the fictional pilot, not an ongoing paid database subscription.

## Data boundary

- External: hobbies, food and activity preferences, personal recollections,
  conversational communication preferences, and evidence-grounded summaries.
- Supabase: login, organisation/senior identity and access, contact routing,
  consent, care cases, medication schedules, and essential care/accessibility
  context. These must remain available without semantic search.
- Existing `senior_memories`, `senior_health_contexts`, and `routine_baselines`
  require classification by purpose. `family_context` may be personal biography
  or operational contact routing; `routine_preference` is distinct from a care
  baseline. Ambiguous records block migration pending explicit classification.
- Summaries are deferred until correction/deletion can invalidate all derived
  records. Do not add ungrounded summaries or copy whole conversation histories.
- Existing messages remain operational records, as already agreed. Review memory
  snapshots in context events, traces, and channel recovery payloads separately;
  migration must not claim all legacy copies are gone while those remain.

## Authoritative source model

Use a separate database/schema with four narrowly scoped tables:

1. `personal_memory_records`: current canonical fact, org/senior scope, stable ID,
   context key, content, provenance/evidence, confirmation and expiry, status,
   integer version, explicit conflicts, safe-use notes, type/application tags.
   Preserve confidence/importance and author/extraction metadata used by current
   editing and extraction contracts. Enforce one current fact per scoped context
   key; represent disputes explicitly rather than silently overwriting.
2. `personal_memory_revisions`: immutable prior revisions for correction/archive
   audit, with actor, reason, command ID and timestamps. This history is subject
   to deletion; immutable means normal edits cannot rewrite it, not permanent
   retention against an erasure request.
3. `personal_memory_commands`: scoped command ID, payload digest and result.
   Exact retry returns prior result; same ID with another payload fails. Unique
   command key plus database locking handles concurrent duplicate commands.
4. `personal_memory_index_jobs`: durable scoped record/version and operation,
   status, attempts, next-attempt time, bounded failure category and worker lease.
   A unique record/version/operation key deduplicates jobs. No raw provider errors.

No cross-database foreign keys. Provenance uses stable Supabase message references
and a bounded evidence excerpt, with an explicit missing-source state on import.
Reject unsupported facts rather than inventing evidence. External scope derives
from trusted Supabase auth/verified channel identity, never request or model IDs.
Use parameterised SQL and a server-only least-privilege runtime credential;
database owner credentials are reserved for migrations. Scoped reads/writes and
database policies must both be tested for isolation.

## Write and retrieval lifecycle

- One external command handler serves accepted extraction and authorised manual
  create/confirm/correct/archive/delete actions. Existing eligibility rules remain.
- A transaction locks the current scoped context key, checks expected version,
  records the revision and command result, updates canonical state, and enqueues
  the indexing operation. Stale editors receive a conflict. Never call Pinecone
  inside the source transaction.
- Corrections immediately advance source version; archives/deletions immediately
  hide the source. Old vectors fail current-source validation while jobs catch up.
  A corrected fact may be temporarily absent from search; never return its stale
  predecessor to hide that lag.
- Worker claims jobs using leases, embeds current active content and upserts a
  vector with deterministic record-and-version ID, scope and model/version.
  Version-specific IDs prevent an older worker from overwriting a newer vector.
  Recheck canonical state after external I/O; obsolete work enqueues cleanup.
  Superseded/deleted vectors are removed with retryable jobs. Retain job/command
  metadata needed to prevent replay resurrection while purging personal content.
- On read, resolve access, embed current query, request at most 20 scoped hits,
  bulk fetch their current canonical sources, validate versions/status/expiry,
  then return at most six whole facts within existing 4,000-character budget.
  Retain the two-second total deadline; measure again with remote source reads.
- Deterministic care baselines remain outside semantic retrieval. Pattern Watch
  gets operational context directly; any optional personal enrichment is bounded
  and cannot suppress risk findings during retrieval outage.
- Retrieval outage is explicit unavailable context. Agents express uncertainty
  and continue applicable deterministic safety behaviour. No silent personal
  memory fallback to Supabase after cutover.

## Deletion, portability and recovery

- Distinguish archive (retained, unavailable for retrieval) from erasure (purge
  content/evidence in current and historical records and dependent artifacts).
  Every erasure first disables serving, then deletes vectors and derived content.
  Completion requires provider verification; pending cleanup is visible/retryable.
- Export scoped source records, versions and model/index manifest. Embeddings
  are reproducible artifacts, not the only surviving copy of memory.
- Rebuild from active unexpired source records into a new index namespace.
  Validate retrieval before changing the configured namespace/model pair.
- Prove restore to an isolated database and rebuild from restored sources. Replay
  deletion metadata before enabling any restored data; backups must not resurrect
  erased memories. Establish backup retention and recovery targets before real
  data migration, using verified plan capabilities rather than assumed features.

## Integration inventory verified in source

- `src/lib/persistence/seniorContextRepository.ts`: shared authenticated context
  loader; needs organisation resolution and current query input. Used by dashboard
  routes and verified WhatsApp/Telegram paths.
- `src/lib/persistence/memoryRepository.ts`: caregiver reads, application-tag reads,
  correction/archive RPCs and automatic extraction persistence.
- `src/lib/persistence/orchestrationRepository.ts`: automatic write/retry handling;
  preserve stable command IDs across partial cross-store persistence failures.
- `src/lib/persistence/patternRepository.ts`: direct memory and operational reads;
  classify dependencies before removing legacy queries.
- `src/app/api/seniors/[seniorId]/context/route.ts` and admin counterpart: access,
  read-model and editing contracts; preserve authenticated correction behaviour.
- `src/lib/telegram/service.ts`, `src/lib/whatsapp/service.ts`, authenticated agent
  routes, agent contracts/prompts and AAC Nudge: supply relevant grounded context
  with provenance. Keep fictional public demo independent of production services.
- Supabase SQL RPCs, context events, seed/import scripts and integration tests:
  retire personal-memory branches after cutover; retain operational branches.

## Bounded delivery sequence and acceptance

1. **Source/lifecycle slice first:** approved provider, schema, command handler,
   bulk source fetch, and indexing worker. Fictional local/database tests prove
   concurrent correction, command replay, stale worker, outage recovery, expiry,
   archive/erasure and cross-org/senior denial. No production wiring in this slice.
2. **External fictional lifecycle pilot:** verify source round trips, asynchronous
   correction/delete propagation, worker recovery, export/restore/index rebuild,
   and latency including remote source fetch. Record region/plan/cost limits.
3. **Agent integration:** wire shared trusted context flow, read/edit routes and
   automatic writer; run multilingual grounded-generation/injection evaluations
   and channel retry tests. Zero unsupported/foreign/stale personal facts.
4. **Backfill and cutover:** classify inventory, export snapshot/checksums, import
   idempotently with lineage, validate scope/content/provenance/counts. Freeze
   personal-memory writers for final reconciliation; switch all personal readers
   and the single writer together. No uncontrolled dual writing.
5. **Release and legacy retirement:** authenticated staging checks, approved
   promotion, post-cutover read/write/channel checks, then retention/deletion
   policy for old rows/events/derived copies. Read-only legacy copies are not a
   runtime fallback. After new external writes, rollback requires pausing writes
   and reconciling changes; reverting the deployment alone is insufficient.

This document is a design, not implementation or a passed migration gate.

## Official references checked

- https://neon.com/docs/serverless/serverless-driver — HTTP transactions and
  parameterised queries; interactive sessions need the WebSocket driver.
- https://neon.com/docs/introduction/regions — Singapore is listed; region is
  fixed when creating a project.
- https://neon.com/docs/postgres/backup-restore/backups — verify selected plan
  capabilities during setup; no restore entitlement assumed here.
- https://docs.pinecone.io/guides/index-data/data-modeling — index data modelling;
  source checks remain enforced by the application.
