# Fictional live retrieval pilot

**Goal:** Measure candidate Pinecone/llama retrieval using the approved fictional
corpus and gates. User authorised up to USD 1 with provider controls and saved
an existing key locally. Console verified Starter/free current. Official limits
state monthly overages reject requests; no paid upgrade is authorised.

- [x] Verify key presence without printing it and verify provider plan.
- [x] Add/test independent cosine calibration: 15 target questions (five topics,
  three languages) and five unrelated questions; never use final evaluation scores
  to tune the cutoff. Three unit tests and TypeScript passed before live calls.
- [x] Embed fictional active corpus and calibration queries. Scores separated;
  freeze threshold. No index writes in calibration.
- [x] Run the existing fictional evaluation once in a fresh isolated namespace.
  Capture unmodified JSON, model, usage, latency, forbidden facts and per-language recall.
- [x] Review code/results, document failed as well as passed gates, update roadmap.
- [x] Commit reproducible calibration script/tests and evidence. No production
  migration, agent wiring, provider messages, paid upgrade, or existing-index edits.
