# Gate 5 Memory Operationalisation Verification

Date: 2026-07-17
Status: Complete and live verified

## Scope

Gate 5 adds a closed, auditable senior-context lifecycle across memory,
non-diagnostic health context, and routine baselines. It covers deterministic
eligibility policy, conditional Context Memory Agent proposals, transactional
automatic persistence, bounded agent and Pattern Watch reads, fixed-variant
proactive check-ins, authenticated caregiver reads, and admin correction or
archive controls.

Family notification fan-out, organisation tenancy, WhatsApp recovery, and
deployment are outside this gate.

## Implemented Baseline

- Closed context stores, types, application tags, retention classes, and
  rejection categories are validated before persistence.
- Automatic proposals require exact senior-authored evidence. Diagnostic,
  treatment, credential, OTP, banking, payment, and identity-document content
  is rejected by deterministic policy.
- Context lifecycle RPCs bind command identity and payload, preserve immutable
  events, reject stale corrections, and support idempotent retries.
- Orchestration persistence binds its private retry envelope before writes,
  resumes partial failures, and rejects ambiguous duplicate candidates before
  any RPC or table operation.
- Agent context reads are authorized, active, non-expired, bounded to 12 items,
  capped at 280 characters, and expose only type, content, safe-use notes, and
  closed application tags.
- Pattern Watch uses the same active and expiry predicates.
- Proactive check-ins use fixed wording selected only from closed application
  tags. Memory content is never copied into outbound text.
- Caregiver context reads use the caregiver JWT and RLS. Correction and archive
  use the admin JWT, a strict version-bound request, and the transactional RPCs.
- The dashboard shows one collapsed grouped context section. Non-admin users
  have no mutation controls; the public read model excludes confidence,
  snapshots, source-message text, provider data, and free-text provenance.

## Commits

```text
5a2f342 feat: persist automatic senior context
1de52f0 fix: harden live memory persistence verification
e985172 fix: resume orchestration persistence safely
e95f98a fix: bind orchestration persistence retries
eb6e2de feat: use bounded senior context
6d7e01f feat: personalise proactive check-ins safely
d035acd feat: add senior context correction controls
de8fb97 docs: record gate 5 non-live verification
4cc6795 fix: align live context memory persistence
```

## Non-Live Verification

Consolidated Gate 5 command:

```bash
npm test -- \
  src/lib/memory/policy.test.ts \
  src/lib/security/gate5MemoryMigration.test.ts \
  src/lib/security/seniorContextMigration.test.ts \
  src/lib/persistence/orchestrationBinding.migration.test.ts \
  src/lib/agents/prompts.test.ts \
  src/lib/agents/orchestrator.test.ts \
  src/lib/agents/provider.test.ts \
  src/lib/persistence/memoryRepository.test.ts \
  src/lib/persistence/orchestration.test.ts \
  src/lib/persistence/trustkakiRepository.test.ts \
  src/lib/persistence/seniorContextRepository.test.ts \
  src/lib/checkins/service.test.ts \
  src/lib/checkins/policy.test.ts \
  src/lib/persistence/proactiveCheckInRepository.test.ts \
  'src/app/api/seniors/[seniorId]/context/route.test.ts' \
  'src/app/api/admin/seniors/[seniorId]/context/route.test.ts' \
  src/components/dashboard/SeniorContextPanel.test.ts \
  src/lib/api/schemas.test.ts \
  src/lib/security/gate5Memory.integration.test.ts
```

Result: 19 files passed; 224 tests passed; 8 live-gated tests skipped.
No non-live Gate 5 test was skipped.

Complete validation:

```bash
npm run validate
```

Result:

- Vitest: 91 files passed, 3 gated suites skipped; 537 tests passed, 34 skipped.
- TypeScript: passed with `tsc --noEmit`.
- ESLint: passed.
- Next.js production build: passed; 23 static pages generated and both senior
  context routes compiled.

The build emitted the existing multiple-workspace-lockfile root warning. It did
not fail compilation or validation.

## Live Supabase Evidence

Fresh final run after all remediation commits:

```bash
TRUSTKAKI_RUN_LIVE_SUPABASE=1 npm test -- \
  src/lib/security/gate5Memory.integration.test.ts
```

Result: 1 file passed; 10/10 tests passed. The guarded suite proved exact
project identity, same-command replay idempotency, changed-payload rejection,
confirmation refresh, transactional replacement, stale-conflict rejection with
no partial state, immutable events, admin-only mutation, shared authorized
reads, unrelated-caregiver isolation, expiry exclusion, and cleanup.

The linked worktree migration list aligned through:

- `20260716060000_gate_5_memory_operationalisation.sql`
- `20260716093309_gate_5_orchestration_replay_binding.sql`
- `20260717114922_gate_5_context_memory_agent_id.sql`

Linked database lint completed with no error-level findings. It reported one
pre-existing warning in `reset_trustkaki_demo` about a text-to-UUID assignment;
this is outside Gate 5 and did not fail lint. Linked security and performance
advisors reported no error-level issues.

Post-suite cleanup queries returned zero Gate 5 synthetic seniors, caregivers,
messages, and auth users. The suite also verified zero rows for its exact
temporary senior IDs across context and immutable-event stores before exit.

## Real Telegram And Admin Evidence

A real Telegram durable communication preference was processed by the deployed
application. The Context Memory Agent used the real model, returned valid typed
output without fallback, and created exactly one active
`communication_preference` memory sourced to the persisted inbound message. It
carried the closed `concise_text` application tag and a bounded expiry. No risk
event was created.

A later real care question loaded that persisted tag into orchestration. The
reply was concise, while deterministic policy kept the final risk Yellow and
recorded no risk change or risk event. The dashboard refresh showed the active
preference and excluded confidence, source-message text, provider data, and
other private provenance from the public read model.

Through the authenticated production admin UI, the preference was corrected
with a reason. Production state then contained one active `admin_corrected`
record and one linked superseded record; the closed tag and expiry were
preserved. The correction emitted command-bound `superseded` and `corrected`
events with immutable before/after snapshots. The corrected record was then
archived with a reason. The UI immediately reduced the active preference count,
and production state showed zero active test preferences while retaining the
superseded and archived rows and all four lifecycle events.

Shared-caregiver visibility, non-admin mutation denial, unrelated-caregiver
isolation, stale conflict, retry idempotency, event immutability, and fixture
cleanup were proved by the authenticated live Supabase suite. The real UI flow
used the demo-admin account; it did not claim a second real caregiver browser
session.

No destination, phone number, Telegram identifier, token, provider payload,
credential, or secret was logged or added to this document.

## Decision

Gate 5 is complete and live verified. Automatic extraction, later bounded use,
admin correction and archive, immutable history, stale and retry behavior,
authenticated sharing and isolation, advisor checks, full validation, and
cleanup all passed.

The remediation baseline is deployed at `https://trustkaki.vercel.app`. No Git
push was performed as part of this verification close-out.
