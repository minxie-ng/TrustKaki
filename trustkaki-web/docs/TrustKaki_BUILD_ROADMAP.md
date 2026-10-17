# TrustKaki — Active Roadmap

Updated: 17 October 2026

## Current checkpoint

- **Released:** owner approved promotion of runtime commit
  `88572778d28e7eb2d899ab26c6845d4d58a63d7f` on 17 October 2026 (Singapore).
  Vercel promotion completed successfully for
  `dpl_z9yzarBvXz7jbRF8NZuycegCnfUk`. Public app: https://trustkaki.vercel.app.
- **Included:** Neon personal memory with RAG retrieval, active Jev routing and
  specialist decisions, the refreshed care dashboard/judge workspace, and
  chat-triggered government weather/air-quality advice.
- **UI correction:** empty follow-up states now reuse the active case card’s
  16px radius, full border and padding; activity button uses the standard
  rounded secondary style. Required Vercel build passed (34 seconds), promotion
  succeeded. Sidebar context now uses full-width text with actions underneath,
  wrapping metadata and rounded controls/panel. Its required Vercel build passed
  in 38 seconds and promotion succeeded. Selected setup/workspace tabs now use
  soft green shading and green text instead of curved red underlines; required
  build passed in 40 seconds and promotion succeeded. No additional testing,
  as requested.
- **Prior functionality evidence:** 1,275 local tests passed; typecheck, lint and build
  passed. Hosted Jev/refusal and accepted Neon preference check passed, with no
  Supabase personal-memory copy. Demo roster/case review and ordinary-caregiver
  API/RLS isolation passed. All temporary accounts/data removed, tokens denied.
- **Owner decision:** skip remaining browser account-switching checks and stop
  further testing. Owner then explicitly approved this exact promotion. No
  additional tests or post-promotion smoke checks were run.
- **Known limit:** the earlier memory conflict did not recur on the approved
  retry; its originating cause remains unconfirmed. Two attempts retain
  US$0.639590 reserved under the US$1 cap, not measured provider billing.
- **Outdoor advisory released:** chat-triggered outdoor conditions tool
  uses data.gov.sg 2-hour/24-hour forecasts, regional PSI and 1-hour PM2.5.
  Replies and the judge decision trail include source, area, issue time and
  forecast validity. Home area is used only when explicitly requested; otherwise
  an unknown/ambiguous area prompts clarification. Urgent, safety and care gates
  retain priority. No new agent, paid provider, database, scheduler or key.
  Current air readings are explicitly not forecasts for later/tomorrow. Regional
  air coverage is approximated from the nearest published region label; no
  street-level exposure claim. English official area names and 12 Mandarin
  aliases supported; unparsed future departure times receive no timed forecast.
  37 focused offline checks, changed-file lint, typecheck and local build passed;
  no hosted full-chat demonstration. Required Vercel build passed in 41 seconds;
  approved promotion succeeded in 3 seconds. No additional tests or smoke calls
  during release. No broad suite.
  [Feature plan](superpowers/plans/2026-10-17-environment-advisory.md).
- **Wrap-up:** approved outdoor advisory deployment and promotion complete.
  [Release evidence](evidence/2026-10-17-combined-ui-jev-candidate.md).

The entries below preserve earlier implementation checkpoints. References to
pending deployment, browser verification or promotion describe those earlier
states; the release status above supersedes them.

- **Visual refresh included in candidate:** owner-requested Manrope/DM Sans fonts,
  forest-green primary buttons, sage identity panels, softer borders and rounded
  surfaces supersede the first pass's visual tokens. Font-variable root scope is
  corrected. Desktop/mobile fixture inspection passed; public promotion remains pending.
  See the visual refresh section in the implementation evidence below.

- **UI revamp implemented locally:** narrower senior roster, focused identity and
  case, prominent next human action, compact sourced personal context and a
  separate demo-admin judge workspace. The judge view shows actual request
  retrieval, Jev requested/executed specialists, model/fallback, policy and save
  outcome. No scripted success after a failed chat request. 1,270 tests passed,
  38 skipped; typecheck, lint and build passed. Desktop/mobile local fixture
  inspection and independent review completed. First pass was local at this checkpoint; now superseded by the combined candidate above.
  [Approved design](superpowers/specs/2026-10-17-priority-first-ui-revamp.md) ·
  [Implementation evidence](evidence/2026-10-17-care-desk-ui-revamp.md).
  **Next:** verify the combined candidate and remaining hosted preference example, then promote
  after the required release checks and owner approval.

- **Live:** Neon personal memory and consolidated agent flow `410b6ef`.
  [Memory cutover](evidence/2026-10-15-neon-memory-cutover.md) and
  [agent release](evidence/2026-10-16-agent-candidate.md).
- **Earlier hosted inference candidate:** timing persistence correction `21f4152` is READY
  at https://trustkaki-72gigstgp-minxie-ngs-projects.vercel.app. Exact metadata,
  28-second remote build, protected smoke and both hosted chat requests passed
  HTTP 200. Actual active Jev routing and social refusal classification ran
  without fallback; four messages and Jev traces persisted with integer timings.
  Public domain remains on `410b6ef`; no promotion yet.
- **Remaining memory example:** the refusal/preference proposal was rejected as
  unsupported evidence, so the combined acceptance check is not fully passed.
  Its extracted category was communication_preference; the local validator
  omitted “chats” from communication vocabulary. A narrow fix plus regression
  now passes (67 focused tests and typecheck); independent review found no
  blockers. The final UI candidate progressed to a memory-write conflict instead;
  see the current checkpoint above. No unsupported memory was saved.
- **Cleanup and budget:** all temporary accounts, scoped Supabase/Neon records
  and restricted responses/credentials are removed. The diagnostic US$1 budget
  retains US$0.959385 across its failed attempt and two corrected-build attempts.
  Earlier b4174ff retains its separate US$0.319795 reservation. Amounts are
  conservative reservations, not measured provider bills.
  [Hosted inference procedure](operations/2026-10-17-hosted-jev-inference-check.md).
  [Current candidate and earlier failures](evidence/2026-10-17-jev-active-hosted-candidate.md).

- **Local shadow integration prepared:** independently disabled by default;
  observes six Jev routing labels in parallel with Triage and appends a comparison
  trace. Existing routing, replies, safety and memory proposals retain authority.
  [Runtime evidence](evidence/2026-10-16-jev-routing-shadow-runtime.md).
- **Full-chat evaluation complete:** six fictional
  scenarios, 12 flows, 30 provider calls, US$0.006153858 successful-call cost;
  no errors, retries, database access or writes. Both unavailable-memory replies
  failed to acknowledge missing context; one grounded reply offered unsupported
  breakfast preparation. [Results and limits](evidence/2026-10-16-jev-whole-flow-results.md).
- **Reply corrections verified locally:** missing-memory preference recall now
  acknowledges unavailable evidence; bounded meal-offer removal preserves
  grounded content and informational help; detected care needs retain a useful
  clarification question. Full suite: 1,179 passed, 38 skipped;
  typecheck/lint/build passed. Independent review addressed the tested edge cases.
  Not deployed or re-evaluated with paid models.
  [Corrections and limits](evidence/2026-10-16-chat-reply-corrections.md).
- **Approved Jev routing implemented locally:** Jev can add real specialist
  invocations; independent safety triggers, care interpretation and memory
  validation retain their roles. Active mode remains disabled by default.
  Full suite: 1,210 passed, 38 skipped; typecheck/lint/build passed; independent
  review found no blocking issues.
  [Runtime behavior and evidence](evidence/2026-10-16-jev-specialist-routing-runtime.md).
- **Active evaluation prepared:** ten fictional scenarios, baseline/active pairs,
  20 flows and at most 110 provider attempts. Worst-case reservation US$0.88409
  under a separate US$1 cap. Mocked failure/budget/isolation checks and independent
  review passed. [Protocol and checks](evidence/2026-10-16-jev-active-evaluation-preparation.md).
  **Active run attempted with owner approval:** first OpenAI response failed
  validation; the separately approved retry also stopped at Triage output schema
  validation. Two total attempts, zero completed flows, no Jev requests and
  US$0.004448 retained reservation (not confirmed billing). Both ledgers preserved.
  [Failure evidence](evidence/2026-10-16-jev-active-evaluation-stopped.md).
  **Single diagnostic complete:** a third request identified invalid enum value at
  `signals[1].type`. Cumulative reservation US$0.006672; diagnostic token cost
  approximately US$0.00038115. Broad type enum and urgent multi-signal example
  clarified locally; full suite1,227 passed/38 skipped, typecheck/lint/build passed.
  Independent review found no blockers. Prompt change has not been tested live.
  **Active comparison attempted after correction:** three flows completed before
  Jev response validation failed on mixed care/preference. The urgent pair passed
  with the same policy response; Jev added no specialist in that pair. Mixed
  baseline asked about immediate help and preserved preference proposals, but
  omitted the missed-meal daily-living signal.15 cumulative attempts; reservation
  US$0.047590. No automatic retry or production change.
  [Partial results and limits](evidence/2026-10-16-jev-active-partial-results.md).
  **Follow-up locally verified:** explicit mixed-care extraction instructions and
  a new missed-meal failure screen;1,235 tests passed, typecheck/lint/build passed.
  One focused Jev diagnostic returned a schema-valid response; earlier failure
  did not reproduce and its exact cause remains unknown.16 cumulative attempts,
  US$0.058601 reservation. No deployment or broader reliability claim.
  [Follow-up evidence](evidence/2026-10-16-care-and-jev-follow-up.md).
  **Coverage complete; reply corrections verified locally:** all20 flows finished,
  49 new requests, zero invalid outputs/fallbacks. Active routing failed two
  automated reply checks; manual review found a third recipe-answer loss.
  Local regressions now preserve clarification, refusal and recipe replies;
  independent review found no blockers.1,247 tests passed,38 skipped;
  typecheck/lint/build passed. Jev-only contextual social work was demonstrated;
  this sample does not show overall superiority or whole-flow savings.
  **Next chunk:** candidate deployment and authenticated access checks passed
  on `b4174ff`, but the hosted inference attempt returned HTTP 500. The
  stage diagnostics `3759e42` have now passed deployment and read-only smoke.
  Its signed-in demo dashboard passed; the diagnostic retry located the failing
  agent-run upsert and exposed fractional timings against an integer column.
  Both hosted chat requests now persist successfully with the rounding correction.
  Move to UI; batch the remaining chat-preference confirmation into final release.
  [Completed coverage and corrections](evidence/2026-10-16-jev-final-coverage.md).
  The completed 36-message screen matched all six labels on 24/36 Jev
  cases versus 21/36 current Triage cases; Jev missed no labelled positives but
  overclassified nine flags and handled ambiguity imperfectly. This supports
  further evaluation, not a production replacement or whole-flow savings claim.
  [Complete screening evidence](evidence/2026-10-16-jev-routing-results.md).
  Six independent judgments preserve mixed intents; conversational models
  still supply replies and policy retains authority.
  [Design and boundaries](superpowers/specs/2026-10-16-jev-routing-shadow-design.md).
- **Evidence so far:** earlier social-intent pilot had 18/18 held-out results for
  both Jev and GPT-4o-mini, with lower measured Jev endpoint cost/latency. This
  does not establish broader routing quality or whole-flow savings.
  [Pilot](agents/2026-10-16-jev-social-intent-pilot.md).
- **After local UI implementation:** final hosted release checkpoint. Independent
  backups and broader historical-copy checks remain pre-pilot work.

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
- [x] Rehearse recovery into an isolated historical Neon branch: 4 facts, 4 revisions,
  7 receipts and 3 current vectors recovered; RLS/scoped retrieval pass; production
  unchanged and test branches removed. Current Free history window: six hours.
  [Recovery evidence](evidence/2026-10-15-memory-recovery-retention.md).
- [x] Prepare immediate legacy-copy cleanup, as requested: 5 frozen Supabase personal
  rows and 4 related audit snapshots/reason/key text; exact allowlist/change guards,
  transaction rollback and preservation checks prepared outside active migrations.
  Three PGlite tests pass. [Applied migration](../supabase/migrations/20261015071528_purge_legacy_personal_memory_copies.sql).
- [x] Owner approved execution; migration `20261015071528` applied. Verified zero
  legacy personal rows, four scrubbed audit events, operational route preserved,
  both guards enabled, unchanged Neon fingerprints and production public smoke.
- [ ] Before real-user use: independent backup recovery, post-restore erasure replay
  and recovery objectives beyond the current history window.
- [ ] Review the unchanged Supabase security-advisor findings recorded after cleanup
  (definer execution grants/search paths, service-only RLS tables and Auth password
  protection); distinguish intended RPC access from unintended grants.
  [Advisor evidence](evidence/2026-10-15-memory-recovery-retention.md).
- [x] Review three migrated active facts with the project owner; retain them as
  fictional demo context using authenticated corrections. Verify three manual
  confirmations, three current embeddings and three explicit fictional audit reasons.
  [Review evidence](evidence/2026-10-15-demo-memory-confirmation.md).

Earlier growth subchunk: scheduler retry cap and quiet-hour retry fix are deployed
and verified; broader retention/pagination work remains open.

Shared AAC/service/digital-safety knowledge is a separate retrieval scope. Add
only when needed, with maintained sources, dates, and update ownership.

### 3. Agent responsibilities, prompts, and handoffs

- [x] Audit existing roles, actual inputs/outputs, triggers, authority, uncertainty
  and handoffs. Six LLM roles plus deterministic Policy/Pattern Watch; no new agent.
  [Audit and proposed contracts](agents/2026-10-15-agent-audit-proposal.md).
  82 focused tests and 42 offline benchmark cases pass; no live model run.
- [x] Locally remove the main-flow LLM router and merge social suggestions into
  Triage. Three generative tasks (conversation, conditional memory extraction,
  conditional briefing) plus conditional Digital Safety. One reply selected after
  policy; standalone AAC endpoint retained for compatibility. Promoted 16 October.
- [x] Before production promotion: bounded live comparison of routing, grounded
  responses and refusal handling; no claim of model-quality parity from mocks.
  [Local implementation evidence](evidence/2026-10-15-agent-consolidation.md).
  [Live comparison](evidence/2026-10-15-agent-live-comparison.md) completed:
  26 paired fictional cases, corrected full rerun and five capability follow-ups;
  US$0.04385 estimated total charge. Fewer calls and one reply per turn observed.
  Initial NO-GO for unconfirmed Mandarin memory promises resolved by deterministic
  pending-state acknowledgements. [Correction](evidence/2026-10-15-capability-replies.md):
  12 affected live scenarios plus one relay follow-up, no latest observed failures;
  final local validation 1,065 passed, 38 skipped, typecheck/lint/build passed.
  Exact candidate deployed, signed-in demo-admin and ordinary-caregiver checks
  passed, fixtures removed, then promoted with production smoke passing on
  16 October. [Release evidence](evidence/2026-10-16-agent-candidate.md).
- [ ] Evaluate Jev as an optional bounded classification experiment against Triage
  and simple rules on fictional English/Mandarin/Singlish cases. Shadow first; no
  policy, memory-write or outreach authority. Laya is a self-hosted alternative,
  with model-card limitations recorded in the audit; neither is integrated.
- [x] Locally rewrite retained-role prompts; distinguish quoted/retrieved data
  from instructions. Require factual grounding and respectful, concise language.
- [x] Locally remove invented fallback invitations/contacts/save claims, fix the
  Unicode memory exclusion gate with representative Mandarin durable cues and
  sensitive-data exclusions; supply final policy risk/assessment status to Briefing.
  Reject briefings whose risk field conflicts with final policy.
- [ ] Further minimise role-relevant input context and repeated grounding text;
  audit correction: AAC Nudge already received known context and RAG.
- [x] Locally select one senior reply after policy; urgent health guidance takes
  priority, then relevant safety guidance, then the primary conversation draft.
  Preserve messaging/persistence regression tests. Semantic quality still needs live evaluation.
- [ ] Compare revised roles/prompts against the same evaluation set. Record
  routing, schema validity, groundedness, safety, latency, and cost regressions.

Done when: contracts and prompts agree with actual inputs; evaluation thresholds
pass; replies remain grounded under missing/conflicting context. Add an agent
only when an evaluated gap warrants its extra calls, latency, and complexity.
Retrieval itself can remain ordinary application code.

### Proposed extension: verified community-event discovery

Capture nearby AAC/community events from a verified source, match interests and
practical constraints, and offer an optional suggestion through the conversation
role's social-support capability.
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
- **15 October 2026 — live agent comparison complete, release blocked:** baseline,
  initial candidate, corrected 26-case run and five follow-ups recorded. Final
  local validation: 1,042 passed, 38 skipped; typecheck/lint/build passed. Resolve
  capability/persistence promises before a release request. Production memory
  remains live; event discovery, optional Jev evaluation and UI remain later work.
- **15 October 2026 — capability blocker resolved locally:** server-owned replies
  prevent pending-memory and recognised unsupported-action promises. Independent
  review and focused live follow-ups passed; total comparison estimate US$0.04958.
  Runtime `2a70f29` is ready for candidate deployment approval; production unchanged.
