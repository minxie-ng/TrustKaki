# Gate 5 Memory Operationalisation Design

**Status:** Approved on 16 July 2026

## Purpose

TrustKaki should remember useful senior-specific context so conversations,
routine comparisons, and proactive check-ins become more personal without
creating a new review burden for caregivers. Context is activated
automatically only when it is supported by a cited senior message and passes
deterministic safety rules. Caregivers correct exceptions; they do not approve
routine AI work.

## Scope

Gate 5 operationalises the existing `senior_memories`,
`senior_health_contexts`, and `routine_baselines` tables. It delivers:

1. A specialist Context Memory Agent with typed input and output contracts.
2. Conditional invocation through the existing orchestrator.
3. Automatic, policy-gated activation of supported context.
4. Provenance, confidence, expiry, supersession, and immutable audit history.
5. A bounded context bundle for agents and deterministic Pattern Watch.
6. Safe, deterministic personalisation of proactive check-ins.
7. Admin correction and archival controls without an approval inbox.

Gate 5 does not add organisation tenancy, family notification fan-out, medical
diagnosis, medication advice, free-form autonomous outreach, a general-purpose
knowledge graph, or a dashboard redesign.

## Product Policy

### Automation first

- Eligible context becomes active automatically; no caregiver approval is
  required.
- The system records why an item was accepted or rejected.
- Caregivers may correct or archive active context when needed.
- A correction supersedes the old value while preserving both versions and the
  immutable event history.

### Eligible context

The Context Memory Agent may extract only:

- communication, food, routine, and AAC preferences;
- explicit family or trusted-contact context that is operationally useful;
- repeated or clearly stated routine baselines;
- explicit, non-diagnostic health or accessibility context useful for safer
  communication and follow-up.

It must not store:

- inferred diagnoses or medical conclusions;
- medication changes or treatment instructions;
- passwords, OTPs, bank details, identity-document numbers, or credentials;
- speculative family relationships or unsupported contact instructions;
- one-off small talk with no likely future usefulness;
- hidden chain-of-thought or provider payloads.

### Evidence and confidence

Every model-extracted candidate includes a source message ID and an exact
evidence excerpt. The deterministic policy verifies that the cited message is
senior-authored, belongs to the same senior, and contains the excerpt.

Automatic activation requires:

- a validated candidate schema;
- confidence of at least `0.85`;
- a supported context category and application tag;
- an exact valid evidence citation;
- no prohibited sensitive-data or diagnostic classification;
- a useful expiry selected from the policy's bounded category defaults.

Candidates that fail are not active and cannot influence care. Rejection is
recorded as a concise category such as `low_confidence`, `unsupported_evidence`,
`sensitive_data`, or `diagnostic_inference`; raw provider responses are not
stored in caregiver-facing records.

## Architecture

The existing orchestration remains the main inbound entry point.

```text
Inbound senior message
  -> Orchestrator creates execution plan
  -> Triage and other required specialists
  -> Context Memory Agent only when durable context may be present
  -> Zod output validation
  -> deterministic memory eligibility policy
  -> transactional context command in Supabase
  -> active context plus immutable event history
  -> bounded context bundle for later agents, Pattern Watch, and check-ins
```

The Context Memory Agent proposes structured candidates. It never writes to the
database directly and never decides policy eligibility. The existing shared
agent runner records its `agent_runs` trace with a concise input summary,
structured output summary, latency, model metadata, trace ID, and error state.

If extraction or persistence fails, the current conversation and policy result
continue normally. Memory failure must not block a senior-facing reply.

## Context Memory Agent

### Input

The agent receives:

- the current senior-authored message and message ID;
- a small recent conversation window;
- the currently active context keys and summaries needed to detect confirmation
  or change;
- no raw phone numbers, credentials, unrelated contacts, or complete database
  record.

### Output

Each candidate contains:

- target store: memory, health context, or routine baseline;
- stable `context_key`, such as `preferred_language` or `breakfast_routine`;
- supported type and concise content;
- exact source message ID and evidence excerpt;
- confidence;
- supported application tags;
- proposed retention class;
- whether it confirms or replaces an existing context key.

The agent output is a proposal only. The deterministic policy validates and
normalises it before any state change.

### Conditional invocation

The orchestrator may invoke the Context Memory Agent when a message contains a
preference, recurring routine, accessibility need, family-routing fact, or
explicit lasting health context. It should not run for greetings, acknowledgments,
or messages whose content is already represented by unchanged active context.

The safe fallback is no extraction. The system must not manufacture a memory to
fill an empty profile.

## Data Model

Extend the three existing context tables rather than creating replacement
tables.

Shared operational fields include:

- stable context key;
- extraction method (`caregiver_confirmed`, `ai_extracted`, or imported);
- source message ID where applicable;
- confidence;
- last confirmed time;
- expiry time;
- superseded-record link;
- typed safe-application tags;
- actor or system provenance and timestamps.

Existing seeded caregiver-confirmed context remains active and receives
non-expiring or explicitly configured retention. AI-extracted records always
have a bounded expiry.

Add one append-only context event table that records proposal acceptance,
rejection category, confirmation, correction, supersession, archival, and
expiry. Browser clients cannot update or delete event rows directly.

Only one active value may exist for the same senior, target store, and
`context_key`. A newly accepted replacement supersedes the prior row
transactionally. Replayed extraction commands are idempotent and a reused
command ID with changed payload is rejected.

## Retention and Expiry

Retention is bounded by category:

- explicit health and accessibility observations: 30 days unless reconfirmed;
- routine baselines: 90 days unless reconfirmed;
- communication, food, AAC, and routine preferences: 180 days;
- explicit family-routing context: 180 days;
- caregiver-confirmed seed or admin-corrected context: configurable and may be
  non-expiring when operationally justified.

A confirming senior message refreshes `last_confirmed_at` and expiry without
creating a duplicate active item. Expired context is excluded at read time even
if the cleanup job has not yet archived it. Cleanup may archive expired rows in
bounded batches for reporting, but correctness never depends on cleanup timing.

## Context Consumption

### Agent context

`AgentRunContext` gains a typed, bounded `knownContext` section. The server loads
only active, non-expired items for the authorized senior. It limits count and
content length, separates observed context from preferences, and includes safe
use notes. Prompts label these records as context, not current facts or medical
conclusions.

### Pattern Watch

Deterministic Pattern Watch continues to own pattern decisions. It may compare
signals with active routine and health context, but expired or archived context
is ignored. Memory can explain a recommendation or shape the suggested human
action; it cannot independently create risk or override policy-authoritative
risk.

### Proactive check-ins

Scheduled sends remain deterministic and use the Gate 4 job, idempotency, and
transport workflow. Gate 5 does not make an LLM call at send time. Typed
application tags select bounded wording variants, for example concise text,
gentle one-to-one tone, or a practical meal prompt. Arbitrary stored memory text
is never appended directly to an outbound message.

## Admin Correction Experience

Add a compact admin-only context section within the existing senior detail
surface. It shows active context grouped as preferences, usual routine, and
health/accessibility context, with source, age, and expiry in progressive
disclosure.

Available commands are:

- correct an item with a required reason;
- archive an item with a required reason;
- restore by creating a new version rather than mutating history.

There is no pending approval queue. Non-admin caregivers may read context for
seniors they are authorized to support but cannot mutate it in Gate 5.

## Security and Privacy

- Server-side authorization and RLS use the same senior relationship boundary.
- Automatic extraction writes through a server-only transactional command.
- Admin corrections require trusted `demo_admin` app metadata and senior
  access, matching existing admin operations.
- Context events are append-only and immutable to authenticated clients.
- Logs and API responses exclude raw provider responses, tokens, transport
  destinations, and unrelated personal data.
- Prompt context is minimized and scoped to one senior.
- Sensitive-data rejection happens before active context persistence.

## Reliability and Concurrency

- Context commands are transactional and idempotent.
- Concurrent replacements for the same context key use expected-version guards;
  one succeeds and stale commands return conflict without partial writes.
- Extraction retries cannot duplicate active context or audit events.
- If the model times out, returns invalid JSON, or cites unsupported evidence,
  orchestration continues without a context write.
- Context reads filter expiry directly and have a bounded fallback when the
  context subsystem is unavailable.

## Verification

Automated tests must prove:

- the Context Memory Agent has separate prompts and Zod contracts;
- the orchestrator invokes it only for likely durable context;
- high-confidence supported evidence activates context automatically;
- low-confidence, unsupported, diagnostic, and sensitive candidates do not;
- a failed extraction does not block the senior reply;
- accepted records preserve source, confidence, expiry, and application tags;
- repeated extraction is idempotent;
- changed-payload command reuse is rejected;
- confirmation refreshes expiry without duplicating active context;
- a changed value supersedes the old value transactionally;
- expired and archived items are excluded from agents and Pattern Watch;
- memory affects reply personalisation without changing policy risk;
- proactive check-ins use bounded deterministic variants and never raw memory;
- admin correction and archival preserve immutable history;
- stale concurrent correction returns conflict without partial state;
- authorized caregivers can read shared context and unrelated caregivers cannot;
- non-admin mutation is rejected;
- secrets, raw provider responses, and hidden reasoning are absent from APIs and
  rendered data.

Live verification must cover automatic extraction from a real inbound Telegram
message, persistence and refresh survival, a second message that confirms or
updates the same context key, use in a later agent reply, admin correction or
archive, two-caregiver visibility, unrelated-caregiver isolation, migration
history, relevant Supabase advisors, and `npm run validate`.

## Success Criteria

Gate 5 is complete only when a real senior message can automatically create
safe, sourced, expiring context; a later TrustKaki interaction demonstrably uses
that context; the context remains correctable and auditable; expired or unsafe
context cannot influence care; and no routine caregiver approval step is
required.
