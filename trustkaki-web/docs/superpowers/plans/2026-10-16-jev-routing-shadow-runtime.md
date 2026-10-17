# Jev Routing Shadow Implementation Plan

<!-- documentation-context -->
> **Historical design / evaluation record.** This document preserves the plan and decisions at its recorded stage. Proposed work and approval checkpoints are not claims about the current deployed product. Start with the [documentation index](../../README.md) or [current architecture](../../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Observe Jev's six routing judgments during normal orchestration without changing any care outcome.

**Architecture:** Reuse the frozen screening contract in a shared module. Start
one optional, bounded Jev request alongside Triage; append a comparison trace
after the existing flow finishes. Keep the flag off by default and preserve all
existing routing, replies, policy, memory proposals and caregiver trace access.

**Tech Stack:** Existing TypeScript, Zod, fetch, Vitest and Next.js; no dependencies or migrations.

The owner approved proceeding with this shadow slice. Immediate replacement was
rejected in the accepted assessment design. A second always-on classifier would
add cost; an opt-in shadow observation is the selected reversible first step.
Paid full-flow evaluation, hosted configuration and release are later checkpoints.

## Task 1: Shared contract and bounded observer

Files: create `src/lib/agents/routingContract.ts`,
`src/lib/agents/routingShadow.ts`, `src/lib/agents/routingShadow.test.ts`;
modify `src/lib/agents/evaluation/routingShadow.ts` to re-export shared symbols.

- [x] Add failing tests for disabled/no-key/oversized-input request suppression,
  all-six success, malformed output, upstream failure and three-second timeout.
  Use `vi.stubGlobal("fetch", request)`; assert at most one request and
  `request.mock.calls[0][1].redirect === "error"`.
- [x] Move the existing request, parser, six-label types and Triage adapter into
  the shared contract without changing their behavior. Preserve evaluation exports
  and the recorded dataset hash.
- [x] Implement `runJevRoutingShadow(message, context)` with exact server-only
  `TRUSTKAKI_JEV_ROUTING_SHADOW_ENABLED=true` opt-in, existing OpenRouter key and
  endpoint, three-second abort and no retry. Return null when disabled; otherwise
  return validated decisions or a fixed sanitized error with model `none`.
- [x] Implement `routingShadowTrace(observation, triageResult)` using existing
  `orchestrator` trace identity. Compare only validated non-fallback Triage data;
  unavailable baseline is null. Persist labels, differences, usage, model and
  timings, never message/context/prompt/provider errors. State changes stay empty.
  Summary explicitly says shadow-only and describes all six labels.
- [x] Run `npm run test -- src/lib/agents/routingShadow.test.ts src/lib/agents/evaluation/routingShadow.test.ts`.

## Task 2: Whole-flow noninterference

Files: modify `src/lib/agents/orchestrator.ts`,
`src/lib/agents/orchestrator.test.ts`, `.env.example`.

- [x] Add paired enabled/disabled tests for urgent/scam overlap, mixed care and
  preference, memory recall, ambiguous message, Triage fallback and Jev failure.
  Assert equality of messages, signals, policy, briefing and internal memory
  candidates, plus identical specialist call IDs and prompts; only the added
  shadow trace may differ. Use deliberately opposing Jev judgments.
- [x] Start the observer before Triage and await it only when appending its trace
  after briefing; never pass its output into policy, specialist gates or replies.
- [x] Add `TRUSTKAKI_JEV_ROUTING_SHADOW_ENABLED=false` to the template with its
  shadow-only scope and approval/cost note. Do not change local or hosted secrets.
- [x] Run the focused orchestration and observer tests, then the full test suite,
  typecheck, lint and production build. No real model calls in these checks.

## Task 3: Evidence and handoff

Files: update `docs/TrustKaki_BUILD_ROADMAP.md`; add bounded evidence under `docs/evidence/`.

- [x] Record actual check results and limitations: disabled by default; fictional
  mocked whole-flow checks do not prove live end-to-end quality, latency or cost.
- [x] State the next checkpoint as separately scoped paid whole-flow evaluation,
  followed by any proposed release. Do not advertise runtime routing authority.
