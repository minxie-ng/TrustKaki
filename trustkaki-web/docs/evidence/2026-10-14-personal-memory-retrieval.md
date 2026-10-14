# Isolated personal-memory retrieval evidence

Date: 14 October 2026. Branch: `codex/personal-memory-retrieval`.
Approved scope: [retrieval design](../superpowers/specs/2026-10-14-personal-memory-retrieval-design.md).
Explanation: [architecture and presentation guide](../PERSONAL_MEMORY_RAG_GUIDE.md).

## Changes

- Added server-only, provider-independent retrieval and Zod source/search contracts.
- Resolves trusted scope before embedding; revalidates current canonical source
  scope, revision, status, confirmation time, expiry, and explicit conflicts.
- Bounds query, search candidates (20), selected facts (6), fact/evidence content
  (280 Unicode code points each), JSON context (4,000), and total deadline (2s).
- Added Pinecone 2026-07 HTTP adapter, fictional-only upload allowlist, isolated
  namespace, finite-vector validation, no redirects/retries, sanitized errors.
- Added deterministic evaluation and opt-in semantic pilot: 1,007 fictional
  records, including 1,000 distractors and superseded/expired records; 30 questions
  in English/Mandarin/Singlish; mandatory gardening/correction success.
- Added only `server-only@0.0.1` as a direct dependency. The standalone Node
  benchmark initially could not resolve Next's implicit marker; installing it
  preserved the server-only boundary without custom module loaders.
- Updated roadmap and judge presentation guide.

## Verification

| Check | Observed result |
| --- | --- |
| Full `npm run test` | 888 passed, 38 skipped, 127 files passed / 5 skipped. |
| Final focused memory/CLI tests | 116 passed across five files, including one test added after the full run. |
| `npm run typecheck` | Passed after final TypeScript changes. |
| `npm run lint` | Passed after final TypeScript changes. |
| `npm run build` | Passed; optimized Next.js 16.4.0 build. |
| `npm audit --omit=dev --json` | Zero reported vulnerabilities across severities. |
| Actual `npm run benchmark:memory` | Eight of eight guard cases passed; semanticQualityMeasured=false; generationMeasured=false. |
| Actual CLI `--mode live` without confirmations | Rejected before external setup with expected confirmation error. |
| Independent review | Two findings fixed; follow-up found no remaining material issues; independently ran 70 focused tests. |

The initial full-suite sandbox run failed ten existing release-smoke tests because
binding `127.0.0.1` was denied. The authorised loopback rerun passed. The complete
suite was not rerun after adding the final CLI correction-gate assertion; that
assertion and all other focused memory tests passed together. Its TypeScript and
lint checks also passed. No application code changed after the successful build.

Test doubles exercise the entire opt-in branch, including index batching/readiness,
30 query reports, rejection of forbidden distractors, and rejection of one missing
correction even when language recall remains 90%. Those runs print fictional
namespace identifiers but make no network calls and upload nothing.

Test-first evidence: core stub initially failed 24 tests; adapter stub failed
8 tests. Implementations passed their focused checks. A later escaped-conflict
case produced a 6,169-code-point envelope; bounding reported conflict metadata
while retaining the full exclusion set fixed it within 4,000. Tests also cover
unknown/out-of-scope sources, version mismatch, expiry boundary, future records,
uncooperative deadlines, and instruction-like evidence labels.

## Unrun / not claimed

- No external embedding or Pinecone calls, index/account creation, credential
  retrieval, senior-data upload, deployment, migration, or production loader change.
- No measured live Recall@6, provider p95, monetary cost, load capacity, or chat
  faithfulness. Deterministic ranks use expected labels; passing is not evidence
  of semantic quality. The injection test checks data labelling, not LLM behaviour.
- No durable external source store, ingestion writer, live deletion/recovery
  validation, or Supabase-memory retirement. Production still uses its existing
  memory backend during the transition.
- Live upload budget is declared, not enforced in script. Provider-side budget
  controls and an isolated, correctly dimensioned cosine index are prerequisites.
  Namespace counts do not guarantee immediate search freshness.
- Pinecone is a candidate index. Choosing authoritative external memory storage
  and validating lifecycle/portability remain separate decisions.

## Next bounded chunk

Configure an isolated fictional index and an embedding model, document region,
plan and provider spending limits, run the live multilingual gate, and inspect
failures. Then select durable external source storage and plan ingestion/migration
before production integration. Do not silently turn a passing local guard test
into a production memory cutover.
