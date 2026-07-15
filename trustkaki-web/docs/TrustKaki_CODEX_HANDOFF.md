# TrustKaki — Codex Handoff

## Source of truth
Use only:
`/Users/ngminxie/Documents/SMU/Hackathons:Events/2026/Tencent Age Well Hackathon/trustkaki-web`

Read first:
- `docs/TrustKaki_BUILD_ROADMAP.md`
- this handoff
- current repository code

Do not use earlier drafts. Major product decisions go back to TrustKaki HQ.

## Product goal
TrustKaki must be a real deployable product, not a scripted mock. Final target:
- real WhatsApp inbound/outbound
- real multi-agent orchestration
- real LLM calls
- Supabase persistence
- scheduled proactive check-ins
- caregiver/AAC alerts and briefings
- live dashboard
- real agent traces
- public deployment

## Current stack
- Next.js 16.2.10
- TypeScript
- Tailwind
- Zod 4
- OpenAI-compatible provider
- tested model: `gpt-4o-mini-2024-07-18`
- Supabase persistence, Auth, RLS, Pattern Watch, and caregiver queue
- Meta WhatsApp Cloud API webhook and async inbox foundation

## Local run command
The user is in China and OpenAI requires V2RayU proxy:

```bash
cd "/Users/ngminxie/Documents/SMU/Hackathons:Events/2026/Tencent Age Well Hackathon/trustkaki-web"

NODE_USE_ENV_PROXY=1 \
HTTP_PROXY=http://127.0.0.1:10808 \
HTTPS_PROXY=http://127.0.0.1:10808 \
NO_PROXY=localhost,127.0.0.1 \
node node_modules/next/dist/bin/next dev -p 3000
```

Do not print `.env.local` secrets.

## Existing frontend
- WhatsApp-style senior chat
- caregiver/AAC dashboard
- agent trace panel
- interactive demo controls
- frontend calling agent APIs

Important files:
- `src/components/ChatSimulation.tsx`
- `src/components/Dashboard.tsx`
- `src/components/AgentTracePanel.tsx`
- `src/components/NavBar.tsx`
- `src/app/page.tsx`

## Existing agent backend
Files:
- `src/lib/agents/contracts.ts`
- `src/lib/agents/schemas.ts`
- `src/lib/agents/provider.ts`
- `src/lib/agents/prompts.ts`
- `src/lib/agents/runner.ts`
- `src/lib/agents/orchestrator.ts`
- `src/lib/agents/index.ts`

Routes:
- `/api/agents/orchestrate`
- `/api/agents/triage`
- `/api/agents/aac-nudge`
- `/api/agents/digital-safety`
- `/api/agents/briefing`

Shared runner already supports:
- real LLM calls
- structured JSON
- Zod validation
- retries
- timeout
- trace IDs
- latency logging
- safe fallback

## Verified real LLM result
Input:
`Not hungry today. Knee pain.`

Verified:
- `fallback: false`
- model `gpt-4o-mini-2024-07-18`
- `health` medium signal
- `daily_living` medium signal
- Yellow risk in standalone triage
- routing to AAC Nudge
- Zod passed
- first attempt success
- about 5.4s latency

## Phase 1.5 status

Phase 1.5 safety and orchestration hardening is implemented.

Current deterministic policy behavior:
- final risk and risk change are authoritative from `src/lib/agents/policy.ts`
- LLM outputs provide validated interpretation/signals only
- policy output is returned in orchestration responses
- a synthetic `policy` trace is visible in agent traces
- automatic briefing is policy-gated
- manual briefing is preserved only with `trigger: "manual_override"`
- Briefing Agent `overallRisk` is advisory and is overwritten by authoritative risk
- alerts are filtered separately from detected signals
- one low-severity social signal is tracked and can trigger AAC Nudge, but does not create caregiver alert or automatic briefing by default

Verified deterministic tests:
- benign greeting -> Green, no automatic briefing, no alert
- medium health + medium daily_living -> Yellow, briefing, one actionable alert
- low social "paiseh" signal -> AAC Nudge preserved, no Digital Safety, no briefing, no caregiver alert
- high digital_safety signal -> at least Yellow, Digital Safety path, alert created
- urgent structured health signal -> Red, urgent alert
- confirmed scam loss/account compromise -> Red urgent escalation
- current Yellow + one positive message -> remains Yellow
- manual briefing override works for benign context and does not alter risk
- Briefing Agent overallRisk cannot override policy finalRisk
- policy trace is returned

## Verified orchestration behavior
Four real tests were rerun after Phase 1.5.

1. `Good morning, I slept well.`
- orchestrator + triage + policy
- AAC Nudge skipped
- Digital Safety skipped
- risk Green
- no alert
- no briefing

2. `Not hungry today. Knee pain.`
- orchestrator + triage + AAC Nudge + policy + briefing
- Digital Safety skipped
- health + daily_living detected
- final risk Yellow
- one medium health alert

3. `Don't want. Paiseh.`
- orchestrator + triage + AAC Nudge + policy
- Digital Safety skipped
- social signal detected
- final risk Green
- no alert
- no automatic briefing

4. SingPost scam text
- orchestrator + triage + Digital Safety + policy + briefing
- AAC Nudge skipped
- high digital_safety signal detected
- final risk Yellow
- one high digital_safety alert
- no Red escalation unless confirmed loss/account compromise is detected

Across all runs:
- real LLM
- fallback false
- Zod passed
- policy trace returned
- conditional routing is genuine

## Current implementation status

Phase 2 Supabase persistence foundation is implemented and live verified.
Messages, check-ins, detected signals, policy risk events, agent runs, alerts,
briefs, Pattern Watch records, caregiver queue items, and caregiver actions are
persisted through the repository layer. `.env.local` secrets must never be
printed or committed.

Phase 3A WhatsApp Cloud API integration is implemented and one controlled real
Meta test-number path is live verified: published callback, signed inbound
parsing, verified senior lookup, deduplication, real orchestration, Supabase
persistence, one selected outbound reply, and Meta sent/delivered events. The
verification evidence is in
`docs/superpowers/verification/2026-07-14-gate-3-live-whatsapp.md`.

Phase 3B asynchronous WhatsApp inbox processing is implemented with a
Supabase-backed webhook event inbox. Meta webhook handling can acknowledge
quickly, and processing can be retried safely. Inbound conversation records now
retain WhatsApp provenance, while sent/delivered/read/failed events use the same
durable processor to update linked outbound metadata without invoking agents.
The temporary Meta token has been replaced locally and in Vercel Production by
a non-expiring System User credential scoped to WhatsApp messaging and
management. The deployment is healthy; one post-rotation live reply remains
required before closing credential verification. Meta currently reports stale
hard/soft Business Manager locks through delivery error `131031`, and the linked
personal Facebook account requires security recovery. This is an external
transport blocker rather than a failure of TrustKaki orchestration.

Telegram is now the temporary live demonstration transport. It must be added as
a narrow adapter that reuses the existing orchestrator, deterministic policy,
persistence, Pattern Watch, and dashboard. WhatsApp remains the preferred
production channel and its implementation must stay intact.

Gate 3T is now live and verified. A mapped senior sent a real Telegram text and
received one real TrustKaki reply through the production webhook. The exact
event produced six persisted agent/policy runs, two validated signals, one
policy-approved alert, one policy briefing, no unnecessary risk transition, and
no fallback. Replaying the exact update created no duplicate work or records.
The authenticated caregiver dashboard retained the senior's Yellow state,
latest response, active follow-up item, and priority case after refresh. See
`docs/superpowers/verification/2026-07-15-gate-3t-live-telegram.md`.

Gate 4 proactive check-ins are implemented through Task 8 and ready for focused
independent audit. Supabase stores admin-managed schedules, workflows, events,
and atomically claimed jobs. The bounded processor sends one initial Telegram
check-in, waits two hours, sends one gentle retry, waits one hour, and then
creates one Yellow operational case without changing policy risk. Timely replies
cancel pending work; late replies annotate but do not resolve the case. Three
consecutive live Supabase runs passed 4/4, full validation passed with 367 tests,
and temporary verification fixtures were removed. A real timely reply reached
the current production webhook, but Vercel still runs the pre-Gate-4 build; the
same persisted event closed correctly through the current local processor. See
`docs/superpowers/verification/2026-07-15-gate-4-proactive-check-ins.md` and do
not claim production Gate 4 operation until audit, promotion, and a production
timely-response rerun are complete.

Phase 4 Pattern Watch and caregiver queue are implemented. Pattern Watch reads
stored detected signals over time and writes `patterns` plus operational
`caregiver_queue_items`.

Phase 4.1 queue consolidation is implemented. Multiple related active patterns
for the same senior episode produce one active caregiver queue case with linked
pattern IDs/types. Resolving the case resolves all linked open patterns while
caregiver action history remains stored.

Phase 5 Judge View work focuses on making the real flow understandable in under
one minute: reset demo, run Quick Demo, inspect timeline/evidence, assign,
record outcome, resolve, and see the active queue clear.

Phase 7A senior context schema foundation exists. Operational memory workflows
remain incomplete. The intended production direction is to make Pattern Watch
compare new signals against stored senior-specific context instead of generic
keyword-like assumptions:

- `routine_baselines`
- `senior_health_contexts`
- `senior_memories`

These records are operational support only. They should guide follow-up
questions and caregiver/AAC action, not diagnose medical conditions.

Phase 7B multi-senior foundation is partially implemented. The dashboard reads
all seniors accessible to the authenticated caregiver, aggregates the follow-up
queue across those seniors, and uses an explicit selected senior for messages,
traces, alerts, briefing, and the detailed case view. Senior switching uses
optimistic local selection so the profile changes immediately while Supabase
hydration completes in the background.

Shared caregiver sync uses authorized Supabase Realtime change notifications as
refresh hints, then rereads authoritative state through the authenticated
dashboard API. Lightweight polling every 20 seconds and refresh-on-focus remain
fallbacks when Realtime is disconnected.

The production roadmap is gate-based following an independent security and
reliability audit. Gate 0 remediation passed its focused re-audit and all
requested changes were addressed. The approved design remains
`docs/superpowers/specs/2026-07-13-production-release-gates-design.md`.

Gate 0 closed these blockers:

- bind every agent and manual-briefing request to an authorized `seniorId`
- load senior context server-side and remove implicit demo-senior persistence
- record authenticated caregiver as action actor, separate from assignee
- replace recursive RLS helpers and prove two-user database isolation
- make caregiver case updates and demo reset transactional
- fix real `AbortSignal.timeout()` `TimeoutError` behavior
- add regression tests, `npm run validate`, and accurate plan evidence
- split the oversized dashboard and repository by existing responsibilities
- completed focused reviewer re-audit and addressed requested changes

Gate 1 caregiver case operations passed independent re-audit on 14 July 2026.
The current foundation
uses authenticated transactional commands, preserves action history, separates
case closure from policy-authoritative risk, and stores caregiver relationship
and primary-contact status on each senior-caregiver link. Explicit escalation
now records one of four operational destinations and a required reason, keeps
the case active, and does not change policy risk or claim to contact anyone.
Conflict-safe commands, retry idempotency, escalation visibility, and Supabase
Realtime shared-caregiver refresh are live verified against two authenticated
temporary caregivers. Two isolated authenticated browser sessions also proved
acknowledge, assignment, contact outcome, escalation, stale-update rejection,
resolution, unchanged policy risk, and unrelated-caregiver isolation. The
automation used separate cookie domains in one controlled browser engine, not
two separate browser engines. Temporary users and records were removed after
verification.

The first Gate 1 audit found that acknowledge and assignment could downgrade an
already escalated queue item because the transactional RPC selected the next
status from the action alone. Migration `20260714044604` now rejects invalid
escalated actions and preserves escalation through assignment and non-resolving
outcomes. The UI exposes only valid actions. Realtime integration evidence now
captures channel status, distinguishes delayed from missed events, and verifies
the bounded authenticated polling fallback independently. Focused tests, three
consecutive live two-user runs, the escalated-case browser workflow, and the full
validation gate pass. The reviewer accepted the corrected Gate 1 evidence.

Gate 2 contacts, consent, and escalation is implemented and independently
accepted. It adds admin-managed
multi-contact plans, verified methods, immutable consent events, quiet hours,
deterministic recipient selection, masked caregiver reads, atomic escalation
recipient decisions, and contact-plan Realtime refresh hints. Migrations
`20260714053148`, `20260714055223`, `20260714060530`, `20260714064523`,
`20260714070638`, and `20260714071108` are applied and aligned with the linked
TrustKaki project. The final live Gate 2 suite passed 10/10; security and
performance advisors found no error-level issues; `npm run validate` passed
with 257 tests. The authenticated browser workflow also proved
masked contact display, consent recording, recipient preview, fast
senior-specific plan switching, and raw-number absence. A discovered stale
preview-state defect was fixed by remounting contact-plan state per senior and
covered by a focused regression test. The reviewer accepted the final private
HMAC command-binding remediation on 14 July 2026.

Demo seed profiles should be respectful and realistic rather than generic
"Uncle/Aunty" placeholders. Current seed direction uses Mr Tan Ah Hock, Mdm Lim
Siew Lan, and a high-risk Mdm Siti Fatimah Binte Rahman case to demonstrate
different household contexts, caregiver relationships, and risk levels.

## Current caveats

1. Tone later needs tuning:
   - avoid stereotyped overuse of “lah/leh/ah/shiok”
   - use warm, respectful, plain Singapore English
2. Quick Demo uses one typed Triage timeline extraction call for speed, then
   deterministic Pattern Watch and queue consolidation. Full Agent Replay remains
   available for technical validation.
3. The published Meta callback targets `https://trustkaki.vercel.app`; do not
   change it, regenerate credentials, or recreate Meta assets while account
   recovery is pending.

## Immediate next task

Run one focused independent Gate 4 audit using
`docs/superpowers/plans/2026-07-15-gate-4-proactive-check-ins.md` and
`docs/superpowers/verification/2026-07-15-gate-4-proactive-check-ins.md`.
The implementation, repeated live Supabase suite, real Telegram send,
accelerated no-response workflow, and authenticated dashboard read pass. A real
timely reply reached the production webhook, but Vercel is still on the older
deployment; current code closed that same persisted event only when processed
locally. Do not claim production Gate 4 operation until the audit passes, the
reviewed commits are promoted, and one production timely-response workflow is
rerun. Keep Gate 5 memory work, family fan-out, tenancy, and UI redesign out of
the audit checkpoint.

## Working rules
- inspect before modifying
- use only the existing repo
- keep changes small and testable
- do not expose secrets
- run typecheck
- run tests
- run build
- report changed files
- report setup steps
- report limitations
- do not claim success without verification
- do not replace real functionality with scripted simulation
