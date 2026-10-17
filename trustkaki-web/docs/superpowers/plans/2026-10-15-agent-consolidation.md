# Agent consolidation implementation plan

<!-- documentation-context -->
> **Historical design / evaluation record.** This document preserves the plan and decisions at its recorded stage. Proposed work and approval checkpoints are not claims about the current deployed product. Start with the [documentation index](../../README.md) or [current architecture](../../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


**Goal:** Implement the approved leaner conversation flow and correct memory/fallback/briefing defects without changing storage or adding a provider.

**Architecture:** Triage owns routing and the primary response, including optional grounded social suggestions. Digital Safety and Context Memory run conditionally; deterministic policy selects one senior reply before an optional Briefing. Existing standalone endpoints and historical trace identifiers remain compatible.

**Tech stack:** Next.js, TypeScript, Zod, Vitest; existing model runner.

## Tasks and verification

- [x] Update `src/lib/agents/orchestrator.test.ts`: replace router-first mocks with Triage routing, assert one call for ordinary/social messages, one reply for mixed signals, safety routing despite missed Triage routes, Mandarin durable statements and secret/small-talk exclusions. Add fallback and final-risk/uncertainty briefing assertions. Run Vitest and observe intended failures before implementation.
- [x] Update `src/lib/agents/prompts.test.ts`: require concrete schema-valid retained-role examples, conversation ownership/refusal/grounding/language rules and briefing policy input. Run and observe intended failures.
- [x] Modify `orchestrator.ts`: remove main-flow router and AAC calls; preserve Digital Safety routing using validated signals/routes plus bounded suspicious-content guards. Preserve memory validation/write semantics. Normalize Unicode and cover representative Chinese durable cues and sensitive data. Use policy to select one reply; give Briefing final risk, structured signals and analysis status. Make all fallback claims truthful.
- [x] Modify `prompts.ts`: consolidate social capability and routing into Triage; strengthen evidence, uncertainty, language and authority boundaries for retained roles. Keep legacy standalone exports compatible.
- [x] Update evaluation social expectations to require the conversation role rather than an AAC invocation; preserve all care, safety, memory and forbidden-specialist cases. Do not compare changed routing aggregates directly with historical six-role metrics.
- [x] Run focused tests; run the full `npm run validate`; run the 42-case offline benchmark. Review changed callers and messaging/persistence regression results. Record evidence and update roadmap status.

Execution note: all listed local tasks completed; validation evidence is in
`docs/evidence/2026-10-15-agent-consolidation.md`. Two independent review findings
(mixed emergency priority and Mandarin urgent delivery) were reproduced and fixed.

No paid inference, Jev/Laya installation, release promotion or external messages in this chunk. Mocked runner tests establish code behaviour, not live-model quality. A live paired evaluation remains a release gate before production consolidation; it needs a separately agreed spending cap.
