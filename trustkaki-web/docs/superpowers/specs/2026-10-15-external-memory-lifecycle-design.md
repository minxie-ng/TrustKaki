# External personal memory: source storage and lifecycle

Date: 15 October 2026
Status: updated architecture approved by owner: Neon Postgres with pgvector.
Supersedes the original Neon + Pinecone proposal.
Authority: `docs/TrustKaki_BUILD_ROADMAP.md`.

## Outcome

Replace Supabase as the authoritative store for personalised conversational memory
and its derived user context. Existing operational authentication, identity,
access relationships, messages, care cases, and schedules remain in Supabase.
Production cutover is complete only when all personal-memory reads and writes use
the external store, including caregiver tools and background/channel paths.

RAG still needs durable source storage. The successful Pinecone experiment used
local fixtures as its source of truth; production must replace that local lookup.

## Approved storage decision

Use Neon Postgres for both canonical personal-memory records and pgvector search.
Supabase remains the operational store. Pinecone remains historical pilot evidence;
no new Pinecone vector integration is planned. Embedding provider remains separate
from chat generation and storage; the existing model uses 1,024 dimensions.

A source revision and its current vector share one transactional database. Source
changes clear the vector atomically. Indexing is a compare-and-set update against
source version/model; delayed embedding responses cannot restore stale vectors.
Pending indexing state lives on the source row, removing the cross-service job
queue needed by the earlier Pinecone proposal. Worker scheduling and retries remain
a later integration chunk; this first slice exposes pending rows and guarded writes.

Owner-supplied project: `floral-hall-40623128`, branch `production`, Postgres only.
Use `pg` with Vercel pool lifecycle management as recommended by installed Neon
skills. Schema changes are versioned SQL, verified locally first. No real senior
records are imported during setup. A SQL fixture test and optional connection
health check establish the first integration; agent cutover remains gated.

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

Use a separate schema with three narrowly scoped tables:

1. `personal_memory_records`: current canonical fact and optional pgvector embedding, org/senior scope, stable ID,
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
Pending embeddings are represented by a null vector on an active source row.
A bounded indexing reader selects pending records; publication compares source
version and embedding model. Source corrections and erasure clear vectors in the
same transaction. No Pinecone cleanup job or duplicated vector content is needed.

No cross-database foreign keys. Provenance uses stable Supabase message references
and a bounded evidence excerpt, with an explicit missing-source state on import.
Reject unsupported facts rather than inventing evidence. External scope derives
from trusted Supabase auth/verified channel identity, never request or model IDs.
Use parameterised SQL and a server-only least-privilege runtime credential before
real senior cutover; database owner credentials are then reserved for migrations.
The foundation currently uses the CLI owner connection with an explicit restricted
`SET LOCAL ROLE`; dedicated login provisioning remains an unpassed release gate. Scoped reads/writes and
database policies must both be tested for isolation.

## Write and retrieval lifecycle

- One external command handler serves accepted extraction and authorised manual
  create/confirm/correct/archive/delete actions. Existing eligibility rules remain.
- A transaction serializes commands per scoped senior and locks the current record, checks expected version,
  records the revision and command result, updates canonical state, and clears
  the embedding for reindexing. Stale editors receive a conflict. Never generate embeddings
  inside the source transaction.
- Corrections immediately advance source version; archives/deletions immediately
  hide the source. Old vectors are cleared transactionally while indexing catches up.
  A corrected fact may be temporarily absent from search; never return its stale
  predecessor to hide that lag.
- An indexing caller reads a bounded batch of pending sources, generates vectors,
  and publishes with a source-version/model compare-and-set. Multiple callers may
  duplicate embedding work, but stale work cannot overwrite current state. This
  first slice adds no scheduler or automatic retry; production worker scheduling
  and cost controls require a subsequent integration task.
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
  Every erasure first disables serving, then removes vectors and derived content.
  Completion requires checking source, revision and derived-artifact stores.
- Export scoped source records, versions and model/index manifest. Embeddings
  are reproducible artifacts, not the only surviving copy of memory.
- Rebuild from active unexpired source records into a separately versioned model/index configuration.
  Validate retrieval before changing the configured model/index pair.
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
   bulk source fetch, and guarded embedding publication. Fictional local/database tests prove
   concurrent correction, command replay, stale embedding publication, outage recovery, expiry,
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
