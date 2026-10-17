# Personal memory retrieval — first slice

<!-- documentation-context -->
> **Historical design / evaluation record.** This document preserves the plan and decisions at its recorded stage. Proposed work and approval checkpoints are not claims about the current deployed product. Start with the [documentation index](../../README.md) or [current architecture](../../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


Date: 14 October 2026
Status: proposed design; acceptance targets defined, implementation not started.
Owner roadmap: [current roadmap](../../TrustKaki_BUILD_ROADMAP.md).

## Goal and boundary

Given an authenticated senior scope and a current message, return a small set of
relevant, valid personal facts with provenance. An old gardening preference must
beat unrelated recent food preferences. Unknown or disputed preferences must
remain unknown rather than becoming confident advice.

RAG is retrieval plus grounded generation; it still requires durable storage.
Personal preferences, recollections, and grounded conversation summaries will
ultimately live outside Supabase. Operational profiles, access relationships,
messaging records, care cases, schedules, and essential safety/accessibility
information remain authoritative in Supabase. A routine or health field must be
classified by purpose before migration; its table name alone is insufficient.

This slice establishes the retrieval contract, executable fictional evaluations,
and an opt-in provider experiment. It does not migrate existing memory, enable a
second production writer, remove Supabase rows, or switch production chat reads.
Current Supabase personal-memory use is transitional, not the target architecture.

## Implementation approaches

1. **Small retrieval module with a provider boundary — recommended.** Application
   code owns access checks, validity, conflict handling, and context budgets.
   A provider supplies ranked candidates. Fictional tests run without accounts;
   a separately enabled Pinecone experiment measures actual semantic retrieval.
2. **Connect a vector service directly in each agent.** Fewer initial files, but
   duplicates filtering, increases calls, and makes tenant checks inconsistent.
3. **Adopt a retrieval/agent framework now.** Adds dependency and workflow scope
   before this application needs it. Reconsider only for a demonstrated gap.

Use option 1. Do not add a retrieval agent or framework. Pinecone remains a
candidate, not a selected authoritative memory backend. Evaluate Qdrant if the
managed candidate fails region, budget, source-storage, or lifecycle requirements.
No paid service or new account is created by this design approval.

## Retrieval contract

- Server-only entry: verified scope, current message, and fixed evaluation time.
  Scope contains organisation ID and senior ID, resolved by trusted server code.
  A client-supplied organisation ID or model-generated identifier is not authority.
- Caregiver paths check existing senior access and resolve the senior's actual
  organisation. Messaging paths first verify identity, then resolve the same
  organisation/senior pair. Denied or unresolved scope makes no provider call.
- Search uses both scope values and active/unexpired filters. Independently
  validate returned source records before they enter agent context; reject
  mismatched scopes even if a provider ignores its requested filters.
- Candidate fields: stable ID, organisation/senior IDs, context key, fact content,
  source reference and evidence excerpt, confirmation/expiry timestamps, status,
  source version, index version/model, and explicit conflict-group identity where
  relevant. Sources are memory records, not a model's unsupported recollection.
- Prefer relevant valid facts over importance or recency alone. A pinned embedding
  model/version and versioned dataset make comparisons reproducible. Chat model
  and embedding model settings remain independent.
- Exclude expired, deleted, superseded, malformed, wrong-scope, or stale-index
  records. Expiry equal to the evaluation time counts as expired.
- Conflicts require explicit source metadata. If a known conflict group is
  unresolved, omit its facts from authoritative context and return a clarification
  indicator. Do not infer that unrelated context keys cannot contradict each
  other. General natural-language contradiction detection belongs to ingestion
  design; this slice makes no claim to solve it.
- Return a status (`available`, `empty`, or `unavailable`), selected facts and
  source IDs, unresolved groups, and bounded diagnostic counts. Missing evidence
  is not an error; provider failure is not an empty successful search.
- No raw memories, query text, credentials, or provider payloads in default logs.
  Record timings, versions, counts, and sanitised failure categories only.

## Initial budgets

These are engineering targets, not measured results or capacity guarantees.

| Bound | Initial target |
| --- | --- |
| Query input | At most 2,000 Unicode code points; reject larger queries before provider I/O |
| Search | One embedding request and one scoped search, requesting at most 20 candidates |
| Source validation | At most one bulk source fetch of those candidate IDs; no history scan |
| Personal context | At most six facts, each content field at most 280 code points |
| Serialised personal context | At most 4,000 code points including notes, provenance, and conflicts |
| Retrieval deadline | Two seconds total; abort outstanding provider requests |
| Live pilot latency | p95 at most 1.5 seconds across at least 30 measured queries, including embedding/source reads |
| Automatic retries | None on the chat retrieval path; background indexing is a later chunk |

If metadata cannot fit, exclude whole lower-ranked records rather than stripping
provenance. This is a character budget, not a token guarantee. Measure actual
tokens and cost in the live pilot. No cost claim passes until provider region,
plan, query/write counts, embedding price, and an owner-approved spending cap are
recorded. A larger corpus must not increase the candidate/context bounds.

## Acceptance cases and release gates

Preserve the existing eight baseline cases and required/forbidden targets.
Baseline tests pin current shortcomings; they must not be relabelled as RAG passes.

| Case | Required result |
| --- | --- |
| Old relevant memory | Gardening appears for an activity-recall question |
| Crowded-out memory | Gardening remains in the final six alongside 12 unrelated, newer facts |
| Changed preference | Current text preference included; superseded calls excluded |
| Expiry boundary | Both past expiry and expiry equal to now excluded |
| Unresolved conflict | Neither conflicting preference authoritative; clarification indicated |
| No memory / no match | Empty status; no invented preference |
| Cross-senior | Zero foreign facts in context or diagnostic content |
| Cross-organisation | Same senior identifier in another organisation never crosses scope |
| Access denied | Zero embedding, search, and source-fetch calls |
| Provider ignores filters | Returned foreign records rejected locally |
| Deleted or corrected source | Stale hits rejected against current source revision/status |
| Wrong embedding version | Explicit unavailable result; incompatible vectors not queried |
| Provider error / malformed result / timeout | Unavailable status within deadline; no implicit legacy-memory read |
| Large input/output | Limits enforced before calls and before prompt construction |
| Prompt injection in memory | Treated as quoted evidence, never a system/tool instruction |
| Mandarin and Singlish | Correct activity preference retrieved for each language variant |

**Local retrieval gate:** all deterministic acceptance assertions pass, including
zero scope/expiry/supersession violations and both baseline gaps. Use a provider
double that deliberately returns bad records; this proves application guards,
not live service isolation or semantic quality.

**Live retrieval pilot gate:** use fictional records only, including 1,000
irrelevant distractors. Prelabel at least ten questions each in English,
Mandarin, and Singlish. Recall@6 must be at least 90% in each language group;
the original gardening and correction cases must all pass. Forbidden-fact count
must be zero across every case. Record dataset revision, embedding model/version,
provider settings, region, sample size, timings, and cost. Missing credentials
means unrun, not passed. No real senior information is uploaded for this pilot.

**Generation gate before chat integration:** evaluate the existing agent chain
on the same labelled cases, with pinned chat model and prompt versions. Every
asserted personal fact must have a selected source; zero invented current events,
invites, diagnoses, foreign facts, or obeyed injected instructions. Missing,
conflicting, and unavailable memory must produce respectful uncertainty or a
clarifying question. Do not claim this gate from retrieval-only tests. Preserve
existing deterministic risk decisions and safe responses during provider outage.

## Files and integration order

1. Extend `src/lib/agents/evaluation/memoryCases.ts` with scope, lifecycle,
   language, and hostile-content cases; retain the legacy baseline assertions.
2. Add narrowly scoped contracts and retrieval tests under `src/lib/memory/`.
   Reuse Zod, existing server-only conventions, and memory terminology.
3. Implement filtering, bounded selection, explicit statuses, and deadline handling
   against injected embedding/search/source dependencies. No network in unit tests.
4. Add one opt-in fictional provider evaluation command, with explicitly enabled
   external I/O. Pin versions; report bounded metrics. No production route yet.
5. Inspect live pilot evidence before selecting storage and designing migration.
   Source of truth, atomic correction/version handling, backup/export, deletion
   propagation, index rebuild, and recovery must be demonstrated before cutover.

Production integration subsequently touches `seniorContextRepository.ts`, all
authenticated agent routes, Telegram, and WhatsApp. The current loader lacks a
query-message argument and omits organisation ID in its senior selection; both
need explicit changes at that stage. AAC Nudge's missing known-context input
also needs fixing before claiming role-wide personalisation.

The production cutover must have one authoritative personal-memory write path,
verified backfill, and no silent Supabase personal-memory fallback on outage.
Until then, the experiment is isolated and the production behaviour is unchanged.
No deployment is required for this first local evaluation slice.
