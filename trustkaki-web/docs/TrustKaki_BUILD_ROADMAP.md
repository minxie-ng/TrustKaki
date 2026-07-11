# TrustKaki — Build Roadmap and Product North Star

## 1. Project Purpose

TrustKaki is a proactive AI companion for isolated seniors in Singapore.

TrustKaki is not another senior chatbot or check-in summary tool. It is a
pattern-aware last-mile engagement layer that turns quiet daily changes into
concrete human follow-up actions for Singapore caregiver and Active Ageing
Centre (AAC) workflows.

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

1. TrustKaki runs a morning check-in.
2. Uncle Tan replies: “Not hungry today. Knee pain.”
3. The Triage Agent detects `daily_living` and `health_frailty_signal`.
4. Risk changes from Green to Yellow.
5. Uncle Tan resists an AAC suggestion with: “Don’t want. Paiseh.”
6. The AAC Nudge Agent responds gently without pressuring him.
7. Uncle Tan shares a suspicious SingPost SMS.
8. The Digital Safety Agent analyses it and advises him safely.
9. Uncle Tan misses his usual morning reply the next day.
10. Pattern Watch detects a possible routine + mobility + social withdrawal pattern.
11. The Briefing Agent generates a concise caregiver/AAC summary.
12. The dashboard recommends a concrete next human action: Mei Ling should try a 1-to-1 lift lobby check-in instead of inviting Uncle Tan to a group event.
13. The dashboard updates from real stored events.

## 5. Target Architecture

```text
WhatsApp / Demo Trigger
        ↓
Inbound Message API
        ↓
Message Router / Orchestrator
        ↓
Relevant Specialist Agent(s)
        ↓
Policy + Safety Checks
        ↓
Memory + Pattern Watch
        ↓
State and Risk Update
        ↓
Outbound Reply / Human Alert
        ↓
Supabase Persistence
        ↓
Caregiver/AAC Dashboard
```

## 6. Agent Responsibilities

### Orchestrator Agent

- inspect an event or incoming message
- decide which specialist agent should run
- avoid unnecessary agent calls
- return a structured execution plan

### Triage Agent

- detect soft risk signals
- classify the message
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

- summarise recent events for caregivers or AAC volunteers
- distinguish facts from inferences
- highlight risk changes
- recommend a clear next human action
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

Recommended memory and pattern additions for the next database phase:

- `senior_memories`
- `routine_baselines`
- `senior_health_contexts` or `health_contexts`
- `pattern_watch_items` or `pattern_observations`

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

## 8A. Memory Architecture

TrustKaki memory has four layers.

### A. Event Memory

- `messages`
- `check_ins`
- `agent_runs`
- `alerts`
- `briefs`

### B. Signal Memory

- `detected_signals`
- `risk_events`
- examples: `reduced_appetite`, `knee_pain`, `social_hesitation`, `suspicious_sms`, `non_response`

### C. Senior Profile / Baseline Memory

- preferred language
- usual reply time
- usual meal time
- usual activity level
- assigned caregiver
- assigned AAC volunteer
- usual social comfort level

### D. Personal and Health-Context Memory

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

## 11. WhatsApp Integration

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

- senior profile
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

TrustKaki focuses on pattern-to-action:

- detects quiet daily changes over time
- connects them to Singapore AAC/caregiver workflows
- recommends the next best human action
- keeps humans in the loop
- shows risk movement and agent traces transparently

TrustKaki could complement voice agents like NANA as the dashboard, risk, memory,
and action layer behind proactive senior engagement.

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

## 16. Immediate Next Step

Current priority is judge clarity: the real working flow should be
understandable in under one minute without hiding the real multi-agent and
persistence system underneath.

Implemented baseline:

1. Phase 2 Supabase persistence foundation is live.
2. Phase 3A Meta WhatsApp Cloud API webhook/sender is implemented for local testing.
3. Phase 3B reliable asynchronous WhatsApp inbox processing is implemented.
4. Phase 4 practical Pattern Watch and caregiver queue is implemented.
5. Phase 4.1 queue consolidation creates one active caregiver episode per senior while retaining separate pattern records.
6. Phase 5 Judge View and practical UI refinement is in progress.

Next steps after Phase 5:

1. Deploy the current working baseline.
2. Configure the real Meta callback URL.
3. Add scheduler/proactive check-ins.
4. Add senior memory + health/body-condition context.
5. Prepare final submission walkthrough and README.

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
