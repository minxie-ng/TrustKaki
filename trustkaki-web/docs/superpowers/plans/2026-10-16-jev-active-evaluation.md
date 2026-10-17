# Active Jev Evaluation Preparation Plan

<!-- documentation-context -->
> **Historical design / evaluation record.** This document preserves the plan and decisions at its recorded stage. Proposed work and approval checkpoints are not claims about the current deployed product. Start with the [documentation index](../../README.md) or [current architecture](../../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


> **For agentic workers:** Execute inline using existing test-driven-development and requesting-code-review workflows.

**Goal:** Prepare a separately capped fictional baseline/active-routing comparison without making paid requests.

**Architecture:** Extend the existing whole-flow runner with a fixed active experiment, separate artifacts and protocol hash. Reuse reservations, transport validation, stop/lock rules and actual orchestration. Keep the old shadow mode available and unchanged in scope.

**Tech Stack:** Existing Node, TypeScript and Vitest; no new dependencies.

## Scope

Ten fictional scenarios, baseline then active for each: 20 full flows. Six earlier
reply/care scenarios plus implicit scam, indirect communication preference,
benign recipe discussion and context-dependent social interest. Maximum four
OpenAI agents and one social request per flow, plus ten active routing requests:
**110 attempts**. A separate US$1 cap; prior approvals do not authorize execution.

## Tasks

- [x] Add `scripts/whole-flow-active-cases.ts` with ten fixed fictional contexts
  and lightweight checks. Reuse earlier six cases; add only four new cases.
  Explicitly distinguish supplied RAG evidence from live database retrieval.
- [x] Add `scripts/whole-flow-active-live.test.ts` before implementation. Assert
  `wholeFlowPreflight("active").maxAttempts === 110`, reservation below US$1,
  distinct protocol hashes, mode isolation/restoration, actual invoked-specialist
  evidence, no keys in artifacts, stopped ledger refusal and no retries.
- [x] Run the new suite and observe missing active-mode failures. Extend
  `whole-flow-shadow-live.ts` with `experiment: "active"`, fixed mode switching,
  active trace and outcome fields, and active CLI/artifact directory. Retain
  existing default shadow behavior and failed/completed-ledger protection.
- [x] Permit the explicit 110-attempt budget only when passed by this plan;
  preserve the older default 72 and historical 73/74 retry bounds. Add a budget
  test proving default calls still stop at 72 and explicit 110 stops at 110.
- [x] Add the new artifact directory to root `.gitignore`. Run all related
  harness/budget tests, typecheck and targeted lint. No runtime code changes.
- [x] Request independent review. Resolve material findings, record the exact
  source hash, maximum reservation, safeguards and limits. Check current official
  provider prices using public read-only sources; never read or transmit keys.
- [x] Update the roadmap and commit the preparation. Then request separate
  approval for this exact live scope. Do not execute paid requests or reuse any
  historical spending ledger during preparation.

## Faults and interpretation

Provider failures stop the paid runner. Runtime fallback is tested with mocked
faults locally; do not deliberately create billable failures or hide them as
successful live results. Report automated-check failures without retrying.
Review every selected fictional reply after a completed run. Report Jev-caused
invocations separately from independent triggers; no useful extra invocation is
a possible outcome. Tiny paired samples cannot establish clinical safety or
general superiority, and active mode adds a call rather than removing Triage.
