# Pinecone-hosted embedding support

<!-- documentation-context -->
> **Dated evidence / release record.** Results and operational details apply to the recorded build, scope and date. They do not establish current deployment health or supersede the public architecture guides. Start with the [documentation index](../README.md) or [current architecture](../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


Date: 15 October 2026. Scope: fictional pilot only; no production route changes.

## Implemented

- Exact `https://api.pinecone.io/embed` uses the existing Pinecone API key and
  API version `2026-07`. Other HTTPS `/embeddings` providers retain their own key
  and OpenAI-compatible transport. No arbitrary `/embed` host is accepted.
- Facts use `passage`; questions use `query`; truncation is `NONE`. Native response
  validation checks model identity, dense type, finite vectors, count, consistent
  widths and token usage. Existing cancellation/no-redirect/error rules remain.
- Native embedding batches are at most 96; external batches remain at most 100.
- Verified the dedicated `trustkaki-memory-pilot` host through its console copy
  tooltip. Filled only empty local host, endpoint, and model fields; previously
  verified region/plan retained. API key, score threshold and budget remain unset.
  No secrets printed, created, copied or committed.

## Evidence

- Test-first native transport: seven failures before implementation, then passing.
- Native runner test failed on the old separate-key requirement before the fix.
- Oversized native batch test failed before local 96-input guard was added.
- Final focused memory/CLI run: **126 tests passed, five files**.
- `npm run typecheck` and `npm run lint`: passed.
- Actual `npm run benchmark:memory`: **8/8** fictional guards passed;
  semanticQualityMeasured=false and generationMeasured=false.
- Independent review: no material findings; reviewer independently ran 34 adapter/
  CLI tests. Author checked current 2026-07 protocol docs listed below.
- Full suite and production build not rerun: no production integration, dependency
  or build configuration changes in this chunk.

## Sources

- [Generate vectors API](https://docs.pinecone.io/reference/api/2026-07/inference/generate-vectors)
- [Hosted model](https://docs.pinecone.io/models/llama-text-embed-v2)
- [Hosted embedding batch limit](https://docs.pinecone.io/guides/index-data/upsert-data#upsert-in-batches)

## Pending live prerequisites

User must save an existing Pinecone key locally and specify allowed spending with
appropriate provider controls. Score calibration needs separate fictional inputs
before final evaluation. No embedding/query/upload request has run against a live
provider. No measured semantic accuracy, provider latency, cost or generation
faithfulness is claimed. No paid plan upgrade or existing-index data change.
