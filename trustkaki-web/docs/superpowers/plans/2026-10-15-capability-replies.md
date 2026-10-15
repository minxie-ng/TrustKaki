# Capability Replies Implementation Plan

**Goal:** Remove unsupported memory/action promises from bounded reply paths.
**Architecture:** One shared deterministic reply selector in orchestration, before
briefing and persistence; use neutral acknowledgement while save status is unknown.
**Tech stack:** Existing TypeScript, Vitest, model runner and comparison ledger.

- [ ] Add orchestrator regressions forcing English/Mandarin promises, extraction
  failure/empty results, unsupported relay/display requests, mixed care and safety
  priority. Run `vitest run src/lib/agents/orchestrator.test.ts`; observe failures.
- [ ] Add a private capability-reply helper in `src/lib/agents/orchestrator.ts`.
  Return fixed text for explicit unsupported requests or requested extraction;
  otherwise return null. Select after urgent/safety branches and before the draft.
  Attribute fixed wording to deterministic policy and pass it into Briefing.
- [ ] Run focused tests, typecheck/lint, then `npm run validate`. Commit runtime.
- [ ] Run five affected fictional cases through `scripts/agent-live-comparison.ts`
  with the existing `/tmp/trustkaki-agent-comparison-5rzcw6bg/results/budget.json`.
  Do not reset the ledger. Review actual replies and preserve versioned results.
- [ ] Record evidence, limits and roadmap state; commit. Deployment remains separate.
