# Jev Final Coverage Implementation Plan

<!-- documentation-context -->
> **Historical design / evaluation record.** This document preserves the plan and decisions at its recorded stage. Proposed work and approval checkpoints are not claims about the current deployed product. Start with the [documentation index](../../README.md) or [current architecture](../../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


> **For agentic workers:** Execute inline with test-driven changes and independent code review.

**Goal:** Complete honest off/on coverage, then prepare a verified hosted Jev judge release.

**Architecture:** Extend the existing actual-orchestration runner with an explicit quality-coverage mode. Retain the old stop-on-schema protocol by default. A separate ignored directory carries all16 historical attempts and US$0.058601 reservations, pinned to exact source-ledger and diagnostic hashes. Invalid model content is a recorded quality failure, never a fabricated passing response; observe actual app fallback. Block internal model retries before transport. Other validation/transport/cost failures still stop.

**Tech Stack:** Existing TypeScript, Node, Vitest and production runtime; no new dependencies.

## Tasks

- [x] Add mocked regression coverage for schema-invalid Triage and Jev outputs:
  all20 flows remain covered, failures visible, fallback exercised, no repeated
  transport per agent/flow. Wrong model, usage, cost or transport stops.
- [x] Extend `scripts/whole-flow-shadow-live.ts` with explicit quality mode,
  hash-pinned history loading and separate artifacts. Default modes unchanged.
  Add explicit126 attempt bound (16 carried plus110 new), worst reservation
  US$0.942691 under the same cumulative US$1 cap. Update shared budget tests.
- [x] Review and verify changes; commit before the authorized paid evaluation.
  Execute once, record every failure and manually review every selected reply.
  Preserve all old ledgers and add the new artifact directory to `.gitignore`.
- [x] Resolve demonstrated product defects locally, with meaningful regression
  checks. Do not weaken response schemas or describe failed cases as passes.
- [ ] Run release validation and dependency assessment. Record exact candidate
  SHA and independent review. Prepare judge-facing model roles and limitations.
- [ ] Follow `HACKATHON_RELEASE_RUNBOOK.md` checkpoints for linked-service
  inspection, exact candidate deployment, authenticated demo/isolation checks,
  hosted model inference and promotion. The user's goal is hosted integration;
  do not claim production readiness or release completion before gates pass.

## Interpretation

Invalid JSON/schema and returned fallback are outcome failures even if the rest
of coverage completes. Missing or unverified usage/model cannot be treated as a
quality-only failure. Tiny fictional samples cannot validate clinical safety,
general superiority or latency savings. Jev remains a bounded specialist router;
Triage interprets care and deterministic policy controls risk/actions. If broad
routing does not earn its place, the existing bounded social role remains a
possible release, with the user informed of measured limitations.
