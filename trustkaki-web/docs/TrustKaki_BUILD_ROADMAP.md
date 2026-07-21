# TrustKaki — Build Roadmap and Product North Star

## 1. Project Purpose

TrustKaki is a proactive AI companion for isolated seniors in Singapore.

TrustKaki is not another senior chatbot or check-in summary tool. It is a
pattern-aware last-mile engagement layer that turns quiet daily changes into
concrete human follow-up actions for Singapore caregiver and Active Ageing
Centre (AAC) workflows.

TrustKaki builds a context model of each senior and uses AI agents to turn
daily interactions into personalised engagement and actionable human
follow-up.

It should help seniors age with greater safety, independence, dignity, routine, and social connection by:

- checking in proactively
- detecting soft risk signals from natural conversation
- detecting small changes and patterns over time
- responding with appropriate, non-judgmental support
- identifying suspicious digital messages or scams
- encouraging connection with caregivers, family, or Active Ageing Centres (AACs)
- briefing humans when follow-up is useful

This project is being built for the SMU AI Club × Tencent Cloud “AI CAN DO IT / Age Well” hackathon, AI Agent / Skills Track.

The product moat is not the claim that only TrustKaki can recognise patterns.
Existing AI eldercare systems validate that the problem is real. TrustKaki's
focus is pattern-to-action: combining daily living, frailty/mobility, social
hesitation, non-response, digital safety, and personal memory, then converting
those signals into a clear next human action for caregivers or AAC volunteers.

## 2. Final Product Standard

TrustKaki must be a real working product, not only a scripted prototype.

The final submission should support:

- real WhatsApp inbound and outbound messaging
- real multi-agent orchestration
- real LLM calls
- persistent senior and conversation state
- personal senior memory and health/body-condition context
- pattern detection over time, not only single-message keyword detection
- Pattern Watch items that explain evidence, risk movement, confidence, and next human action
- scheduled proactive check-ins
- real risk and signal detection
- caregiver/AAC alerts and briefings
- a live dashboard backed by stored data
- visible agent traces from actual agent runs
- deployment to a public environment

Simulation is allowed only for demo convenience, such as:

- a seeded demo senior
- a “Run Check-in Now” button
- a reset-demo button
- sample caregiver/AAC accounts

Core reasoning, routing, persistence, memory, pattern detection, messaging, and briefing must be real.

## 3. Source of Truth

The only active codebase is:

`/Users/ngminxie/Documents/SMU/Hackathons:Events/2026/Tencent Age Well Hackathon/trustkaki-web`

Do not use, compare against, or revive earlier drafts.

Major product decisions must be discussed in the TrustKaki HQ chat before implementation.

This build chat should focus on architecture, code structure, prompts, schemas, APIs, agent orchestration, Supabase, WhatsApp, scheduler, deployment, debugging, and testing.

## 4. Core Demo Scenario

1. The demo starts with Uncle Tan's manually curated Senior Care Context
   Profile: preferred language and tone, known knee discomfort, morning reply
   routine, social preferences, and trusted support contacts.
2. TrustKaki runs a context-aware morning check-in using only the relevant,
   safe subset of that profile.
3. Uncle Tan replies: “Not hungry today. Knee pain.”
4. The Triage Agent compares the message with his usual routine and detects
   `daily_living` and `health_frailty_signal`.
5. Uncle Tan later resists an AAC suggestion with: “Don’t want. Paiseh.” The
   AAC Nudge Agent offers a low-pressure one-to-one alternative.
6. Uncle Tan shares a suspicious SingPost SMS. The Digital Safety Agent
   analyses it and advises him safely.
7. Uncle Tan misses his usual morning reply the next day.
8. Deterministic Pattern Watch compares recent signals with his routine
   baseline and detects a possible routine + mobility + social withdrawal
   pattern.
9. The Briefing Agent separates observed facts, relevant context, and the
   suggested human action.
10. Today's Follow-up Queue shows one consolidated case recommending that Mei
    Ling try a one-to-one lift-lobby check-in instead of a group invitation.
11. A caregiver records the outcome and resolves the active case while the
    action history and underlying policy evidence remain available.

## 5. Target Architecture

```text
Senior Care Context Profile
+ Recent Messages
+ Detected Signals
+ Routine Baselines
+ Personal Memories
        ↓
Context Assembler
        ↓
Multi-agent Orchestrator
        ↓
Relevant Specialist Agent(s)
        ↓
Deterministic Policy + Pattern Watch
        ↓
State Update / Personalised Reply / Human Recommendation
        ↓
Supabase Persistence
        ↓
Today's Follow-up Queue and Caregiver/AAC Workspace
```

The Senior Care Context Profile is a logical product view, not a separate
"Relationship Layer" and not one unbounded profile blob. The server-side
Context Assembler selects the minimum relevant, authorised, active, and
non-expired context from normalized records before an agent runs. It is a
deterministic composition responsibility, not another LLM agent.

Keep these concepts separate:

1. **Senior Care Context Profile** — stable, caregiver-confirmed information
   such as language, communication style, support network, social preferences,
   routine baseline, and non-diagnostic body-condition context.
2. **Personal Memories** — bounded details learned over time that can make a
   future interaction more familiar or timely.
3. **Signals** — observed events such as skipped breakfast, no reply, pain, or
   declining an activity.
4. **Pattern Watch** — deterministic interpretation of signals over time
   against the senior's normal routine.

## 6. Agent Responsibilities

### Context Assembler (deterministic service)

- authorize the senior and requesting workflow
- retrieve only relevant, active, non-expired context
- keep stable profile context, personal memories, recent signals, and routine
  baselines source-labelled and distinct
- enforce bounded item counts and safe-use restrictions before agent input
- provide the same factual context package to downstream agents without making
  an independent risk decision

### Check-in Agent

- use preferred tone and language
- select only relevant recent memories and non-diagnostic health context
- refer naturally to prior context without exposing private profile data
- ask one clear, low-burden question
- preserve the existing deterministic schedule, retry, and non-response policy

### Orchestrator Agent

- inspect an event or incoming message
- receive a bounded context package assembled server-side
- decide which specialist agent should run
- avoid unnecessary agent calls
- return a structured execution plan

### Triage Agent

- detect soft risk signals
- classify the message
- compare the current message with normal routine, recent signals, and relevant
  non-diagnostic health context
- answer whether the event is unusual for this senior without presenting that
  comparison as a diagnosis
- assess current risk
- recommend the next action

Example output:

```json
{
  "signals": ["daily_living", "health_frailty_signal"],
  "risk_level": "yellow",
  "confidence": 0.88,
  "recommended_action": "gentle_follow_up",
  "human_follow_up": false
}
```

### AAC Nudge Agent

- respond to reluctance, embarrassment, or social withdrawal
- use relevant social preferences, previous activity responses, and trusted
  human contacts
- avoid guilt, pressure, or infantilising language
- offer low-friction alternatives
- preserve senior autonomy

### Digital Safety Agent

- analyse suspicious SMS or message content
- detect likely scam patterns
- advise the senior not to click, pay, or share credentials
- recommend verification through an official channel
- escalate when money loss or account compromise may have occurred

### Briefing Agent

- present observed facts: what happened
- present relevant context: why it may matter for this senior
- distinguish facts, known context, and AI-generated interpretation
- highlight risk changes
- recommend one clear next human action and the appropriate trusted contact
- avoid overwhelming the human reader

### Pattern Watch

Pattern Watch is a final-product must-have. TrustKaki must detect patterns over
time, not only classify one message at a time.

Weak version:

```text
"knee pain" → health issue
```

TrustKaki version:

```text
skipped breakfast + knee pain + avoiding downstairs + paiseh + unusual non-response
→ possible routine/mobility/social withdrawal pattern
```

Pattern Watch should produce structured observations with:

- `pattern_type`
- `evidence`
- `risk_movement`
- `confidence`
- `suggested_human_action`
- `human_follow_up_recommended`

Pattern Watch remains deterministic policy-authoritative logic. Agent-generated
language may explain its result, but must not invent a pattern or override the
stored routine comparison.

Example:

```text
Pattern detected: possible routine + mobility + social withdrawal pattern.
Evidence:
- reduced appetite
- knee pain
- declined AAC kopi chat due to paiseh
- missed usual morning reply

Suggested human action:
- Mei Ling should try a 1-to-1 lift lobby check-in instead of inviting Uncle Tan to a group event.
```

## 7. Real Multi-Agent Standard

The system counts as genuinely multi-agent only when:

- each agent has a distinct role
- each agent has a separate prompt
- each agent has a typed input contract
- each agent has a typed output contract
- the orchestrator decides which agent to invoke
- agents are invoked conditionally
- outputs are validated
- agent runs are logged
- state changes happen from real outputs
- traces reflect actual execution

Hardcoded labels or prewritten scripts do not count as a real multi-agent system.

## 8. Minimum Supabase Tables

Supabase is the memory warehouse. LLM agents interpret stored memory and signals;
deterministic rules/scoring provide safety guardrails. Supabase alone is not
pattern recognition. Pattern recognition should use structured database counts
over recent history, baseline comparison, rule-based thresholds, and LLM
interpretation for human-friendly explanation.

Do not add vector database infrastructure for the MVP/hackathon build.
Structured Supabase memory is enough for the current product target.

Event memory tables:

- `seniors`
- `caregivers`
- `senior_caregivers`
- `messages`
- `check_ins`
- `detected_signals`
- `risk_events`
- `agent_runs`
- `alerts`
- `briefs`
- `scheduled_jobs`

Existing context and pattern foundations:

- `senior_memories`
- `routine_baselines`
- `senior_health_contexts`
- `patterns`
- `caregiver_queue_items`

### Database schema direction

Do not add a duplicate `senior_care_context_profiles` table solely to match the
product label. Assemble the Senior Care Context Profile from normalized sources:

- `seniors` for identity and basic information
- `senior_caregivers`, contact-plan records, and organisation assignments for
  the support network and preferred human contact
- `routine_baselines` for normal response, meal, mobility, participation, and
  social-comfort patterns
- `senior_health_contexts` for explicitly known, non-diagnostic body-condition
  context
- `senior_memories` for bounded communication, family, food, routine, and AAC
  preferences learned over time
- `messages` and `detected_signals` for recent observations
- `patterns` for Pattern Watch outputs
- `caregiver_queue_items` for consolidated human follow-up work

Basic profile fields such as birthday, preferred language, and communication
style may be added to the appropriate stable senior/profile record when the
care workflow needs them. Support-network relationships remain normalized and
authorised; they are not a separate product layer.

For the hackathon, seed a manually curated Uncle Tan profile and prove bounded
context retrieval into the existing agents. Do not add a vector database,
knowledge graph, complex relationship model, or open-ended memory mining
system. Preserve the existing Gate 5 allowlisted, evidence-bound context
capture rather than expanding it into autonomous free-form extraction.

Suggested fields for `senior_memories`:

- `id`
- `senior_id`
- `memory_type`
- `content`
- `source_message_id`
- `importance`
- `remembered_at`
- `follow_up_after`
- `expires_at`
- `safe_use_notes`

Suggested fields for health/body-condition context:

- `id`
- `senior_id`
- `condition_type`
- `body_area`
- `description`
- `severity_if_known`
- `source`
- `first_observed_at`
- `last_observed_at`
- `status`
- `safe_use_notes`

Suggested fields for Pattern Watch:

- `id`
- `senior_id`
- `pattern_type`
- `evidence_json`
- `risk_movement`
- `confidence`
- `suggested_human_action`
- `human_follow_up_recommended`
- `created_at`
- `resolved_at`

## 8A. Senior Care Context Profile

The profile should answer four practical questions before TrustKaki responds or
recommends action:

- Who is this senior and how should TrustKaki communicate with them?
- What is normal for them?
- Who supports them and who should be involved when needed?
- What recent change is unusual enough to matter?

The logical profile has four bounded context groups.

### A. Basic and Support Context

- name, age, birthday when useful, and preferred language
- warm, respectful, simple communication style
- family, caregiver, and AAC support network
- preferred human contact and relationship to the senior

### B. Social and Communication Preferences

- interests such as kopi, gardening, or familiar conversation topics
- dislikes and pressure sensitivities
- preferred one-to-one or group engagement style
- previous responses to activity suggestions

### C. Routine Baseline

- preferred language
- usual reply time
- usual meal time
- usual activity level
- usual social comfort level

### D. Non-Diagnostic Health and Body-Condition Context

- recurring knee discomfort
- mobility difficulty
- poor eyesight or hearing difficulty
- other explicitly known context that helps form a safe follow-up question

Personal memories, signals, and Pattern Watch outputs remain separate stores.
They may be selected by the Context Assembler, but they are not merged into the
stable profile.

### Personal Memory

- personal facts
- food/items from family
- preferences
- body-condition context
- recurring concerns
- follow-up reminders
- safe-use notes

Personal senior memory should make TrustKaki feel non-generic. The product
should remember details that are useful for future check-ins, such as:

- Rachel bought Uncle Tan pineapple cakes from China
- the expiry date is 20 July
- ask later whether he tried them
- remind him gently to check expiry
- Uncle Tan likes kopi
- Uncle Tan feels paiseh joining group activities
- Uncle Tan responds better to Mei Ling than unfamiliar volunteers

This is conceptually like a `user.md` memory profile, but it must be stored in
Supabase rather than as a literal markdown file.

Health/body-condition context can include explicitly known or observed context,
such as:

- knee pain
- weak legs
- dizziness history
- diabetes, high blood pressure, poor eyesight, hearing difficulty, mobility limitations, if explicitly known
- body areas that often cause difficulty, such as knee, back, eyes, or legs

Health context is for personalisation and safe follow-up only. TrustKaki may say:

```text
Yesterday you said your knee was painful. Is it better today?
```

```text
Since your knee has been bothering you, maybe don't force yourself to exercise today. If you go downstairs, Mei Ling can meet you at the lift.
```

TrustKaki must not diagnose, prescribe, or say a food is medically safe unless
verified. It may remind seniors to check expiry dates, follow existing doctor
instructions, and ask a caregiver or doctor if unsure.

Use wording such as "health context" or "body-condition context", not
"diagnosis memory".

## 9. Target API Structure

```text
/api/whatsapp/webhook
/api/whatsapp/send
/api/check-ins/run
/api/agents/orchestrate
/api/agents/triage
/api/agents/aac-nudge
/api/agents/digital-safety
/api/agents/briefing
/api/dashboard/seniors
/api/dashboard/alerts
/api/dashboard/briefs
/api/demo/reset
```

The UI must not contain the core decision logic.

## 10. Shared Agent Runner

All agents should use one shared runner that provides:

- provider abstraction
- prompt loading
- structured output
- Zod validation
- timeout handling
- retry handling
- safe fallback
- trace ID generation
- latency tracking
- model metadata
- persistence to `agent_runs`
- error logging

Suggested structure:

```text
src/
  lib/
    agents/
      runner.ts
      provider.ts
      schemas.ts
      prompts/
        orchestrator.ts
        triage.ts
        aac-nudge.ts
        digital-safety.ts
        briefing.ts
```

## 11. Messaging Transport Strategy

WhatsApp remains TrustKaki's preferred production channel because it is the
most familiar messaging surface for the intended Singapore senior and caregiver
audience. The care workflow itself must remain transport-independent: channel
adapters deliver messages into the same orchestration, deterministic policy,
persistence, Pattern Watch, and caregiver queue.

Telegram is the current live demonstration transport. It is a continuity
fallback while Meta resolves an external Business Manager/WABA security lock.
Telegram must not replace, remove, or fork the existing WhatsApp care logic.

### 11.1 WhatsApp Integration

Target integration:

- Meta WhatsApp Cloud API
- webhook verification route
- inbound message parsing
- outbound text messaging
- message ID tracking
- deduplication
- token verification
- environment-based secrets
- durable webhook inbox for retry-safe asynchronous processing
- protected internal processor endpoint for manual recovery and future cron

Flow:

```text
WhatsApp message
→ webhook
→ verify signature
→ durably accept webhook event
→ return 200
→ asynchronous processor
→ store conversation message
→ orchestrator
→ specialist agent
→ state update
→ send reply
→ log agent run
→ update dashboard
```

Meta-generated temporary WhatsApp access tokens are development-only. Any
deployed/live setup must keep WhatsApp credentials server-side and use an
appropriate durable Meta credential.

The WhatsApp-style web UI remains useful as a testing interface, demo fallback, and developer console, but it must not be the only messaging channel in the final product.

### 11.2 Telegram Live Demo Adapter

Implement Telegram in bounded stages rather than as one broad channel rewrite:

1. **Transport boundary audit**
   - identify the smallest reusable inbound envelope and outbound sender boundary
   - retain WhatsApp-specific parsing, signature verification, statuses, and inbox
   - define Telegram webhook, identity mapping, deduplication, and reply contracts
2. **Secure webhook intake**
   - verify Telegram's webhook secret header
   - parse text updates and safely ignore unsupported updates
   - deduplicate by Telegram update/message identity
   - return promptly without exposing internal failures or secrets
3. **Real care workflow connection**
   - map a configured Telegram user/chat to an authorised senior
   - run the existing orchestrator and deterministic policy unchanged
   - persist messages, agent runs, signals, risk, alerts, briefings, and provenance
   - send one selected senior-facing reply through Telegram
4. **Live verification and judge readiness**
   - prove one real inbound-to-policy-to-reply Telegram path
   - prove duplicate delivery does not rerun agents or duplicate persistence
   - show the same resulting state in the caregiver dashboard
   - retain evidence that WhatsApp previously passed a real live path

Telegram limitations must remain explicit: it is a demo continuity channel, it
does not provide the same Singapore senior adoption fit as WhatsApp, and its
delivery semantics must not be presented as WhatsApp delivery/read receipts.

## 12. Scheduler

The system needs real scheduled check-ins.

Minimum capability:

- one configured morning check-in
- trigger an outbound WhatsApp message
- avoid duplicate sends
- record the check-in event
- update status when the senior replies

Possible scheduler options:

- EdgeOne scheduled function
- Vercel Cron
- Supabase scheduled Edge Function
- another reliable cron-compatible service

## 13. Dashboard

The dashboard homepage should be Today's Follow-up Queue. TrustKaki is not only
a senior chatbot; it helps AAC staff and caregivers allocate limited human
attention.

Today's Follow-up Queue should show:

- senior
- current risk level
- why now
- Pattern Watch evidence
- suggested human action
- assigned caregiver/AAC volunteer
- status: `pending | acknowledged | followed_up | resolved`
- last updated time

This queue should appear before the detailed senior view. The detailed senior
view remains available for deeper review after a staff member chooses an item
from the queue.

The detailed caregiver/AAC dashboard should display live stored data:

- concise Senior Care Context Profile
- latest risk level
- Pattern Watch items
- recent messages
- detected signals
- unresolved alerts
- current briefing
- recommended human action
- actual agent trace

Agent traces should be available in a separate Judge View or technical panel.

Operational success metrics:

- number of useful follow-up recommendations
- staff/volunteer acknowledgement rate
- follow-up completion rate
- alert usefulness rating
- false alarm / alert fatigue rate
- time from first pattern detection to human follow-up

## 13A. Language Preference

Add simple language preference now. Full multilingual voice/dialect support can
come later.

The MVP senior profile should support:

- `preferred_language`: `english | mandarin | mixed`
- `tone_style`: `simple | warm_singlish | respectful_chinese`

Example mixed message:

```text
Uncle Tan 早安 😊 吃早餐了吗？昨天你说膝盖痛，今天好一点吗？
```

Avoid stereotyped or excessive Singlish. Tone should stay warm, respectful, and
plain.

## 13B. Why TrustKaki Is Different From NANA / Existing AI Check-In Tools

Existing AI check-in systems validate the need. TrustKaki does not claim to be
the only system capable of pattern recognition.

**Positioning:** TrustKaki builds a context model of each senior and uses AI
agents to turn daily interactions into personalised engagement and actionable
human follow-up.

TrustKaki focuses on context-aware pattern-to-action:

- understands what is normal and what communication approach works for each
  senior
- detects quiet daily changes over time
- compares current events with routine baselines and relevant known context
- connects them to Singapore AAC/caregiver workflows
- recommends the next best human action
- keeps humans in the loop
- shows risk movement and agent traces transparently

This differs from a generic companion chatbot, which may respond warmly without
tracking operational follow-up, and from an alert-only system, which may flag an
event without knowing whether it is unusual for that senior. TrustKaki does not
replace human relationships; it helps the right human notice and act earlier.

TrustKaki could complement voice agents like NANA and care-coordination products
such as CareKampung as the context, pattern, and action layer behind proactive
senior engagement.

## 14. Safety Boundaries

TrustKaki is not a medical diagnosis system.

It should:

- detect possible signals
- use health context only for personalisation and safe follow-up
- encourage appropriate follow-up
- escalate urgent situations
- preserve senior autonomy
- avoid pretending certainty
- distinguish observed facts from inference
- use visible traces to show concise decision summaries and state changes

It must not:

- diagnose illness
- prescribe treatment
- claim guaranteed scam detection
- replace emergency services
- say a food is medically safe unless verified
- shame or pressure seniors
- infantilise seniors
- expose private data unnecessarily
- automatically contact humans for every low-risk message
- reveal private chain-of-thought

High-risk or uncertain situations should escalate to a human. Personal and
health-context data should be minimised in the UI and shared only where useful
for follow-up.

Visible traces should show concise decision summaries, tool calls, inputs,
outputs, and state changes, not hidden chain-of-thought.

## 15. Delivery Phases

### Phase 0 — Current Shell
- Next.js app exists
- demo chat exists
- dashboard exists
- trace panel exists
- local build works

### Phase 1 — Real Agent Foundation
- typed contracts
- shared runner
- provider abstraction
- prompts
- Zod validation
- API routes
- real LLM calls
- error handling
- real traces

Exit criteria:
- free-text input reaches the real Triage Agent
- structured output is validated
- no hardcoded classification for the main path
- current UI calls the real API

### Phase 2 — Supabase Persistence
- schema
- migrations
- seed data
- database client
- repositories/services
- agent-run logging
- messages
- risk events
- alerts
- briefs

Exit criteria:
- refresh does not erase state
- dashboard reads from Supabase
- agent runs are auditable
- live database writes and reads are verified against the configured TrustKaki Supabase project

### Phase 3 — Senior Memory and Health Context
- `senior_memories`
- routine/baseline profile fields
- health/body-condition context
- safe-use notes
- memory extraction from check-ins
- memory-aware check-in replies

Exit criteria:
- TrustKaki can remember useful personal details
- TrustKaki can use health/body-condition context safely without diagnosing
- check-in replies can refer to relevant memory when helpful
- memory entries are stored in Supabase and auditable

### Phase 4 — Pattern Watch
- structured pattern observations
- baseline comparison
- recent-history signal counts
- rule-based thresholds
- LLM explanation for human-friendly summaries
- dashboard Pattern Watch surface

Exit criteria:
- TrustKaki detects patterns over time, not only one-message concerns
- Pattern Watch includes evidence, risk movement, confidence, and suggested human action
- caregiver/AAC follow-up recommendation is explicit

### Phase 5 — Real WhatsApp
- Meta app setup
- webhook verification
- inbound message handler
- outbound send service
- message deduplication
- test phone integration

Exit criteria:
- a real WhatsApp message reaches TrustKaki
- TrustKaki replies through WhatsApp
- dashboard updates from that message

### Phase 6 — Scheduler
- recurring morning check-in
- one-click demo trigger
- duplicate protection
- response tracking

Exit criteria:
- a scheduled check-in sends without manual input
- status updates after reply

### Phase 7 — Human Escalation
- alert thresholds
- caregiver/AAC brief generation
- acknowledgement flow
- notification strategy

Exit criteria:
- Yellow and Red cases produce appropriate human actions
- low-risk cases do not cause alert fatigue

### Phase 8 — UI and Accessibility Polish
- mobile senior view
- readable text
- multilingual readiness
- calmer dashboard
- loading/error states
- Judge View
- demo reset

### Phase 9 — Deployment and Submission
- hosted frontend/backend
- environment variables
- production database
- scheduler
- WhatsApp webhook URL
- monitoring
- fallback demo mode
- README
- architecture documentation

## 16. Production Roadmap From Deployed Baseline

TrustKaki is deployed as a product candidate, but deployment does not imply
production readiness. An independent audit identified authorization, RLS,
transaction, timeout, test-evidence, and maintainability blockers. Gate 0
remediation and its focused re-audit are complete. Product development now
continues through the remaining gates in order.

The detailed approved gate design is:

`docs/superpowers/specs/2026-07-13-production-release-gates-design.md`

### Current deployed baseline

Implemented and deployed:

1. Real Next.js/Vercel production deployment.
2. Supabase persistence for messages, check-ins, signals, risk events, agent runs, alerts, briefs, Pattern Watch, queue items, and caregiver actions.
3. Supabase Auth sign-in with caregiver identity linked through `caregivers.auth_user_id`.
4. Demo-admin role gating through trusted `app_metadata.role = demo_admin`.
5. Authentication guards, authoritative senior binding, caregiver-scoped API
   routes, and two-user database isolation proof.
6. Deterministic policy layer for final risk and alerts.
7. Real multi-agent orchestration with typed schemas and persisted traces.
8. Pattern Watch and consolidated caregiver follow-up queue.
9. Judge View / Quick Demo flow.
10. Meta WhatsApp Cloud API webhook, sender, durable inbox, and protected retry processor foundation.
11. Production health check.
12. Caregiver-readable navigation and TrustKaki Reasoning panel.

### Production-grade pillars

TrustKaki must become strong across five dimensions:

#### A. Product and Care Workflow

- Today's Follow-up Queue is the operational homepage.
- Every queue item should answer:
  - who needs attention
  - why now
  - what changed from usual
  - what human should do next
  - who owns the follow-up
  - what happened after follow-up
- The system should reduce staff uncertainty and alert fatigue, not just display AI outputs.

#### B. Senior Care Context Profile

- Structured `senior_memories`, `senior_health_contexts`, and
  `routine_baselines` tables already exist.
- Treat the Senior Care Context Profile as a bounded logical view assembled from
  stable senior information, support-network records, routine baselines,
  non-diagnostic health context, and relevant personal memories.
- Keep stable profile context, personal memories, observed signals, and Pattern
  Watch interpretations distinct in storage and caregiver explanations.
- Preserve caregiver review, provenance, expiry, retention, and the existing
  evidence-bound Gate 5 extraction policy.
- Use context for explanation and follow-up planning, not diagnosis.

Do not add duplicate `pattern_watch_items` or `today_follow_up_queue` tables
unless there is a deliberate rename/refactor. The current equivalents are:

- `patterns` for Pattern Watch records
- `caregiver_queue_items` for Today's Follow-up Queue

#### C. Messaging and Operations

- Finish live WhatsApp callback setup after deployed smoke testing.
- Add scheduled proactive check-ins with duplicate-send protection.
- Add a reliable background processing cadence for pending WhatsApp events.
- Keep a manual recovery path for demos and support.

#### D. Safety, Privacy, and Trust

- Maintain deterministic final risk authority.
- Keep raw provider responses and secrets out of UI/API responses.
- Keep service-role access server-only.
- Keep RLS and server-side authorization aligned.
- Add clear human-in-the-loop language for non-diagnosis and non-emergency boundaries.
- Add auditability for caregiver actions and AI-generated recommendations.

#### E. Business Readiness

- Show operational value with measurable outcomes:
  - useful follow-up recommendation count
  - acknowledgement rate
  - follow-up completion rate
  - false alarm / alert fatigue rate
  - time from first pattern detection to human follow-up
- Prepare a narrative for AACs:
  - TrustKaki helps limited staff attention go to the right seniors earlier.
  - It does not replace caregivers, AAC volunteers, doctors, or emergency services.
  - It turns quiet daily changes into one actionable follow-up case.

### Current production gate sequence

#### Gate 0 — Audit Remediation (complete)

- bind every senior operation to an authorized `seniorId`
- load authoritative senior context server-side
- remove demo-senior defaults from normal authenticated paths
- record authenticated caregiver as actor and keep assignee separate
- repair recursive RLS helpers and prove isolation with two real users
- make caregiver case mutation and demo reset transactional
- fix real `AbortSignal.timeout()` behavior and tests
- split oversized dashboard and persistence modules by existing responsibilities
- add `npm run validate` and update implementation evidence
- focused reviewer re-audit completed; requested changes addressed

#### Gate 1 — Caregiver Case Operations (complete)

- auditable acknowledge, assign, snooze, contact outcome, escalation, and resolve
- required snooze and resolution reasons
- duplicate protection, conflict handling, immutable action history
- reliable shared-caregiver updates

Implemented so far:

- authenticated actor and separate assignment target
- transactional acknowledge, assign, snooze, outcome, and resolve commands
- required notes for snooze and resolve
- immutable caregiver action history
- resolved cases leave the active queue without rewriting policy risk
- senior-specific caregiver relationships and one explicit primary contact
- client-generated command IDs prevent duplicate caregiver actions on retry
- optimistic concurrency rejects stale shared-case updates with HTTP 409
- Supabase Realtime refreshes authorized caregivers, with polling fallback
- live two-user database tests prove idempotency, conflict rollback, and shared updates
- explicit escalation records a destination and meaningful reason without changing policy risk
- escalation keeps the case active and visible to every authorized caregiver
- emergency guidance clearly states that saving the record does not contact 995
- live two-user database tests prove escalation idempotency and shared action visibility
- caregiver UI exposes acknowledge and assignment without adding separate action buttons
- visible action history distinguishes the authenticated actor from the assignment target
- two isolated authenticated browser sessions proved shared updates, one-success/one-409 concurrency, resolution, unchanged risk, and unrelated-caregiver isolation
- transactional transition guards prevent acknowledge or snooze from downgrading
  an escalated case; assignment preserves escalated status
- invalid escalated-case actions are absent from the caregiver form
- Realtime verification now distinguishes subscription failure, delayed delivery,
  and missed delivery, with the bounded authenticated polling fallback tested separately

Remaining before Gate 1 is accepted:

- independent reviewer re-audit passed on 14 July 2026

#### Gate 2 — Contacts, Consent, and Escalation (accepted 14 July 2026)

- multiple verified contacts per senior
- relationship, priority, language, quiet hours, consent, and permitted alerts
- deterministic recipient selection and escalation order
- separate action actor, case assignee, and notification recipient
- admin-only contact-plan changes through authenticated transactional RPCs
- masked caregiver read model; raw destinations stay server-side/admin-scoped
- immutable consent and contact-plan audit history
- consent-bound urgent quiet-hours override with explainable exclusion reasons
- fictional seeded plans for all three demo seniors
- three live database runs and security/performance advisors pass
- authenticated browser proof passed for masked plans, consent update, recipient
  preview, senior switching, and raw-number absence
- contact and method command IDs are bound to the authenticated actor and
  normalized payload; changed-payload replay is rejected
- command payload bindings use HMAC-SHA-256 with a random database-held key in
  `trustkaki_private`; no destination-derived fingerprint is publicly readable
- phone and email destinations are normalized and validated by channel at both
  API and database boundaries
- admin preview preserves and explains deterministic recipient exclusions
- Realtime verification requires a real authenticated row event, while bounded
  polling is proven independently
- four remediation live runs, full validation, aligned migration history, and
  security/performance advisors pass
- independent reviewer accepted the private HMAC command-binding remediation

Gate 1 records escalation intent only. It does not send a message or contact an
external party. Actual notifications require the verified contacts, consent,
quiet-hours, and recipient-selection rules in this gate.

#### Gate 3 — Production WhatsApp

- [x] configure and verify the published Meta callback after Gates 0-2
- [x] prove one real senior inbound-to-policy-to-reply path on Meta's test number
- [x] preserve inbound WhatsApp provenance and process delivery/read/failure statuses
- [ ] verify one live reply after replacing the temporary token with a non-expiring,
  narrowly scoped System User credential (configured in local and Vercel Production)
- [ ] add administrator-driven multiple-senior phone onboarding and validation
- [ ] add a scheduled retry cadence, stage-level latency telemetry, and failure alerts
- [ ] complete templates, consent, quiet hours, and policy-approved human notifications
- [ ] register and verify the production TrustKaki number and business profile

Current external blocker: Meta shows the test WABA as Approved and its phone as
Connected/High quality, but status webhooks still return error `131031` because
Meta's backend reports hard/soft Business Manager locks. The linked personal
Facebook account is also in security recovery. Do not recreate Meta assets or
remove the verified WhatsApp implementation while support/recovery is pending.

#### Gate 3T — Telegram Demo Continuity

- [x] audit and document the minimal transport boundary
- [x] implement authenticated Telegram webhook intake and typed parsing
- [x] add durable deduplication and senior identity mapping
- [x] reuse the existing orchestrator, deterministic policy, and persistence
- [x] send one selected Telegram reply without exposing internal agent messages
- [x] complete unit, typecheck, lint, build, and one real live Telegram test
- [x] verify the resulting senior state appears in the existing dashboard

Live evidence is recorded in
`docs/superpowers/verification/2026-07-15-gate-3t-live-telegram.md`. Telegram
provider acceptance, persistence, exact-update deduplication, policy authority,
and authenticated dashboard refresh were verified. Telegram remains a temporary
continuity channel and does not replace the implemented WhatsApp path.

#### Gate 4 — Proactive Check-ins

- [x] approve the bounded architecture and operating policy
- [x] add senior-specific admin-managed schedules, quiet hours, and pause/resume
- [x] add Supabase Cron with atomically claimed, idempotent Supabase jobs
- [x] send the initial Telegram check-in and wait two hours
- [x] send exactly one gentle retry and wait one additional hour
- [x] cancel pending work when the senior responds before escalation
- [x] create one Yellow caregiver case after the final missed-response deadline
- [x] annotate, but do not auto-resolve, a case when the senior replies late
- [x] verify real scheduled sending, deduplication, persistence, and queue output

Approved design:
`docs/superpowers/specs/2026-07-15-gate-4-proactive-check-ins-design.md`.
Non-response alone never creates an emergency claim or rewrites policy risk.
Telegram is the first live transport; the existing WhatsApp path remains intact.

Gate 4 implementation verification is recorded in
`docs/superpowers/verification/2026-07-15-gate-4-proactive-check-ins.md`.
The audit remediation adds workflow-state guards for claimed-job races, response
correlation from the accepted initial send, durable send intent, uncertain-send
reconciliation, and five-minute Supabase Cron recovery compatible with the
current Vercel Hobby plan. The current code passed repeated live Supabase tests,
a real Telegram send, the timely-response cancellation path, the
initial-plus-retry no-response path, and an authenticated persisted dashboard
read. The independently audited commit is now live at
`https://trustkaki.vercel.app`. Supabase Vault is configured, the five-minute
Cron reached the protected processor with HTTP 200, and one real production
Telegram check-in received a timely senior reply. The workflow became
`responded`, cancelled its deadline, sent no retry, and created no false
caregiver case. The personal test schedule was paused after verification; the
shared scheduler remains active.

#### Gate 5 — Senior Care Context Operationalisation (complete)

- [x] add closed typed context contracts and deterministic eligibility policy
- [x] add provenance, expiry, retention, immutable events, and lifecycle RPCs
- [x] add conditional Context Memory Agent proposals and transactional persistence
- [x] bind private persistence retries and recover partial failures safely
- [x] add bounded active/non-expired agent and Pattern Watch context reads
- [x] add fixed-variant memory-aware proactive check-ins without raw memory text
- [x] add authenticated shared reads and admin correction/archive controls
- [x] pass the full non-live test, typecheck, lint, and production-build baseline
- [x] rerun final live Supabase isolation, migration, lint, and advisor checks
- [x] verify real Telegram extraction, later use, correction/archive, and cleanup

The implementation baseline is recorded in
`docs/superpowers/verification/2026-07-16-gate-5-memory-operationalisation.md`.
The final guarded Supabase suite passed 10/10 with aligned migrations, no
error-level advisor findings, and zero synthetic fixture residue. Real Telegram
messages proved one safe expiring extraction and later bounded personalization
without changing policy-authoritative risk. The authenticated production admin
flow proved correction, preserved closed tags and expiry, immutable lifecycle
events, archive, refresh survival, and zero active test preference afterward.

#### Gate 6 — Organisation Tenancy Foundation (complete)

- [x] add organisations and required senior ownership
- [x] add active `org_admin`, `staff`, and `volunteer` memberships
- [x] give admins/staff organisation-wide access and volunteers assigned-case access
- [x] preserve independent direct family-caregiver access
- [x] revoke access immediately for inactive memberships or organisations
- [x] authorize production administration through database organisation roles
- [x] keep `demo_admin` limited to demo and simulator operations
- [x] prove two-organisation RLS isolation, mutation boundaries, and cleanup
- [x] pass live regression suites, validation, migration alignment, and audit

The verified foundation is recorded in
`docs/superpowers/verification/2026-07-17-gate-6-organisation-tenancy-foundation.md`.
The live Gate 6 suite passed 4/4 three times, the existing RLS and Gate 4/5
regressions passed, and final validation passed with 583 tests. No synthetic
fixtures remained. Roster UI, distributed rate limiting, broader observability,
backup/recovery exercises, export/deletion workflows, and load testing are
deferred until a pilot or measured need justifies them; they are not required
for the hackathon demo.

#### Gate 7 — Adoption and UI Refinement (complete)

- [x] rank accessible seniors by deterministic care priority
- [x] add fictional circular portraits with a safe initials fallback
- [x] reduce default reading burden around the selected priority case
- [x] keep technical traces outside the normal caregiver workflow
- [x] support compact mobile coverage and independent desktop column scrolling
- [x] add clear focus, validation, disclosure, empty, and conflict states
- [x] verify authenticated senior switching, contact-method saving, and case details
- [x] pass the complete test, typecheck, lint, and production-build baseline

The final evidence is recorded in
`docs/superpowers/verification/2026-07-21-gate-7-care-workspace.md`.
Authenticated manual review covered desktop and compact layouts because the
automated browser connector could not attach to the local worktree path. Full
localisation remains deferred until a pilot identifies required languages and
translated operational copy; the current layout and controls remain suitable
for that later work.

#### Gate 8 — Pilot and Deployment Approval

- security/privacy review, monitoring, incident ownership, rollback rehearsal
- production Meta credentials and controlled AAC pilot
- metrics-based go/no-go decision

## 16A. Best Next Step

Gates 0 through 7 are complete. The next hackathon release step is a bounded
Gate 8 pass: deploy the judged workflow, retry production WhatsApp linking,
preserve Telegram as the reliable live-demo fallback, run the final security
and privacy review, and rehearse rollback and the judge walkthrough. Do not add
enterprise roster or scaling infrastructure without a demonstrated pilot need.

## 16B. Multi-Senior Support Network Foundation

TrustKaki must support many seniors and many caregivers/AAC staff concurrently.
The demo should now show a small but realistic coverage list, not a single
generic senior. Seed profiles should use respectful full names, gender/context
for outreach, different household situations, and at least one high-risk case
so the queue demonstrates real prioritisation.

Implemented foundation:

1. Dashboard state reads all seniors accessible to the signed-in caregiver.
2. The follow-up queue is aggregated across accessible seniors.
3. The selected senior controls detailed messages, traces, alerts, and briefing.
4. The UI shows a compact senior coverage strip before the detailed senior view.
5. The API accepts a selected `seniorId` and rejects inaccessible seniors.
6. Seed data includes more than one senior and more than one caregiver
   relationship.
7. Senior switching should feel immediate through optimistic local selection,
   with Supabase hydration updating details in the background.
8. Shared-caregiver dashboard state stays fresh through authorized Realtime
   refresh hints, authenticated polling, and refresh-on-focus.
9. Each senior belongs to one organisation; staff access follows active roles,
   volunteers require assignment, and family access remains direct.

Deferred until justified by pilot needs:

- caregiver notification preferences
- multi-recipient WhatsApp outbound fan-out
- production staff roster UI and self-service onboarding
- high-scale Realtime, rate limiting, load testing, and recovery exercises

Contacts, consent, escalation, organisation tenancy, and authorized Realtime
refresh hints are already implemented. The deferred items should not expand the
hackathon scope unless they become part of a real pilot workflow.

This support-network foundation is part of the Senior Care Context Profile. It
must not become a separate "Relationship Layer" or a parallel source of truth.

## 17. Build Rules

For every implementation task:

- use the existing local codebase only
- inspect before modifying
- avoid unnecessary rewrites
- keep changes small and testable
- run typecheck
- run build
- report changed files
- report setup steps
- report environment variables
- report known limitations
- do not claim success without verification
- do not substitute scripted data for real functionality without clearly marking it
- bring major product decisions back to TrustKaki HQ

## 18. Definition of Done

TrustKaki is submission-ready when:

- a real senior can message it on WhatsApp
- the message reaches the deployed backend
- the orchestrator invokes the correct real agent
- the output is validated
- state is persisted
- TrustKaki replies through WhatsApp
- risk and signals update
- caregiver/AAC dashboard reflects the event
- a useful brief can be generated
- scheduled check-ins work
- real traces are visible
- the product has a stable demo fallback
- the deployed app is accessible to judges
