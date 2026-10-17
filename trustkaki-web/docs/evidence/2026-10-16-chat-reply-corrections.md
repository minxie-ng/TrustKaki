# Full-chat findings: local reply corrections

<!-- documentation-context -->
> **Dated evidence / release record.** Results and operational details apply to the recorded build, scope and date. They do not establish current deployment health or supersede the public architecture guides. Start with the [documentation index](../README.md) or [current architecture](../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


16 October 2026. Follow-up to the
[approved full-chat evaluation](2026-10-16-jev-whole-flow-results.md).
Implemented locally; not deployed and no new paid provider calls.

## Root causes and corrections

- Recall detection omitted Chinese “你知道我…” and English “Do you know…”
  preference/routine questions. These could incorrectly invoke Context Memory,
  then trigger the generic pre-persistence acknowledgment. Recall checks now
  share clause-based detection; comma-separated explicit updates remain eligible
  for extraction. Questions alone do not become new facts.
- A bounded personal-preference/routine recall guard validates the supplied
  personal-memory envelope. When it is missing, invalid, empty or unavailable,
  the reply states that the available memory cannot confirm the answer and asks
  the senior to tell it again. This does not claim the preference does not exist.
  Ordinary informational questions retain the conversational reply.
- Unsupported English/Mandarin meal-preparation offers are removed at clause
  boundaries. Grounded answer clauses remain, followed by an honest statement
  that the app can discuss options but cannot prepare or deliver meals. The
  tested recipe, meal-planning and cooking-instruction offers remain intact.
- Bounded replies with detected health/daily-living signals retain caregiver
  advice and ask what help is needed now. Missing-memory replies avoid adding a
  second question. Triage instructions now explicitly prioritize immediate care
  over memory acknowledgment, explain absent evidence, and prohibit physical
  food-service offers.

Urgent-health and digital-safety replies still take precedence. No care-risk
rules, persistence, retrieval, Jev routing authority, hosted flags or dependencies
changed. This improves replies when signals exist; it does not resolve every
possible missed signal or establish the appropriate risk level for the mixed
care fixture.

## Verification

Added **26 orchestration regression cases**. Watched the reproduced failures
before their corresponding fixes. Coverage includes the observed Chinese recall
and preparation replies; English equivalents; empty/unavailable memory;
preserved grounded content across sentence/comma boundaries; legitimate recipe
help; ordinary health questions; and explicit preference updates following recall
questions in separate sentences and comma-separated clauses. Existing tests
cover urgent/scam precedence, actual selected reply in Briefing and Jev shadow
noninterference.

Final commands, all exit 0:

```text
npm run test
Test Files 152 passed | 5 skipped (157)
Tests 1179 passed | 38 skipped (1217)

npm run typecheck
npm run lint
npm run build
Compiled successfully
Generating static pages (24/24)
```

Full tests ran with localhost access for local test servers. Provider transport
is mocked; no application endpoint, provider request or live database was used
to re-evaluate these changes. The first full-suite run found one historical
benchmark test still expecting a narrowly approved recovery reservation from the
old prompts. The runner correctly rejects the changed reservation. Updated that
test to require rejection, zero recovery requests and an unchanged stopped
ledger; the runner and historical experiment files were not modified.

Independent AI review caught overbroad meal filtering and comma-separated update
handling. Added reproductions and corrected them; final review found no remaining
Critical or Important findings within the documented scope. This is not clinical
validation or coverage of arbitrary paraphrases/additional languages.

## Remaining checkpoint

The recorded US$0.006153858 live experiment belongs to the **pre-fix** source.
It is not post-fix model-quality evidence. Do not clear or reuse its frozen
ledger under changed prompts. A new paid follow-up needs a separately scoped
approval and budget. No deployment or promotion was performed.

Next design chunk: specify limited Jev routing authority, uncertainty handling
and fallback while retaining deterministic safety and memory validation. UI
cleanup remains after agent behavior is settled.
