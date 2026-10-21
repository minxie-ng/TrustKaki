# Curated community activity suggestions

TrustKaki can offer up to two source-linked options through its existing Jev social-decision path (`TRUSTKAKI_JEV_ENABLED=true`). This is a small manually maintained Toa Payoh catalogue, not live event discovery, a complete neighbourhood directory, or a booking integration.

## How it works

Triage extracts the chosen search area and constraints within its existing request. Jev independently checks the senior's current willingness. Only an interested decision can reach the deterministic matcher. A recent, immediately preceding fixed application clarification can contextualise a short answer; arbitrary chat history is not forwarded to the consent classifier. Refusal, uncertainty, care priorities and policy pauses retain precedence.

The matcher requires complete constraints, filters the typed catalogue and formats source facts without another model call or external lookup. Missing/invalid extraction asks for clarification and cannot invalidate independently extracted care signals. The catalogue does not write preferences, change risk, book, register or contact anyone. Existing non-Jev conversation behaviour remains available; catalogue matching requires the Jev consent path.

Initial records are an official onePA dated event and a Care Corner service enquiry. An enquiry is not a confirmed branch appointment. Eligibility and catchment require checking with the provider. Unknown fees, language, accessibility, group size or places are never presented as confirmed; an unknown required attribute excludes a match.

## Maintaining records

Edit `src/lib/agents/activityCatalogue.ts` only after reviewing the official source. Retain its URL, checked timestamp, event/service distinction and explicitly unknown facts. Page review is not confirmation by the organiser. Review conflicting dates/venues before inclusion; do not resolve conflicts by guessing. The initial page review used public web retrieval, which may include indexed content.

Records expire seven days after their checked timestamp. Future checked timestamps, untrusted sources, conflicted records and past/already-started events are excluded. Event/date comparisons use Singapore time. Unscheduled services cannot satisfy a requested date window. Rechecking a source requires reviewing its actual content, not just updating a timestamp. A release containing changed catalogue facts follows the ordinary release process.

Current source paths are restricted to official onePA event pages, Care Corner active-ageing services and the AIC AAC locator. No home address or care-message content is sent to them. Chosen area is extracted from the senior's request/context, never inferred from the home address. No radius or walking-distance claim is made.

## Limits and evaluation

The initial catalogue has only two records. Specific hobbies, a small-group requirement, a budget or access requirement may have no sufficiently documented match; TrustKaki then provides official discovery/enquiry links and does not imply that no real options exist. Replies support the existing English/Mandarin social presentation; this does not establish general multilingual accuracy. Constraint extraction and consent remain model decisions and can be wrong; deterministic filtering cannot recover a constraint omitted by the model. Validate those decisions with bounded evaluations before claiming live accuracy.

Local coverage includes filtering, unknown attributes, dates/freshness, URL safety, missing extraction, refusals, care priority, bounded clarification context, active orchestrator integration and the exported helper. Mocked model tests establish control-flow behaviour, not live-model accuracy or a successful deployed interaction.
