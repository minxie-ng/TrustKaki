# Personal memory RAG: implementation and presentation guide

Updated: 15 October 2026. Status: isolated retrieval locally verified; first fictional live pilot passed.

## What exists today

The application now has a server-only retrieval module, validated contracts,
fictional evaluation data, and an opt-in Pinecone pilot. No application route or
production agent calls this module yet. Existing production personal-memory
reads/writes still use Supabase during this transition. This is not a completed
migration or a deployed semantic-memory feature.

The approved destination is external personal memory. Supabase remains responsible
for operational care data, authentication, access relationships, messages, cases,
and schedules. The durable external source-record store has not been selected.
Pinecone is a candidate search index with a passing first fictional pilot, not the chosen authoritative memory store.

## The three different pieces

1. **Storage** keeps confirmed facts and summaries, source references, timestamps,
   revisions, expiry, corrections, and deletion state. It must support export,
   recovery, access control, and lifecycle changes.
2. **Retrieval** finds facts relevant to the current message and validates them
   against current source records. RAG means retrieval-augmented generation; it
   does not mean replacing storage with an algorithm.
3. **Generation** gives selected evidence to a chat model to compose a reply.
   The isolated implementation currently covers retrieval. Generation wiring and
   response-faithfulness evaluation remain open.

## Worked example: an older gardening preference

A senior said months ago: “I enjoy gardening at the community centre.” Later
messages discuss meals, television, and appointments. A recency-based loader may
push gardening out of its limited context. A semantic index can match a new
question such as “Do I like growing plants?” to the gardening fact even though
its words differ and the fact is old.

The implemented retrieval sequence is:

1. Validate the senior ID, query, and current time. The caller must supply time
   from the server, not from user-controlled request metadata.
2. Resolve organisation and senior scope from trusted server authentication or
   verified channel identity. Refuse access before embedding if resolution fails.
   The module requires this resolver; the current pilot uses a fictional identity.
3. Turn the current query into an **embedding**, a numeric representation of
   meaning. This is a separate model call from composing a chat reply.
4. Search at most 20 candidate vectors within that organisation and senior scope.
   The Pinecone pilot also filters active status, expiry, and embedding model.
5. Load current canonical records for matching IDs. Recheck scope, active status,
   expiry, confirmation time, and matching source/index/current revisions.
   Index metadata is not authoritative enough on its own.
6. Remove explicitly unresolved conflict groups. Two current facts in one
   exclusive conflict group also cause exclusion. This needs maintained metadata;
   it does not infer arbitrary contradictions from natural language.
7. Return at most six whole facts, each content/evidence excerpt at most 280
   Unicode code points, inside a JSON context budget of 4,000 code points including
   provenance and conflict reporting. Oversized facts are omitted, not cut mid-sentence.
   Conflict reporting is bounded separately while all conflicted facts remain
   excluded; diagnostics retain the total unresolved group count.
8. Label the JSON as untrusted evidence, not instructions. A future agent
   integration will consume it under its system prompt and output contract.
   This label alone does not prove resistance to prompt injection.

The entire retrieval call has a two-second deadline with cancellation and no
query retries. Invalid provider output or timeouts return an unavailable result,
without exposing provider error bodies. There is no legacy-memory fallback in
this new module. Handling unavailable memory in the final reply remains part of
agent integration.

Gardening memory establishes a personal interest. It does **not** establish that
an activity is currently available. A future community-event capability needs a
separate, current event source before offering an actual invitation.

## Tools and their jobs

| Tool | Role in this implementation |
| --- | --- |
| TypeScript | Retrieval logic and explicit provider/source contracts. |
| Zod | Validates source records, search hits, vectors, and API response shapes. |
| Native `fetch` and `AbortController` | Provider HTTP calls, deadline cancellation, redirect refusal. |
| Embedding API | Converts fictional facts and questions into numeric vectors in live pilot mode. Provider/model remains configurable. |
| Pinecone candidate index | Stores/searches vectors and scope/version metadata. The pilot does not store raw fact text in Pinecone metadata. |
| Vitest | Tests isolation, lifecycle rules, budgets, failure handling, API transport, and evaluation gates with local doubles. |
| `tsx` | Runs the TypeScript evaluation command. |
| `server-only` | Prevents accidental client imports. Added as a direct dependency because the standalone Node command needs it. |
| Supabase | Existing operational store and transitional production memory; not accessed by this fictional pilot. |

No LangChain, new runtime agent, or MCP dependency was added. MCP is a way to
connect tools; semantic search here uses direct HTTP APIs. Development tools used
were repository reads/edits, shell commands, local tests/build, documentation
lookup, and independent code review. Development review agents are unrelated to
the application's six product agent roles.

The adapter follows Pinecone's official
[query](https://docs.pinecone.io/reference/api/2026-07/data-plane/query),
[upsert](https://docs.pinecone.io/reference/api/2026-07/data-plane/upsert), and
[index stats](https://docs.pinecone.io/reference/api/2026-07/data-plane/describeindexstats)
contracts, pinned to API version `2026-07`.

## How facts enter the index — pilot versus future production

In the pilot, a generated local fixture set is canonical: five relevant facts,
one superseded contact preference, one expired fact, and 1,000 distractors.
The current contact preference is revision 2; the previous preference is superseded.
The script embeds fixture content in batches of at most 96 for Pinecone-hosted embeddings (100 for compatible external providers) and uploads only
records exactly matching this allowlist into a fresh fictional namespace. Raw
text is sent to the configured embedding provider. Embeddings and metadata are
sent to Pinecone. Uploaded vectors remain there until separately cleaned up.

Production ingestion is not implemented in this chunk. Its design must cover
which facts may be saved, confirmation/confidence rules, deduplication, summaries,
revision changes, idempotent indexing, deletion propagation, backup/export, and
reindexing after embedding-model changes. There must be one authoritative writer
at cutover, with migration verification and rollback. No dual writer is introduced
here.

## Evaluate without external calls

From `trustkaki-web/`:

```sh
npm run benchmark:memory
```

This executes eight original fictional memory cases with predetermined relevant
rankings. It checks retrieval rules and target preservation. Passing **does not
measure semantic accuracy**: the local ranks already know the expected answer.
It also does not call a chat model or measure response faithfulness.

## Calibrate before evaluating

The native Pinecone calibration command uses 1,005 active fictional source facts,
15 separate target questions (five topics in three languages), and five unrelated
questions. It embeds the corpus and questions without writing to the index, then
computes exact cosine similarity locally. If every target score exceeds every
forbidden score, the midpoint defines a candidate threshold; otherwise calibration
fails. Final evaluation questions must not be used to tune the threshold.

```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/memory-calibration.ts --confirm-live --confirm-provider-budget
```

This command calls the embedding provider and consumes quota. It supports the
configured native Pinecone model and requires a positive declared budget and
Starter plan. Verify the actual plan in the console; environment declarations do
not enforce billing controls. The current Starter plan is free and rejects monthly
quota overages rather than automatically upgrading. See
[Pinecone's rate limits](https://docs.pinecone.io/reference/api/database-limits/rate-limits).

Calibration is a tiny development set. It uses the same five positive facts as
the evaluation with different question wording. The 1,000 distractors repeat an
inventory-note template; harder, diverse distractors and a larger independent set
are needed before making broad semantic-quality claims.

## Live pilot: first run passed

On 15 October 2026, the native Pinecone/`llama-text-embed-v2` pilot passed all
configured gates using cutoff **0.200106996389696**, frozen from a separate
20-question calibration. Required facts were retrieved for **10/10 English,
10/10 Mandarin, and 10/10 Singlish** questions. Forbidden facts and unavailable
queries were both zero; nearest-rank p95 retrieval latency was **986ms** across
30 sequential queries. All gardening and contact-correction questions passed.

The run indexed 1,007 fictional vectors in the dedicated pilot index. It used
20,498 embedding tokens and 30 reported query read units; separate calibration
used 20,440 embedding tokens without index writes. Starter/free plan was verified
in the console; no paid upgrade was made. Dollar billing was not reconciled.
See [raw reports and interpretation](evidence/2026-10-15-memory-live-pilot.md).

This is one small synthetic run. No chat generation, load test, durable external
source store, production migration, or full live lifecycle validation is claimed.

### Re-running the pilot

Live mode requires an existing, isolated Pinecone index, appropriate permissions,
and an explicitly selected embedding model. Index vector dimensions and cosine
metric must match the embedding model. Verify provider region, account plan,
retention terms, and a provider-enforced spending limit before running.

Configure these through your normal local secret-management process; never paste
API keys into chat or commit them:

```text
TRUSTKAKI_MEMORY_PINECONE_PILOT_HOST
TRUSTKAKI_MEMORY_PINECONE_API_KEY
TRUSTKAKI_MEMORY_EMBEDDING_ENDPOINT
TRUSTKAKI_MEMORY_EMBEDDING_API_KEY
TRUSTKAKI_MEMORY_EMBEDDING_MODEL
TRUSTKAKI_MEMORY_PILOT_MIN_SCORE
TRUSTKAKI_MEMORY_PILOT_REGION
TRUSTKAKI_MEMORY_PILOT_PLAN
TRUSTKAKI_MEMORY_PILOT_BUDGET_USD
```

### Local configuration

The environment template includes all pilot settings. If `.env.local` does
not exist, copy `.env.example` to `.env.local`, then fill only the pilot section.
Preserve existing `.env.local` contents if that file already exists. Git ignores
`.env.local`; `.env.example` must contain placeholders only. Keep API keys in
server-side variables, never `NEXT_PUBLIC_*` variables.

The standalone benchmark does not automatically load Next.js environment files.
If the variables are in `.env.local`, use this command from `trustkaki-web/` with
the installed Node 24 runtime (only after account/index/budget setup is complete):

```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/memory-retrieval-evaluation.ts --mode live --confirm-live --confirm-provider-budget
```

The `npm run` command below is for variables already exported into the shell.
A chat-model API key or model name does not automatically establish embedding
support; choose an embedding endpoint and model explicitly. An index host is the
data-plane HTTPS host, not the Pinecone dashboard URL. Record the index's actual
region and plan. Do not guess these values to bypass configuration checks.

Two embedding formats are supported:

- **Pinecone native:** exact endpoint `https://api.pinecone.io/embed`, model
  `llama-text-embed-v2` for the dedicated 1,024-dimensional index. It uses
  `TRUSTKAKI_MEMORY_PINECONE_API_KEY`; leave the separate embedding key blank.
  Saved facts use `passage` mode; questions use `query` mode. Batches are limited
  to 96 inputs and truncation is disabled so oversized inputs fail explicitly.
- **External provider:** HTTPS `/embeddings` endpoint with a separate embedding
  key, OpenAI-compatible response format, configured model identity, and token
  usage. A different model alias requires deliberate validation changes.

The native request/response follows Pinecone's
[Generate vectors API](https://docs.pinecone.io/reference/api/2026-07/inference/generate-vectors).
[Pinecone's batching guide](https://docs.pinecone.io/guides/index-data/upsert-data#upsert-in-batches)
explains the hosted embedding model limit. Both formats preserve model/count/
finite-vector/width/usage validation, cancellation, and sanitized provider errors.

Choose/calibrate the score threshold separately from final evaluation; do not
quietly tune on failing evaluation questions and report them as independent data.

```sh
npm run benchmark:memory -- --mode live --confirm-live --confirm-provider-budget
```

The declared dollar budget is recorded, **not enforced by the script**. A provider
account limit is required. The script creates no account/index or paid resource;
it will incur embedding, vector-write, query, and storage usage on configured
accounts. The script prints its new namespace for later manual cleanup and never
deletes records. Namespace counts are a readiness check, not a strong guarantee
of query freshness. No result should be accepted if indexing visibility is unclear.

The pilot queries ten English, ten Mandarin, and ten Singlish questions against
1,007 fictional records. Gates: Recall@6 at least 90% separately per language;
every gardening and contact-correction question passes; zero forbidden selections
(old/expired facts or distractors); no unavailable queries; retrieval p95 at most
1,500ms. Since each question has one required target, Recall@6 is the fraction of
questions whose required fact appears among at most six returned facts. p95 uses
nearest-rank over 30 sequential retrievals and excludes index seeding time.

Reports include model, dataset, declared region/plan, token/read-unit/vector counts,
latency, and per-case outcomes. Dollar cost must be reconciled with provider
billing. These 30 questions are a small synthetic gate, not proof of broad
multilingual quality or real-world scale. Concurrent load, full live lifecycle,
chat faithfulness, prompt injection behaviour, and real-user usefulness remain
separate gates. Offline tests exercise the full script using a fake adapter;
those are not live provider evidence.

## Why this design helps

- **Relevance:** older relevant facts can compete by meaning rather than recency.
- **Bounded prompts:** fact count and serialized context stay bounded as history
  grows. Search infrastructure and stored vectors still have their own costs.
- **Traceability:** selected facts carry evidence references, timestamps, and revisions.
- **Correction:** stale index hits are checked against current canonical records.
- **Model portability:** chat-model choice is separate from storage and embeddings.
  Changing the embedding model usually requires re-embedding/reindexing; portability
  is reduced coupling, not zero-effort vendor swapping.
- **Operational separation:** the target architecture separates personal-memory
  retrieval workloads from Supabase care workflows.

RAG does not automatically shrink databases. Summaries, retention, deduplication,
and archival control growth; embeddings add storage. The measured current growth
problem was scheduler retries, handled in the earlier rollout. Moving memory alone
would not have fixed that issue.

## A judge-ready explanation

> “We are separating personal memory from the chat model. Instead of sending an
> ever-growing history, the retrieval layer finds relevant facts within the
> senior's authorised scope, verifies their latest versions, and returns a small
> context with source references. This lets older preferences stay useful and
> makes chat-model changes easier. We have implemented the retrieval boundary
> and passed an initial fictional
> Pinecone pilot: all 30 target memories were retrieved across English, Mandarin,
> and Singlish, with zero forbidden facts and 986ms p95 latency. This is a small
> synthetic result. Durable external source storage, broader evaluation, and
> production cutover remain open; we are not claiming a deployed RAG migration.”

## Source files and evidence

- [Retrieval core](../src/lib/memory/retrieval.ts)
- [Contracts](../src/lib/memory/retrievalContracts.ts)
- [Fictional Pinecone adapter](../src/lib/memory/pineconePilot.ts)
- [Evaluation runner](../scripts/memory-retrieval-evaluation.ts)
- [Implementation evidence](evidence/2026-10-14-personal-memory-retrieval.md)
- [Active roadmap](TrustKaki_BUILD_ROADMAP.md)
