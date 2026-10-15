# TrustKaki — Active Roadmap

Updated: 15 October 2026

Status: Neon personal memory is live in production; legacy import is reconciled and old personal writes frozen.
Signed-in candidate, exact deployment promotion, public smoke and production memory/reply checks passed.
Next: validate restore and retention operations, then take the next agreed UI/agent slice.

Approved next-slice architecture: [external personal-memory storage and lifecycle](superpowers/specs/2026-10-15-external-memory-lifecycle-design.md).
Neon with pgvector holds canonical personal memory and vector search together.
Pinecone vector storage is historical pilot evidence; its configured inference API
still generates embeddings. Neon setup and the first source/pgvector lifecycle slice passed local and live
fictional checks. [Evidence](evidence/2026-10-15-neon-memory-foundation.md).
Latest Neon semantic benchmark: 30/30 questions, zero forbidden facts, warm p95 460 ms.
[Cutover evidence](evidence/2026-10-15-neon-memory-cutover.md).
Production personal-memory cutover completed on 15 October 2026, runtime commit `4a262ac`.

## Purpose and authority

This is the source of truth for the next development cycle: personalised memory
and retrieval, agent behaviour, and a cleaner care interface. Update this file
when a chunk is completed or a decision changes. Mark work complete only with
recorded evidence; distinguish local checks from live verification.

The active application is `trustkaki-web/` in this repository. Historical
hackathon requirements, plans, and evidence remain reference material. This
roadmap supersedes their development priorities, including the old restriction
against vector retrieval. The previous roadmap remains available in Git history.
[PROJECT_CLOSEOUT.md](PROJECT_CLOSEOUT.md) records the hackathon release and its
outstanding operational items; it does not set this cycle's priorities.

## Product goal

Help older adults receive personal, respectful support, and help AAC staff and
family caregivers recognise meaningful changes and take clear human action.

Three outcomes guide this cycle:

1. Relevant personal context remains useful as conversation history and senior
   count grow. Memory remains correctable, traceable, and portable across models.
2. The interface looks cleaner and makes priority, supporting evidence, and the
   next action obvious at one glance.
3. Each agent has a precise responsibility, appropriate context, and measurable
   behaviour. Additional agents require evidence of a useful improvement.

## Baseline

- Next.js/React application with Supabase persistence, authenticated care
  workspace, isolated fictional public demo, Telegram and WhatsApp processing.
- Six LLM roles: Orchestrator, Triage, AAC Nudge, Digital Safety, Context Memory,
  and Briefing. Deterministic policy and Pattern Watch govern safety decisions.
- Structured memory already supports provenance, confidence, expiry, correction,
  and supersession. Current context selects a bounded set by importance,
  confidence, and recency. An isolated semantic-retrieval module now exists;
  production integration and live semantic measurements remain open.
- An OpenAI-compatible provider adapter already separates chat model calls.
- Growth risks include retained messages/traces, context/results retained in
  channel retry records, repeated scheduler retries, and unbounded dashboard reads.
  Replay bindings store an HMAC, not a duplicated payload. Aggregate live storage
  and retry counts were inspected on 14 October; load capacity remains unmeasured.
- Generated build caches and stale worktree dependencies were removed. Source,
  evidence, environment configuration, and primary development dependencies were
  preserved. The old UI worktree source remains pending reconciliation because
  its Git metadata references a previous filesystem location.
- Baseline local checks: 801 tests passed, 38 skipped; TypeScript and ESLint
  passed. Release-smoke tests required loopback permission. No new build or live
  database/provider verification was performed during cleanup.

## Delivery order

Complete one bounded chunk, record evidence, then move to the next. UI discovery
can begin alongside memory discovery; final UI integration follows stable data
and agent contracts. Each phase gets a focused implementation plan when started.

### 1. Establish evaluation and growth baseline — next

- [ ] Extend existing fictional benchmarks with relevant old memories, changed
  preferences, contradictions, expired context, missing context, Mandarin,
  Singlish, and malicious instructions inside retrieved content.
- [ ] Define expected retrieved facts, prohibited facts, and acceptable replies.
  Include cross-senior and cross-organisation isolation cases.
- [ ] Measure current retrieval quality, response faithfulness, latency, and model
  calls/cost where available. Record dataset, model, prompt version, and limits.
- [x] Record aggregate live storage, source-level query growth, and synthetic
  sizing arithmetic. [Evidence](evidence/2026-10-14-storage-growth-baseline.md)
  distinguishes these from load testing. Retention policy and capacity targets
  remain to be decided before deletion or archival.

Done when: a reproducible baseline and explicit acceptance thresholds exist for
retrieval, safety, response quality, storage growth, and query bounds. Current
benchmark results are not clinical or target-user validation.

### 2. External personal memory store and RAG

Architecture decision, 14 October: move personalised conversational memory out
of Supabase. Supabase remains the operational store for authentication, access
relationships, care cases, messaging records, schedules, and other care data.
RAG is the retrieval process; a separate durable memory store must hold source
facts/summaries, provenance, and their search index. Neon Postgres with pgvector
has been selected to keep canonical facts and their derived vectors together.

Define the boundary explicitly before migration: conversational preferences and
recollections belong in external memory; operational care records and essential
safety/accessibility fields must remain authoritative and reliably available.
Classify existing routine/health-context fields by purpose rather than moving
all senior-related data blindly. Supabase must not remain the long-term personal
memory backend or an implicit fallback after cutover.

Deliver in four chunks:

- [ ] **Bound growth:** cap scheduler retries and avoid repetitive quiet-hour
  retry events; paginate history/trace reads; review channel recovery payload
  retention; define summaries and archival by data
  type. Preserve required audit history and recovery paths. Expiry filtering alone
  does not remove stored rows; destructive cleanup needs an explicit policy.
- [ ] **Select and migrate memory storage:** evaluate a dedicated external memory
  store for durable source records, retrieval, tenant isolation, correction,
  deletion, export, backup, cost, and operational complexity. Preserve existing
  provenance and supersession semantics. Plan backfill, verification, rollback,
  and one authoritative write path at cutover. Retire Supabase personal-memory
  reads/writes only after migration passes; remove legacy copies through an
  explicit retention/deletion policy.
- [ ] **Retrieve relevant memory:** retrieve external personal facts and grounded
  conversation summaries within a fixed context budget. Keep essential profile
  and safety/accessibility context available deterministically. Enforce verified
  tenant/senior scope before retrieval and filter status, expiry, and supersession
  before context reaches the model.
- [ ] **Integrate and preserve portability:** make external source records
  authoritative for personal memory and embeddings a rebuildable index. Record source,
  timestamp, embedding model/version, and indexing state. Make indexing retries
  idempotent; corrections and deletions must invalidate derived content. Fall back
  safely when retrieval is unavailable without silently restoring legacy memory.
  Keep chat and embedding model choices
  separate; changing embeddings may require reindexing.

Done when: relevant older context beats the baseline; stale/corrected facts are
excluded; isolation tests pass; context and reads stay bounded as history grows;
index rebuild and failure recovery work. Personalisation no longer depends on
Supabase memory tables after verified cutover. Report storage and latency trade-offs.
RAG improves relevance; summaries, retention, deduplication, and bounded reads
control growth. Embeddings also consume storage.

Completed retrieval subchunk, 14 October:

- [x] Trusted-scope contract, bounded retrieval and context, source revision/status/
  expiry checks, explicit conflict exclusion, and two-second deadline.
- [x] Eight preserved fictional guard cases, 1,000-distractor multilingual pilot,
  opt-in Pinecone adapter, and offline transport/evaluation tests.
- [x] Independent code review and local verification. See
  [implementation evidence](evidence/2026-10-14-personal-memory-retrieval.md) and
  [presentation/architecture guide](PERSONAL_MEMORY_RAG_GUIDE.md).
- [x] Run the configured external semantic pilot. Pinecone remains a candidate.
  A dedicated `trustkaki-memory-pilot` index was created on 15 October: dense,
  1,024 dimensions, cosine, AWS `us-east-1`, Starter plan. Verified empty in the
  console. Pinecone-hosted embedding adapter, separate calibration, and first live
  pilot passed: Recall@6 10/10 per language, zero forbidden facts, p95 986ms.
  [Live evidence](evidence/2026-10-15-memory-live-pilot.md). This small synthetic
  result does not establish production capacity or broad multilingual quality.
- [x] Select Neon Postgres with pgvector; implement source lifecycle and bounded
  pending indexing; pass live multilingual retrieval using remote source reads.
- [x] Preserve editing/extraction metadata and explicit missing-evidence state;
  verify a SQL-created restricted runtime login on a test branch and selected
  branch. [Evidence](evidence/2026-10-15-neon-memory-metadata-and-credentials.md).
- [x] Connect authenticated shared readers, extraction, caregiver corrections, archive,
  and bounded indexing retries behind `TRUSTKAKI_PERSONAL_MEMORY_BACKEND=neon`.
  Verify fictional live access isolation, semantic retrieval, exact retries and
  stale-editor conflicts. [Application evidence](evidence/2026-10-15-neon-application-integration.md).
- [x] Classify/backfill existing memory: five personal rows imported as four canonical
  records and one revision. Family-contact routing stays operational in Supabase.
  Missing-evidence records remain excluded from retrieval until caregiver confirmation.
  [Migration evidence](evidence/2026-10-15-neon-memory-cutover.md).
- [x] Verify corrected/current/empty generated replies with an injection-bearing
  fictional fixture and exact model-input assertions. 984 tests, typecheck, lint
  and build pass; candidate `4a262ac` accepted by independent review.
- [x] Complete signed-in verification on the accepted candidate and promote the
  Neon-enabled application; verify the public production alias and repeat fictional
  memory lifecycle, access isolation and all three generated-reply checks with cleanup.
- [x] Release scheduled indexing: retry/lease migration, 995 tests, branch and
  production recovery checks, candidate generated replies and signed-in UI pass.
  Runtime `a208a00d284a` promoted; hosted memory cron returned 200 and production
  public smoke passed. Daily schedule active; natural daily tick not yet observed.
  [Worker evidence](evidence/2026-10-15-memory-index-retries.md).
- [ ] Validate restore and historical-copy retention.
- [x] Review three migrated active facts with the project owner; retain them as
  fictional demo context using authenticated corrections. Verify three manual
  confirmations, three current embeddings and three explicit fictional audit reasons.
  [Review evidence](evidence/2026-10-15-demo-memory-confirmation.md).

Earlier growth subchunk: scheduler retry cap and quiet-hour retry fix are deployed
and verified; broader retention/pagination work remains open.

Shared AAC/service/digital-safety knowledge is a separate retrieval scope. Add
only when needed, with maintained sources, dates, and update ownership.

### 3. Agent responsibilities, prompts, and handoffs

- [ ] Document each existing role's inputs, evidence rules, output schema,
  uncertainty behaviour, trigger, and handoff. Keep deterministic risk authority.
- [ ] Rewrite prompts against those contracts; distinguish quoted/retrieved data
  from instructions. Require factual grounding and respectful, concise language.
- [ ] Pass role-relevant retrieved context to each agent. Fix AAC Nudge's missing
  known-context input; forbid invented invitations, activities, or social claims.
- [ ] Establish ownership of one coherent senior-facing reply across specialist
  outputs. Preserve channel reliability and avoid duplicate or conflicting advice.
- [ ] Compare revised roles/prompts against the same evaluation set. Record
  routing, schema validity, groundedness, safety, latency, and cost regressions.

Done when: contracts and prompts agree with actual inputs; evaluation thresholds
pass; replies remain grounded under missing/conflicting context. Add an agent
only when an evaluated gap warrants its extra calls, latency, and complexity.
Retrieval itself can remain ordinary application code.

### Proposed extension: verified community-event discovery

Capture nearby AAC/community events from a verified source, match interests and
practical constraints, and offer an optional invitation through AAC Nudge.
Start with one maintained source or staff-curated feed; evaluate a dedicated
agent only if matching needs separate reasoning. API/MCP availability, terms,
coverage, and freshness must be verified before choosing an integration.

Candidate sources checked on 14 October: [onePA event search](https://www.onepa.gov.sg/events/search)
and [HealthHub Live Well, Age Well](https://www.healthhub.sg/programmes/healthy-ageing/health-programmes/live-well-age-well/).
Public listings exist; a supported public event API/MCP was not established by
this limited check. A webpage is not evidence of an integration contract.

Before proactive delivery: explicit invitation preferences/opt-in, quiet hours,
frequency caps, dismissal cooldowns, duplicate prevention, stop/pause controls,
and higher-priority care suppression. Match neighbourhood/travel range, language,
interests, cost, timing, and accessibility; unknown suitability needs clarification.
Fetch shared event data once rather than once per senior. Avoid sharing care
history with event providers. Recheck date, cancellation, eligibility, and source
freshness before suggesting; never claim booking, availability, or staff/family
involvement without evidence. No automatic registration or payment.

Status: proposed; no new agent, connector, scheduler, or message implemented.
Evaluate after core memory/agent contracts and scheduler reliability are stable.

### 4. Cleaner interface and clearer attention

Primary workspace users: AAC staff and family caregivers. Senior-facing messages
also need readable, calm, respectful presentation.

- [ ] Review current screens and produce a focused layout for the main care flow:
  choose a person/case, understand the change, act, and confirm the result.
- [ ] Set a clear visual order: who needs attention, what changed and when, why it
  matters, then the next human action. Show deeper history and technical traces
  on demand. Keep urgent safety evidence visible.
- [ ] Simplify competing cards, repeated labels, navigation, and controls. Use
  consistent spacing, typography, restrained colour, and clear action emphasis.
  Distinguish urgent, routine, resolved, empty, loading, and error states.
- [ ] Make memory evidence, age/freshness, and correction/archive actions easy to
  find without crowding the main decision view.
- [ ] Verify desktop/mobile layouts, readable contrast and text, keyboard access,
  focus order, and clear completion feedback. Preserve demo/live distinction.
- [ ] Check the fictional care flow with representative users: can they identify
  the priority person, reason, and next action without coaching? Record observed
  confusion and corrections; do not claim target-user validation prematurely.

Done when: the main view answers “Who needs attention, why, and what next?” at a
glance; the action flow works without opening technical details; usability and
accessibility checks pass. Visual polish is part of the outcome.

### 5. Integrated release verification

- [ ] Run focused regression checks and `npm run validate` from `trustkaki-web/`.
- [ ] Verify memory correction, retrieval failure, model configuration changes,
  message retries, one senior reply, and persisted caregiver actions together.
- [ ] Verify browser flows and tenant isolation; run separately scoped live
  checks only where required. Record deployment/migration/rollback evidence.
- [ ] Update setup documentation, measured limits, and this roadmap's status.

Done when: evidence supports the shipped behaviour, migration/recovery paths are
clear, and remaining limits are explicit. Deployment is a separate recorded step.

## Boundaries throughout

- Preserve tenant isolation, trusted identity, server-side secrets, source
  provenance, correction controls, and fictional public-demo isolation.
- Human caregivers own care decisions. No diagnosis, prescribing, or fabricated
  claims about family, staff, services, or real-world actions.
- Reuse current helpers, schemas, benchmark tools, components, and provider
  adapter. Add infrastructure or abstractions only for demonstrated needs.
- Keep WhatsApp account restoration, WorkBuddy access, and historical submission
  tasks separate from this development cycle.

## Progress record

- **14 October 2026 — complete:** repository review and generated-file cleanup;
  baseline local checks recorded above; roadmap reset to current priorities.
- **14 October 2026 — phase 1 in progress:** eight fictional structured-memory
  cases now reproduce current loader behaviour. Six meet context targets; two
  expose relevance/conflict gaps. Related tests: 88 passed; TypeScript and focused
  lint passed. [Baseline evidence](evidence/2026-10-14-memory-retrieval-baseline.md)
  records reproduction and limitations. Reply quality remains unmeasured.
- **14 October 2026 — storage baseline complete:** application relations total
  8.20 MiB; proactive audit events dominate. One failed job has 15,018 claim
  attempts; 14,996 retry events exist. [Evidence](evidence/2026-10-14-storage-growth-baseline.md)
  records live aggregates, query fan-out, synthetic sizing, and limits.
- **14 October 2026 — architecture clarified:** personalised memory will move
  outside Supabase; RAG retrieves from that durable external store. Operational
  care data stays in Supabase. Vendor and migration design remain open.
- **14 October 2026 — scheduler remediation verified locally:** five-failure cap,
  permanent-error stop, increasing backoff, quiet-hour deferral, and admin review
  feedback implemented. Full suite: 818 passed, 38 skipped; 16 isolated PostgreSQL
  checks passed; TypeScript, lint, and build passed.
  [Evidence and release steps](evidence/2026-10-14-bounded-proactive-retries.md).
- **14 October 2026 — scheduler rollout complete:** migration applied;
  normal cron confirmed quiet waits add no retry events. Production candidate
  `fc4d663` is READY and public smoke passed. Next.js security updates included;
  production dependency audit reports zero vulnerabilities. Signed-in dashboard,
  persisted state after refresh, and paused scheduler panel verified. Same build
  promoted to the main domain; production public smoke and commit check passed.
- **14 October 2026 — retrieval acceptance design drafted:** scope/lifecycle
  guards, fixed context and query budgets, multilingual retrieval targets, and
  separate retrieval/generation gates now specified in the
  [first-slice design](superpowers/specs/2026-10-14-personal-memory-retrieval-design.md).
  Targets are not measured results. Provider selection and production memory
  migration remain open; implementation awaits design review.
- **15 October 2026 — Neon semantic retrieval passed:** 1,007 fictional sources,
  1,006 indexed active facts (including one expired fact excluded at search),
  30/30 questions, zero forbidden facts, warm p95 501 ms, fixture cleanup verified.
  [Evidence](evidence/2026-10-15-neon-semantic-retrieval.md).
- **Next chunk:** authenticated application memory integration and grounded reply
  evaluation. Deployment credentials, restore, retention and cutover remain gates.
  Metadata mapping and local restricted-login verification are complete. Event discovery, prompt redesign and UI improvements remain later work.
