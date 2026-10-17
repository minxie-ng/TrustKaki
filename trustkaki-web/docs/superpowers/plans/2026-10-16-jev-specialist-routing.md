# Jev Specialist Routing Implementation Plan

<!-- documentation-context -->
> **Historical design / evaluation record.** This document preserves the plan and decisions at its recorded stage. Proposed work and approval checkpoints are not claims about the current deployed product. Start with the [documentation index](../../README.md) or [current architecture](../../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


> **For agentic workers:** Use superpowers:executing-plans to execute sequentially in this existing feature checkout; use requesting-code-review before completion.

**Goal:** Implement the owner-approved specialist authority design with default-off rollback.

**Architecture:** Reuse the existing bounded routing request in active or shadow mode. A small pure routing combiner adds requests to independent triggers. Orchestration keeps policy, memory exclusions and final reply selection authoritative.

**Tech Stack:** Existing TypeScript, Zod, Vitest and OpenRouter fetch; no dependencies.

Approved design: `docs/superpowers/specs/2026-10-16-jev-specialist-routing-design.md`.
Keep the current `codex/personal-memory-retrieval` checkout and frozen experiment artifacts.

## Task 1: Routing decisions and transport mode

- [x] Add `src/lib/agents/specialistRouting.test.ts`: table-test each six-label
  input, absent non-veto, unclear safety, durable exclusions and care pause.
  Example: `expect(selectSpecialistRouting({...absent, digital_safety: "unclear"}, baseline, true).digitalSafety).toBe(true)`.
- [x] Run `npm run test -- src/lib/agents/specialistRouting.test.ts`; observe failure.
- [x] Add `src/lib/agents/specialistRouting.ts`: derive requested specialist IDs,
  independent trigger IDs, effective invocation booleans and care pause. Use
  `digitalSafety = baseline.digitalSafety || requested.includes("digital_safety")`
  and `contextMemory = memoryAllowed && (baseline.contextMemory || requested.includes("context_memory"))`.
- [x] Extend `routingShadow.ts` with a captured active/shadow mode and optional
  active decision metadata in traces. Active takes precedence over shadow and
  uses the same single request. Retain existing shadow output contract.
- [x] Extend `routingShadow.test.ts` for active-only enablement, both flags,
  privacy, timeout/failure and trace semantics; run focused tests to green.

## Task 2: Actual orchestration

- [x] Extend `orchestrator.test.ts` with real orchestration and mocked provider
  transports: Jev-only safety/memory/social requests; unclear and absent labels;
  independent trigger overrides; secret/recall exclusions; social flag separation;
  care discrepancy clarification; urgency/scam precedence; malformed routing
  fallback. Assert specialist invocation counts and executed trace IDs.
- [x] Run `npm run test -- src/lib/agents/orchestrator.test.ts`; observe failures.
- [x] Wire the captured active judgment after Triage and before conditional
  specialist invocation. Shadow-only mode must still wait only at the existing
  trace checkpoint. Apply the combiner once; use its safety/memory eligibility.
- [x] For Jev-requested inconclusive scam review, select cautious existing safety
  output. Social requires its own flag, effective social eligibility and all
  existing priority checks. If Jev pauses an otherwise eligible social reply
  without corresponding Triage care signals, select the approved clarification.
- [x] Append an active trace after execution with raw requested specialist IDs,
  independent triggers, exclusions/priority blocks and actual executed IDs.
  Never create care signals or severity from Jev labels.
- [x] Add default-off `TRUSTKAKI_JEV_ROUTING_ENABLED=false` to `.env.example`.
  Do not modify `.env.local`, hosted configuration, APIs or persistence.
- [x] Run the routing, orchestration and full-flow harness unit tests to green.

## Task 3: Verification, review and evidence

- [x] Run full `npm run test` (localhost test-server access), then
  `npm run typecheck`, `npm run lint`, `npm run build`. All must exit zero.
- [x] Request independent review of the diff against `c2a398d`; address material
  findings with regression cases. No live providers, database or deployment.
- [x] Save actual results, mode/authority boundaries, remaining live checks and
  rollback in an evidence document; update the active roadmap.
- [x] Run `git diff --check`, commit locally and report what is verified versus
  still unshipped. Preserve historical experiment budgets and hashes.
