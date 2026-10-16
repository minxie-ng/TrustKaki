# Jev Social Decision Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans. User approved normal-chat integration; no further design checkpoint is needed.

**Goal:** Make Jev select bounded social-support behavior in ordinary chat with honest demo traces.
**Architecture:** Extract the evaluated three-label contract from its fictional dataset. Add a server-side, one-request Jev decision helper using the existing AAC result/trace type. Wire it after authoritative policy and before reply selection, preserving care, scam and capability priority.
**Tech Stack:** Next.js Node runtime, native fetch, Zod, Vitest; no new dependency or database schema.

### 1. Shared contract and provider
- [x] Add `src/lib/agents/socialDecision.test.ts`: valid Jev choice controls reply; missing key, timeout, HTTP failure, invalid model/distribution and overlong input produce no-suggestion fallback, with no retry or raw errors.
- [x] Run `npm run test -- src/lib/agents/socialDecision.test.ts`; expect missing module before implementation.
- [x] Move request/parser definitions to `socialIntentContract.ts`; re-export from evaluation module so dataset hash and benchmark callers remain unchanged.
- [x] Implement `runJevSocialDecision(message)` in `socialDecision.ts` with fixed OpenRouter endpoint/model, 3-second abort, redirects disabled, and existing AAC trace fields. Runtime imports no dataset.
- [x] Run provider and existing evaluation/budget tests; expect pass.

### 2. Orchestration
- [x] Add enabled-feature tests to `orchestrator.test.ts` for all labels, honest fallback, unrelated-message skip, and care/scam/capability priority.
- [x] Invoke Jev only when explicitly enabled and social routing/activity cues qualify; do not override health/daily-living or capability replies. Use one selected reply, existing AAC trace and final policy risk.
- [x] Reuse helper for enabled standalone AAC calls; keep disabled mode unchanged.
- [x] Update standalone AAC GET metadata with enabled/configured/model values, never secrets.
- [x] Run focused orchestration/route tests; expect pass and no live network calls.

### 3. Configuration, demonstration and verification
- [x] Document server-only `OPENROUTER_API_KEY` and `TRUSTKAKI_JEV_ENABLED=false` in env template; enable local configuration after mocked checks.
- [x] Document English/Mandarin demonstration messages, real model/label in Run details, honest fallback, and local-versus-production status.
- [x] Run focused tests, typecheck, targeted lint and `npm run build`; record outputs and limits.
- [x] Update roadmap and design status. Hosted configuration, paid live integration checks and deployment remain separate approved checkpoints.
