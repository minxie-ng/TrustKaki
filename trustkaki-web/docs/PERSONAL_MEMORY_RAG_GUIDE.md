# Personal memory RAG: implementation and presentation guide

Updated: 15 October 2026.

## What RAG replaces

**Neon replaces Supabase as the application's personal-memory store. RAG is the
retrieval-and-generation method that uses that store.** RAG itself is not a database.

Supabase retains authentication, organisation/senior access, conversation messages,
cases, schedules, essential care/accessibility context and verified family contact
routing. Neon stores personal preferences and context, evidence references,
corrections, revisions, expiry, command receipts and vectors in one Postgres database.

The Pinecone vector index was a historical pilot. The current Neon path does not
write or query it. Pinecone's inference API still supplies embeddings; this is a
separate service from Pinecone vector storage.

## Tools and responsibilities

| Tool | Job |
| --- | --- |
| Supabase Auth and Postgres | Verify identity/access; retain messages and operational care data. |
| Neon Postgres | Canonical personal facts, lifecycle, revisions and retry receipts. |
| pgvector in Neon | Compare vectors to find semantically relevant facts within a senior's scope. |
| Pinecone inference, `llama-text-embed-v2` | Convert fact text and questions into 1,024-dimensional vectors. |
| Existing OpenAI-compatible chat adapter | Compose responses; configured deployment uses `gpt-4o-mini`. |
| `pg` and `@vercel/functions` | Restricted pooled database connections and Vercel pool lifecycle. |
| Zod | Validate requests, evidence, vectors, source records and agent outputs. |
| Vitest and PGlite with pgvector | Application tests and real local Postgres lifecycle/RLS tests. |
| Neon/Vercel CLIs and Neon agent skills | Development setup, deployment and verification. MCP is tooling, not a runtime dependency. |

No LangChain or additional product agent is required for retrieval. Ordinary server
code performs it. Development review agents are separate from the six product roles.

## How a memory is saved

1. A verified senior message reaches the existing extraction agent. It proposes a
   durable fact with an exact excerpt from that current senior-authored message.
2. Server code resolves organisation and senior from trusted identity/access data,
   validates evidence, purpose, confidence and expiry, and chooses the correct store.
   Essential routing/care context remains operational; personal facts go to Neon.
3. A scoped Neon transaction saves the canonical fact, source attribution, version,
   revision and command receipt. SQL row-level security isolates organisation and
   senior. Caller-supplied organisation IDs cannot grant access.
4. A bounded indexing attempt sends approved fact text to the embedding provider and
   stores its vector in Neon. Source version and embedding model must still match
   when the vector is published. Failed indexing leaves the source saved and pending.
5. Pending indexing retries on later writes/retrieval. A durable scheduled worker
   remains follow-up work; this is not a background queue guarantee.

## How a reply uses memory

1. Authenticate the caregiver or verify the channel identity, then resolve the senior.
2. Embed the current question. Search only that senior's authorised Neon scope using
   cosine similarity and a threshold calibrated for the configured embedding model.
3. Re-read current sources and exclude superseded, deleted, expired, conflicting,
   missing-evidence or stale-version facts. Vectors are search aids; current source
   records determine which facts may be used.
4. Return at most six facts, each content/excerpt at most 280 Unicode code points,
   within a 4,000-character JSON budget. Retrieval has a two-second deadline and
   explicit `available`, `empty` or `unavailable` status.
5. Give selected facts, provenance and timestamps to the agents as **untrusted
   evidence**, together with operational care context and dated conversation.
   Incoming statements and historical messages are labelled separately. A current
   explicit senior preference takes priority; otherwise newer confirmed facts
   supersede contradictory older conversation. Evidence cannot issue instructions.
6. Agents produce validated outputs. Deterministic policy remains the authority for
   operational risk and escalation. Personal memory does not diagnose or override
   verified contact routing or essential care/accessibility context.

There is no automatic fallback to Supabase personal memory in Neon mode. Database
failure does not silently restore an older fact. Runtime functions are placed in
Singapore beside Neon; the build machine may still run elsewhere.

## Correction example

A senior previously said they preferred porridge. A caregiver later confirms toast.
The correction increases the canonical version, preserves the old revision, and
invalidates its vector in the same transaction. Only the current version can be
indexed or retrieved. The agent should answer with toast when asked the remembered
preference. If the senior now explicitly asks for noodles, that current choice wins.

Exact command retries return the original receipt. Stale edits conflict rather than
overwrite newer changes. Archive excludes the fact from retrieval; replaying an old
extraction cannot resurrect it. Administrative edits require verified senior-admin
access and the expected update timestamp.

## Why this helps

- **Relevant context:** semantic retrieval can find an older gardening preference
  when the senior asks about growing plants, despite different wording.
- **Bounded prompts:** only selected relevant facts reach the model, rather than
  the entire memory history. This can reduce prompt cost; savings are not yet measured.
- **Correctable memory:** source records, revisions and receipts support review,
  correction and lifecycle changes independently of a model conversation.
- **Reduced coupling:** chat-model choice is separate from storage and embeddings.
  Changing embedding model usually requires re-embedding and recalibration.
- **Simpler memory storage:** canonical facts and vectors share one database, avoiding
  synchronisation between a separate source database and vector index.

RAG does **not** automatically shrink storage. Embeddings add data. Retention,
consolidation, deduplication, pagination and archival still control growth. Exact
cosine search currently grows with each senior's corpus; ANN indexing and production
load measurements are future work.

## Migration and verification evidence

Five legacy personal rows were imported as four canonical records and one revision.
A family contact route remains operational in Supabase. Three active canonical
facts initially lacked original provenance and were excluded from AI retrieval.
On 15 October, the project owner approved retaining all three as fictional demo
facts. They were confirmed through the authenticated caregiver correction flow,
with explicit fictional provenance in each audit reason; current embeddings were
verified for all three. This is not verification about real seniors. Migration
itself never invents evidence or confirmation.

Legacy Supabase personal rows are frozen historical evidence, not runtime fallback.
Deletion of those retained copies requires the retention/audit decision. Historical
Supabase command identities were not imported as Neon receipts; old in-flight edits
may need a dashboard refresh and reviewed reissue.

Latest bounded semantic benchmark: **30/30 questions**, 10/10 each English,
Mandarin and Singlish; zero forbidden facts, warm p95 **460 ms**. This synthetic
benchmark does not establish broad language quality, real-user usefulness or scale.

See [cutover record](evidence/2026-10-15-neon-memory-cutover.md) for the exact deployed
commit, generated-response results, failed gates and production status. Historical
[Pinecone pilot](evidence/2026-10-15-memory-live-pilot.md) and
[Neon semantic benchmark](evidence/2026-10-15-neon-semantic-retrieval.md) remain evidence
for their respective earlier stages.

## A judge-ready explanation

> We separate operational care data from personal conversational memory. Supabase
> handles identity and care workflows; Neon stores confirmed personal facts and their
> evidence, with pgvector for semantic search. Pinecone's embedding API converts text
> to vectors, while our chat model remains separate. For each question we retrieve a
> small authorised set, check current versions and expiry, and pass it to agents as
> evidence. Caregivers can correct or archive facts, and old retries cannot restore
> superseded memory. RAG improves relevant context; retention still controls growth.

## Operating references

- [Active roadmap](TrustKaki_BUILD_ROADMAP.md)
- [Neon setup and safe commands](NEON_MEMORY_SETUP.md)
- [Lifecycle design](superpowers/specs/2026-10-15-external-memory-lifecycle-design.md)
- [Retrieval](../src/lib/memory/retrieval.ts)
- [Authenticated integration](../src/lib/memory/applicationRepository.ts)
- [Transactions and RLS scope](../src/lib/memory/neonDatabase.ts)
- [Prompts](../src/lib/agents/prompts.ts)

Before real senior use: schedule durable indexing, validate restore and retention,
measure production load and broader reply faithfulness, and complete the operational
pilot requirements. Community-event availability needs a separate current source;
a remembered interest alone does not prove a suitable event exists.
