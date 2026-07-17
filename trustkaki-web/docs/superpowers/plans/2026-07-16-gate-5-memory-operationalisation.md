# Gate 5 Memory Operationalisation Implementation Plan

Implementation status on 2026-07-17: Tasks 1-8 are implemented and live
verified. The final evidence covers real Telegram extraction and later bounded
use, production admin correction/archive, authenticated Supabase sharing and
isolation, stale and retry behavior, immutable events, advisors, and cleanup.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically extract safe, sourced, expiring senior context and use it to personalise later agent replies, Pattern Watch comparisons, and proactive check-ins without adding a caregiver approval queue.

**Architecture:** A Context Memory Agent produces Zod-validated candidates, while a pure deterministic policy decides whether each candidate is eligible. Supabase transactional commands activate, confirm, supersede, correct, or archive context with immutable events; bounded server-side readers expose only active non-expired context to agents and deterministic check-in wording.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Supabase Postgres/RPC/RLS, existing agent runner, deterministic Pattern Watch, Telegram, Vitest.

---

## File Map

- Create `src/lib/memory/contracts.ts`: candidate, policy, command, read-model, and application-tag types.
- Create `src/lib/memory/policy.ts`: pure evidence, confidence, retention, and sensitive/diagnostic eligibility rules.
- Create `src/lib/memory/policy.test.ts`: deterministic policy coverage.
- Create `supabase/migrations/20260716060000_gate_5_memory_operationalisation.sql`: context metadata, immutable events, transactional commands, RLS, grants, and indexes.
- Create `src/lib/security/gate5MemoryMigration.test.ts`: migration security contract.
- Create `src/lib/security/gate5Memory.integration.test.ts`: live two-caregiver isolation, idempotency, concurrency, and expiry coverage.
- Create `src/lib/persistence/memoryRepository.ts`: context command RPCs and bounded reads only.
- Create `src/lib/persistence/memoryRepository.test.ts`: repository contract tests.
- Modify `src/lib/agents/contracts.ts`, `schemas.ts`, `prompts.ts`, `fallbacks.ts`, `orchestrator.ts`, and focused tests: add the Context Memory Agent and trace.
- Modify `src/lib/types.ts`: add `context_memory` to the agent identifier union.
- Modify `src/lib/persistence/orchestration.ts`, `orchestrationRepository.ts`, and tests: persist eligible context after inbound-message persistence.
- Modify `src/lib/persistence/seniorContextRepository.ts` and tests: load a bounded active context bundle.
- Modify `src/lib/persistence/patternRepository.ts` and tests: enforce expiry and archival filters.
- Modify `src/lib/checkins/service.ts` and tests: select deterministic safe wording variants from application tags.
- Create `src/app/api/seniors/[seniorId]/context/route.ts`: authorized context read API.
- Create `src/app/api/admin/seniors/[seniorId]/context/route.ts`: admin correction/archive command API.
- Create `src/components/dashboard/SeniorContextPanel.tsx` and test: compact context and correction UI.
- Modify `src/app/page.tsx` and `src/components/Dashboard.tsx`: load and mount the panel.
- Modify `src/lib/api/schemas.ts`, `src/lib/supabase/types.ts`, roadmap, handoff, and Gate 5 verification evidence.

### Task 1: Typed memory contracts and deterministic eligibility policy

**Files:**
- Create: `src/lib/memory/contracts.ts`
- Create: `src/lib/memory/policy.ts`
- Create: `src/lib/memory/policy.test.ts`

- [x] **Step 1: Write failing policy tests**

Cover confidence `0.85`, exact evidence matching, supported stores/types,
sensitive-data rejection, diagnostic-inference rejection, category retention,
normalised context keys, and bounded application tags.

```ts
expect(evaluateMemoryCandidate(validPreference, sourceMessage)).toMatchObject({
  accepted: true,
  expiresInDays: 180,
});
expect(evaluateMemoryCandidate({ ...validPreference, confidence: 0.84 }, sourceMessage))
  .toEqual({ accepted: false, reason: "low_confidence" });
expect(evaluateMemoryCandidate(diagnosisCandidate, sourceMessage))
  .toEqual({ accepted: false, reason: "diagnostic_inference" });
```

- [x] **Step 2: Run the test and verify RED**

Run: `npm test -- src/lib/memory/policy.test.ts`
Expected: FAIL because the memory policy module does not exist.

- [x] **Step 3: Implement minimal contracts and pure policy**

Define `MemoryCandidate` with `targetStore`, `contextKey`, `contextType`,
`content`, `sourceMessageId`, `evidenceExcerpt`, `confidence`,
`applicationTags`, and `retentionClass`. Export:

```ts
evaluateMemoryCandidate(candidate, sourceMessage): MemoryEligibilityResult
expiryForRetention(retentionClass, now): string
normaliseContextKey(value): string
```

Use a closed application-tag enum:
`concise_text`, `gentle_one_to_one`, `voice_preferred`,
`practical_meal_prompt`, `accessibility_support`, and `trusted_contact_route`.
Do not call Supabase, an LLM, or the system clock inside policy functions.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- src/lib/memory/policy.test.ts && npm run typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/memory
git commit -m "feat: define memory eligibility policy"
```

### Task 2: Supabase context lifecycle and immutable audit

**Files:**
- Create: `supabase/migrations/20260716060000_gate_5_memory_operationalisation.sql`
- Create: `src/lib/security/gate5MemoryMigration.test.ts`
- Modify: `src/lib/supabase/types.ts`

- [x] **Step 1: Create the migration filename normally**

Run: `supabase migration new gate_5_memory_operationalisation`
Expected: one new timestamped SQL file under `supabase/migrations`. Before
writing SQL, rename that empty file to the reserved, collision-free plan path
`20260716060000_gate_5_memory_operationalisation.sql`; the migration remains a
normal Supabase migration and retains ordering after all existing Gate 4 files.

- [x] **Step 2: Write the failing migration contract test**

Assert that all three existing context tables gain `context_key`, provenance,
confidence, confirmation, expiry, supersession, and application-tag fields;
that `senior_context_events` is append-only; and that all security-definer
commands lock `search_path` and authorize the senior.

```ts
expect(sql).toContain("create table public.senior_context_events");
expect(sql).toContain("apply_automatic_senior_context");
expect(sql).toContain("correct_senior_context");
expect(sql).toContain("archive_senior_context");
expect(sql).not.toMatch(/grant (insert|update|delete).*senior_context_events.*authenticated/i);
```

- [x] **Step 3: Run the migration test and verify RED**

Run: `npm test -- src/lib/security/gate5MemoryMigration.test.ts`
Expected: FAIL until the schema and commands satisfy the contract.

- [x] **Step 4: Implement the smallest transactional schema**

Add shared fields to existing tables, a partial unique index for one active
`(senior_id, context_key)` per table, and append-only event rows. Implement:

```sql
apply_automatic_senior_context(command_id, senior_id, source_message_id, payload_json)
correct_senior_context(command_id, senior_id, store, context_id, expected_updated_at, replacement_json, reason)
archive_senior_context(command_id, senior_id, store, context_id, expected_updated_at, reason)
```

Automatic writes are service-role only. Correction/archive require trusted
`demo_admin` metadata and `trustkaki_private.can_access_senior`. Bind command
IDs to actor plus normalized payload using the existing private keyed-digest
pattern. Replays return the prior result; changed replays fail. Stale expected
versions raise a conflict before any state or event write.

- [x] **Step 5: Update generated-equivalent TypeScript database types and run checks**

Run: `npm test -- src/lib/security/gate5MemoryMigration.test.ts && npm run typecheck`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add supabase/migrations src/lib/security/gate5MemoryMigration.test.ts src/lib/supabase/types.ts
git commit -m "feat: add auditable senior context lifecycle"
```

### Task 3: Context Memory Agent and conditional orchestration

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/agents/contracts.ts`
- Modify: `src/lib/agents/schemas.ts`
- Modify: `src/lib/agents/prompts.ts`
- Modify: `src/lib/agents/prompts.test.ts`
- Modify: `src/lib/agents/fallbacks.ts`
- Modify: `src/lib/agents/orchestrator.ts`
- Modify: `src/lib/agents/orchestrator.test.ts`

- [x] **Step 1: Write failing schema, prompt, and routing tests**

Prove a separate `context_memory` agent contract, exact evidence fields,
closed tags, safe empty fallback, invocation for “I prefer voice calls in
Mandarin,” and no invocation for “Okay thank you.”

```ts
expect(result.traces.map((trace) => trace.agentId)).toContain("context_memory");
expect(greetingResult.traces.map((trace) => trace.agentId))
  .not.toContain("context_memory");
expect(contextMemoryOutputSchema.safeParse({ candidates: [] }).success).toBe(true);
```

- [x] **Step 2: Run tests and verify RED**

Run: `npm test -- src/lib/agents/prompts.test.ts src/lib/agents/orchestrator.test.ts`
Expected: FAIL because `context_memory` is not defined or routed.

- [x] **Step 3: Add the specialist prompt, schema, fallback, and runner**

The prompt must request candidates only, require an exact excerpt, forbid
diagnosis/credentials, and return `{ candidates: MemoryCandidate[] }`. The
fallback returns no candidates. Add the agent through the existing shared
`runAgent` runner so latency, model, trace ID, summaries, fallback, and errors
are persisted like every other agent.

- [x] **Step 4: Add bounded deterministic invocation**

Keep orchestrator planning visible, but guard the specialist with a small local
`mayContainDurableContext(message)` function. Run when either the validated plan
requests it or the message contains durable-context cues; skip greetings and
unchanged acknowledgements. Return eligible candidates internally without
including hidden reasoning or raw provider output in the API response.

- [x] **Step 5: Run focused agent tests and typecheck**

Run: `npm test -- src/lib/agents/prompts.test.ts src/lib/agents/orchestrator.test.ts src/lib/agents/provider.test.ts && npm run typecheck`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/agents
git commit -m "feat: add context memory agent"
```

### Task 4: Transactional automatic persistence and live isolation

**Files:**
- Create: `src/lib/persistence/memoryRepository.ts`
- Create: `src/lib/persistence/memoryRepository.test.ts`
- Create: `src/lib/security/gate5Memory.integration.test.ts`
- Modify: `src/lib/persistence/orchestration.ts`
- Modify: `src/lib/persistence/orchestrationRepository.ts`
- Modify: `src/lib/persistence/orchestration.test.ts`
- Modify: `src/lib/persistence/trustkakiRepository.test.ts`

- [x] **Step 1: Write failing repository and orchestration tests**

Prove policy rejection causes no RPC, accepted candidates use the persisted
inbound message ID, extraction failure does not fail orchestration, and repeated
client-message delivery creates one context row/event.

```ts
expect(applyAutomaticContext).toHaveBeenCalledWith(expect.objectContaining({
  seniorId,
  sourceMessageId: persistedInboundId,
}));
expect(result.persistence.persisted).toBe(true);
expect(reply).toBeDefined();
```

- [x] **Step 2: Implement repository methods and orchestration wiring**

`memoryRepository.ts` owns only parsed RPC calls and bounded reads. After the
inbound message is upserted, map its database ID, evaluate every validated
candidate, and call `apply_automatic_senior_context`. Catch and classify memory
errors separately so signals, policy risk, briefing, and outbound reply still
persist.

- [x] **Step 3: Apply the migration through the normal workflow**

Run: `supabase db push`
Run: `supabase migration list`
Expected: local and remote Gate 5 migration versions align on the linked
TrustKaki project only.

- [x] **Step 4: Add live two-caregiver integration tests**

Create two authorized caregivers for one temporary senior plus an unrelated
caregiver/senior. Prove automatic insertion, idempotent replay, changed-payload
rejection, confirmation refresh, transactional supersession, stale correction
conflict, immutable events, shared reads, unrelated isolation, and cleanup.

- [x] **Step 5: Run focused and live tests repeatedly**

Run: `npm test -- src/lib/persistence/memoryRepository.test.ts src/lib/persistence/orchestration.test.ts src/lib/persistence/trustkakiRepository.test.ts`
Run three times: `TRUSTKAKI_RUN_LIVE_SUPABASE=1 npm test -- src/lib/security/gate5Memory.integration.test.ts`
Expected: all runs pass with no duplicate active context or events.

- [x] **Step 6: Commit**

```bash
git add src/lib/persistence src/lib/security/gate5Memory.integration.test.ts
git commit -m "feat: persist automatic senior context"
```

### Task 5: Bounded agent and Pattern Watch context consumption

**Files:**
- Modify: `src/lib/agents/contracts.ts`
- Modify: `src/lib/agents/schemas.ts`
- Modify: `src/lib/agents/prompts.ts`
- Modify: `src/lib/agents/prompts.test.ts`
- Modify: `src/lib/persistence/seniorContextRepository.ts`
- Modify: `src/lib/persistence/seniorContextRepository.test.ts`
- Modify: `src/lib/persistence/patternRepository.ts`
- Modify: `src/lib/persistence/trustkakiRepository.test.ts`

- [x] **Step 1: Write failing context-read tests**

Prove only active non-expired records are returned, at most twelve concise
items enter `knownContext`, health context is labelled non-diagnostic, and
expired records do not enter Pattern Watch evidence.

```ts
expect(context.knownContext.items).toHaveLength(12);
expect(context.knownContext.items).not.toContainEqual(expect.objectContaining({ id: "expired" }));
expect(pattern.memoryNotes).not.toContain("Archived preference");
```

- [x] **Step 2: Run tests and verify RED**

Run: `npm test -- src/lib/persistence/seniorContextRepository.test.ts src/lib/agents/prompts.test.ts src/lib/persistence/trustkakiRepository.test.ts`
Expected: FAIL because agent context lacks `knownContext` and Pattern Watch does
not enforce expiry.

- [x] **Step 3: Implement bounded server-side loading**

Load active rows with `(expires_at is null or expires_at > now)` for the one
authorized senior. Sort by importance/confidence and recency, cap the combined
bundle at twelve items and each content value at 280 characters, and expose
only type, content, safe-use notes, and application tags.

- [x] **Step 4: Add prompt labels and Pattern Watch filters**

Render separate “Preferences,” “Usual routine,” and “Observed operational
context” sections. Explicitly tell agents that context may be stale and is not
a diagnosis. Keep deterministic policy risk authoritative. Apply identical
active/expiry filters in `patternRepository.ts`.

- [x] **Step 5: Run focused tests and typecheck**

Run: `npm test -- src/lib/persistence/seniorContextRepository.test.ts src/lib/agents/prompts.test.ts src/lib/persistence/trustkakiRepository.test.ts && npm run typecheck`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/lib/agents src/lib/persistence/seniorContextRepository.ts src/lib/persistence/seniorContextRepository.test.ts src/lib/persistence/patternRepository.ts src/lib/persistence/trustkakiRepository.test.ts
git commit -m "feat: use bounded senior context"
```

### Task 6: Deterministic memory-aware proactive check-ins

**Files:**
- Modify: `src/lib/checkins/service.ts`
- Modify: `src/lib/checkins/service.test.ts`
- Modify: `src/lib/persistence/memoryRepository.ts`
- Modify: `src/lib/persistence/memoryRepository.test.ts`

- [x] **Step 1: Write failing wording tests**

Prove `concise_text` shortens the configured check-in, `gentle_one_to_one`
selects a low-pressure variant, `practical_meal_prompt` adds only the approved
fixed meal question, and arbitrary memory content never appears verbatim.

```ts
expect(personaliseCheckIn(base, ["gentle_one_to_one"])).toContain("No rush");
expect(personaliseCheckIn(base, ["practical_meal_prompt"])).toContain("managed to eat");
expect(personaliseCheckIn(base, tags)).not.toContain(rawMemoryContent);
```

- [x] **Step 2: Run the service test and verify RED**

Run: `npm test -- src/lib/checkins/service.test.ts`
Expected: FAIL because sends use only the stored template.

- [x] **Step 3: Implement pure fixed-variant selection**

Export `personaliseCheckIn(baseText, tags, stage)` as a pure function. At send
time load only active tags for the senior; make no LLM call. Preserve Gate 4
client-message IDs, send-intent handling, exactly-one retry, response windows,
and provider reconciliation unchanged.

- [x] **Step 4: Run Gate 4 regression and memory tests**

Run: `npm test -- src/lib/checkins/service.test.ts src/lib/checkins/policy.test.ts src/lib/persistence/proactiveCheckInRepository.test.ts src/lib/persistence/memoryRepository.test.ts`
Expected: PASS with existing Gate 4 timing and idempotency unchanged.

- [x] **Step 5: Commit**

```bash
git add src/lib/checkins src/lib/persistence/memoryRepository.ts src/lib/persistence/memoryRepository.test.ts
git commit -m "feat: personalise proactive check-ins safely"
```

### Task 7: Read, correction, archive, and compact admin UI

**Files:**
- Create: `src/app/api/seniors/[seniorId]/context/route.ts`
- Create: `src/app/api/seniors/[seniorId]/context/route.test.ts`
- Create: `src/app/api/admin/seniors/[seniorId]/context/route.ts`
- Create: `src/app/api/admin/seniors/[seniorId]/context/route.test.ts`
- Create: `src/components/dashboard/SeniorContextPanel.tsx`
- Create: `src/components/dashboard/SeniorContextPanel.test.ts`
- Modify: `src/lib/api/schemas.ts`
- Modify: `src/lib/api/schemas.test.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/Dashboard.tsx`

- [x] **Step 1: Write failing route and presentation tests**

Prove authorized shared reads, unrelated isolation, admin-only correction and
archive, required ten-character reason, expected-version conflict, duplicate
submission prevention, progressive disclosure, and no approval controls.

```ts
expect(memoryPanelPresentation(items, false)).toMatchObject({
  visible: true,
  canManage: false,
});
expect(renderedText).not.toMatch(/approve|provider response|confidence percentage/i);
```

- [x] **Step 2: Run focused tests and verify RED**

Run: `npm test -- 'src/app/api/seniors/[seniorId]/context/route.test.ts' 'src/app/api/admin/seniors/[seniorId]/context/route.test.ts' src/components/dashboard/SeniorContextPanel.test.ts`
Expected: FAIL because routes and panel do not exist.

- [x] **Step 3: Implement strict routes**

GET uses authenticated senior access. POST requires `demo_admin`, accepts only
`correct` or `archive`, binds `commandId`, `seniorId`, context identity,
`expectedUpdatedAt`, replacement fields, and reason, and maps stale state to
HTTP 409. Responses contain the updated read model only.

- [x] **Step 4: Implement the compact context panel**

Use one collapsed `details` section under the selected senior. Show concise
grouped context by default and source age/expiry after expansion. Admins can
correct or archive one item through a small inline form; disable controls while
saving, reuse command ID only for an identical retry, refresh after success,
and show safe retry text on failure.

- [x] **Step 5: Run focused UI/API tests, typecheck, and lint**

Run: `npm test -- 'src/app/api/seniors/[seniorId]/context/route.test.ts' 'src/app/api/admin/seniors/[seniorId]/context/route.test.ts' src/components/dashboard/SeniorContextPanel.test.ts src/lib/api/schemas.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/app/api/seniors src/app/api/admin/seniors src/components src/app/page.tsx src/lib/api
git commit -m "feat: add senior context correction controls"
```

### Task 8: Live Telegram proof, documentation, and release evidence

**Files:**
- Create: `docs/superpowers/verification/2026-07-16-gate-5-memory-operationalisation.md`
- Modify: `docs/TrustKaki_BUILD_ROADMAP.md`
- Modify: `docs/TrustKaki_CODEX_HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-07-16-gate-5-memory-operationalisation.md`

- [x] **Step 1: Run all focused Gate 5 suites**

Run all policy, agent, repository, route, UI, migration, Pattern Watch, and
Gate 4 regression tests named above.
Expected: PASS with no skipped non-live Gate 5 tests.

- [x] **Step 2: Run live Supabase tests and database checks**

Run: `TRUSTKAKI_RUN_LIVE_SUPABASE=1 npm test -- src/lib/security/gate5Memory.integration.test.ts`
Run: `supabase migration list`
Run: `supabase db lint --linked`
Run relevant Supabase security and performance advisors.
Expected: migration aligned; Gate 5 integration passes; no new actionable
security or performance finding.

- [x] **Step 3: Perform one real Telegram memory flow**

Send a durable preference from the mapped demo senior, for example “Important
messages easier for me by short text.” Verify one Context Memory Agent run, one
active sourced record, and no approval step. Send a later care message and
verify the senior-facing reply uses the preference without changing
policy-authoritative risk. Refresh the app and verify persistence.

- [x] **Step 4: Verify correction, shared visibility, and isolation**

Correct or archive the extracted item through the admin panel with a reason.
Verify immutable history, refresh survival, shared visibility for a second
authorized caregiver, unrelated-caregiver denial, and no raw provider data or
secret exposure.

- [x] **Step 5: Run complete validation**

Run: `npm run validate`
Expected: all Vitest tests, TypeScript, ESLint, and production build pass.

- [x] **Step 6: Inspect repository hygiene and write exact evidence**

Record commands, counts, migration version, live Telegram messages without
destinations or secrets, extracted context, later personalization, correction,
two-user evidence, advisors, limitations, and production status. Inspect the
diff and leave the unrelated `package-lock.json` change untouched.

- [x] **Step 7: Update roadmap and handoff truthfully**

Mark Gate 5 complete only if automatic extraction, later use, correction,
expiry exclusion, live Supabase evidence, live Telegram evidence, and full
validation all pass. Otherwise record the precise open evidence gap.

- [x] **Step 8: Commit the verified Gate 5 baseline**

```bash
git add docs src supabase
git commit -m "docs: verify gate 5 memory operationalisation"
```

Do not stage the unrelated `package-lock.json`. Do not push or deploy without
separate explicit approval.
