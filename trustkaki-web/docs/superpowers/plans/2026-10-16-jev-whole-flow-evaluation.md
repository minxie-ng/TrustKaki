# Jev Whole-Flow Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Prepare a separately capped fictional comparison of actual orchestration with routing shadow disabled and enabled.

**Architecture:** A CLI-only harness calls the actual orchestrator with supplied
fictional context. A temporary fetch guard permits only the two priced provider
endpoints, persists reservations before calls, validates outputs and blocks any
retry. Existing routing and model prompts remain unchanged. No database imports,
app endpoints, real messages or hosted configuration changes are needed.

**Tech Stack:** Existing Node, TypeScript, Zod and Vitest; no dependencies.

## Scope and alternatives

The owner approved preparation after the local shadow integration. A second
classification-only benchmark would not measure the complete flow. Calling app
endpoints would unnecessarily involve persistence. Therefore call actual
orchestration directly, supplying fictional memory evidence in the same envelope
the runtime consumes. This measures use of supplied memory, not live retrieval.
Baseline runs first, then shadow, per scenario. Separate model generations can
differ; offline paired tests establish noninterference, while this small live
screen measures functionality, fallback, successful-call costs and wall time.

## Tasks

- [x] Create `scripts/whole-flow-shadow-cases.ts`: six fictional cases covering
  urgent/scam overlap, mixed care/preferences, grounded memory recall, ambiguous
  input, social refusal and unavailable memory, in English/Mandarin/Singlish.
  Supply no credentials, real identities or database references.
- [x] Add failing `scripts/whole-flow-shadow-live.test.ts` tests for missing
  authorization/key/price gates, budget-before-network, endpoint restriction,
  a completed run, stopped/partial ledger refusal, sanitized failure and blocked
  internal agent retries. Mock transport; exercise actual orchestration.
- [x] Implement `scripts/whole-flow-shadow-live.ts` with exact US$1 approval and
  price gates; pinned GPT-4o-mini and Jev 1.14; exclusive directory lock; frozen
  corpus/prompt/source hashes; atomic reservations; 66-attempt maximum. The plan
  bounds four OpenAI agent calls and one social call per flow, plus one routing
  observation for each shadow flow. Default agent retries must never produce
  another network attempt. Full-plan maximum fits US$1 before any request.
- [x] Restrict OpenAI request bodies to 40,000 UTF-8 bytes and 1,024 output tokens;
  Jev uses the existing full-context reservation. Validate exact prompt identity,
  model, usage and schema before passing a response to the app. Retain failed
  reservations. Stop on HTTP, timeout, invalid response, duplicate agent call,
  unexpected network target or application fallback. Never auto-resume a partial
  run. Restore fetch, console and environment after completion/failure.
- [x] Persist only fictional selected replies, bounded care outcomes, checks,
  model/usage/cost metadata and shadow labels in ignored artifacts. Do not save
  raw prompts, provider bodies, keys or exception prose. Treat reply checks as
  screening, with human review still required. Report whole-flow costs and wall
  time without promising savings from shadow mode.
- [x] Run focused mocked tests, typecheck, lint and independent review. Record
  offline reservation preflight, protocol hash, scope, limitations and command.
  The reviewed runner is now concrete; separate execution approval remains pending.

## Execution boundary

Preparation performs zero paid calls. An eventual run needs separate US$1
approval and current official price verification. There are no automatic retry
amendments. All existing providers keep their production settings; pinned test
settings are temporary process state in this standalone CLI only. Runtime
authority, hosted configuration, deployment and promotion remain separate work.
