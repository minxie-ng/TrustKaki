# Personal Memory Retrieval Implementation Plan

> Execute inline using executing-plans; independent code review before completion.

**Goal:** Implement the approved, isolated retrieval slice and a fictional pilot.

**Architecture:** Resolve trusted senior/organisation scope before embedding;
search a bounded candidate set, validate against current source records, and
serialize selected evidence within a fixed budget. Production loaders stay on
their current path until a separate storage migration and cutover.

**Tech Stack:** TypeScript, existing Zod/Vitest/tsx, native fetch/AbortController.
One required direct dependency: `server-only@0.0.1` for standalone Node imports.
No new framework, product agent, database migration, or deployment.

## 1. Retrieval core

- [x] Add `src/lib/memory/retrieval.test.ts` with a provider double and fixed time.
  Assert relevant old gardening selection, current-source version checks,
  organisation/senior isolation, explicit conflict exclusion, expiry boundary,
  missing/malformed inputs, bounded calls/context, and a two-second abort.
- [x] Run `npm run test -- src/lib/memory/retrieval.test.ts`; observe missing
  implementation, then implement `retrieval.ts` and `retrievalContracts.ts`.
- [x] Validate source metadata and hit IDs separately. Fetch only scoped IDs;
  check authoritative source status, scope, revision, expiry, and conflict state.
  Do not trust indexed content or arbitrary provider error messages.
- [x] Repeat focused tests and TypeScript until passing.

## 2. Fictional evaluation and opt-in provider pilot

- [x] Preserve the eight legacy baseline cases. Add `memoryRetrievalCases.ts`
  with current records, explicit conflict metadata, ten questions per language,
  and 1,000 distractors for an independent semantic pilot.
- [x] Add transport tests first for Pinecone scoped filters/version metadata,
  embedding response validation, abort propagation, and non-disclosing failures.
- [x] Implement `src/lib/memory/pineconePilot.ts` using native fetch, the documented
  Pinecone 2026-07 query/upsert APIs, and a separate embedding configuration.
- [x] Add `scripts/memory-retrieval-evaluation.ts`: deterministic default;
  external mode requires explicit confirmation, a declared budget with a provider-enforced spending cap, and an existing
  isolated index. Upload generated fictional fixtures only. Never read senior
  data, overwrite a production namespace, create resources, or delete records.
- [x] Add package commands and command tests for network opt-in. Report local
  guard results separately from semantic Recall@6, latency, and cost evidence.

## 3. Verify and explain

- [x] Run focused retrieval/transport/CLI tests, existing loader baseline tests,
  TypeScript, lint, and the full local suite. Build verified the new direct server-only dependency.
- [x] Request independent code review; fix material findings and retest.
- [x] Record measured results and unrun gates in evidence and the roadmap.
- [x] Write `docs/PERSONAL_MEMORY_RAG_GUIDE.md` covering a worked gardening
  example, storage vs retrieval vs generation, tools, safeguards, portability,
  growth/cost limits, and what judges can and cannot claim today.
- [x] Commit implementation and documentation; report exact verified scope.
