# Memory retrieval baseline — 14 October 2026

## Scope and reproduction

Eight fictional cases exercise the existing `loadAuthorizedAgentContext` loader
against an in-memory Supabase query double. The double applies requested senior,
status, expiry, ordering, and limit rules. The real loader combines and ranks the
returned rows. Time is fixed at `2026-10-14T00:00:00.000Z`.

From `trustkaki-web/`:

```bash
./node_modules/.bin/vitest run src/lib/persistence/seniorContextRepository.test.ts --reporter=verbose
```

Fixtures and reply expectations:
[`memoryCases.ts`](../../src/lib/agents/evaluation/memoryCases.ts).
Executable observations:
[`seniorContextRepository.test.ts`](../../src/lib/persistence/seniorContextRepository.test.ts).

This measures which facts reach the agent context. Fixture messages describe
retrieval intent; the current loader has no query-message input. Reply rules
specify future evaluation expectations; no reply was generated or scored.
The current model and prompt versions are therefore not applicable to this run.

## Observed results

| Case | Expected context/reply boundary | Loader observation | Target |
| --- | --- | --- | --- |
| `old_relevant_memory` | Past gardening preference available; current events unknown | Preference included | Met |
| `relevant_memory_crowded_out` | Gardening preference available for Singlish activity question | Twelve higher-importance food facts displace gardening | Gap |
| `changed_preference` | Current text preference available; superseded calls excluded | Current fact included, old fact excluded | Met |
| `expired_fact` | Expired dance preference excluded; ask current interest | Expired fact excluded | Met |
| `conflicting_active_facts` | Ask clarification; neither group preference is authoritative | Both contradictory active facts included as ordinary preferences | Gap |
| `missing_context` | No invented activity or invitation | Empty known context | Met for context only |
| `other_senior_memory` | Another senior's preference excluded | Other senior's row excluded by requested query filter | Met in query double |
| `mandarin_preference` | Mandarin gardening preference available | Preference included | Met for context only |

Six of eight cases meet context targets in this small fixture set. This is not
an overall retrieval accuracy, semantic-search, reply-quality, or safety score.
Tests pin observed missing/forbidden keys, including both known gaps, so a green
test run means baseline reproduced. When behaviour improves, update the recorded
observations and this evidence; keep required/forbidden targets intact unless the
contract deliberately changes.

Conflicting facts may eventually appear in a distinct unresolved-evidence
structure. The current ordinary-preference structure provides no such marker.
The conflict target concerns authoritative context, not erasing source evidence.

## Verification

- Focused loader suite: 18 tests passed, including eight new baseline cases.
- Related evaluation, memory repository/policy, and loader suites: 88 tests passed
  across eight files.
- `npm run typecheck`: passed.
- ESLint on both changed TypeScript files: passed.
- Existing Vite warning about redundant `vite-tsconfig-paths` remains.

## Limits and next chunk

- No live database, RLS integration, cross-organisation execution, LLM, provider,
  outbound message, production build, or deployment was exercised.
- Existing unauthorised-senior test rejects access before creating a service
  client. Mocked query isolation does not establish live tenant isolation.
- No latency, token cost, storage growth, summary quality, or conversation-history
  retrieval measurements. Fixtures cover structured memory only.
- Mandarin/Singlish cases establish context targets; they do not prove language
  understanding because this loader does not inspect the current message.
- Prompt injection and role-specific context delivery need additional evaluation;
  these cases do not assess whether agents follow retrieved instructions.

Next chunk: read-only storage and query-growth baseline. Then complete the broader
phase-1 acceptance thresholds before selecting a retrieval design. Preserve these
cases for before/after comparison as RAG and agent contracts are implemented.
