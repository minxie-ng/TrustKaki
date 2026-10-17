# Local agent consolidation evidence

<!-- documentation-context -->
> **Dated evidence / release record.** Results and operational details apply to the recorded build, scope and date. They do not establish current deployment health or supersede the public architecture guides. Start with the [documentation index](../README.md) or [current architecture](../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


15 October 2026 (Singapore). Local implementation; production is unchanged.

Subsequent live comparison: [results](2026-10-15-agent-live-comparison.md).
It measured fewer calls and one reply per turn but found a remaining unsupported
Mandarin memory promise. [Subsequent correction](2026-10-15-capability-replies.md)
resolved that blocker; exact candidate deployment and signed-in verification remain.

## Changes

- Main chat flow starts with Triage, which owns routing and optional grounded social
  suggestions. No standalone Orchestrator or AAC model call in `orchestrate`.
- Conditional Digital Safety and Context Memory remain; Briefing runs only after
  deterministic policy requests it. RAG, storage and policy thresholds are unchanged.
- Exactly one senior reply is selected after policy: urgent health guidance first,
  relevant Digital Safety warning next, otherwise the Triage conversation draft.
  Urgent guidance uses a bilingual English/Mandarin template. It does not claim
  that help was contacted. A scam warning remains in the specialist trace/briefing
  when urgent health guidance takes precedence.
- Unicode letters survive the memory gate. Representative Mandarin preferences,
  routines and accessibility cues trigger extraction; Triage can request extraction
  for other supported-language statements. Small talk and recognised credentials
  remain excluded. Added Chinese credential labels are also redacted from history.
- Fallbacks no longer invent staff interest, named contacts or memory saves.
- Briefing receives final policy risk, structured signals, assessment availability
  and the selected reply. A negative scam flag is not described as verified safety.
  A conflicting risk field rejects the whole briefing into a truthful manual-review
  fallback, rather than merely overwriting its risk field while retaining the prose.
- Retained-role prompts state evidence, authority, refusal, language and uncertainty
  boundaries and provide schema-valid concrete examples.
- Existing standalone AAC/other endpoints and historical trace identifiers remain
  compatible. The AAC endpoint can still make a separate draft on explicit request;
  the normal chat pipeline no longer does.

## Call-count comparison (code paths, before retries)

| Scenario | Audited baseline | Local consolidated path |
| --- | --- | --- |
| Ordinary chat, no specialists/briefing | Router + Triage: 2 | Triage: 1 |
| One low social signal, no other need | Router + Triage + AAC: 3 | Triage: 1 |
| All eligible roles required | Up to 6 | Up to 4 |

This establishes fewer model invocations on those paths, not measured latency,
cost savings or equivalent model quality. Existing per-call retries remain; an
aggregate turn deadline/usage budget is still separate work.

## Verification

Failing regressions were observed before implementation for the consolidation,
Unicode gate, fallback and briefing contract. Independent code review then found
and reproduced two deterministic selector bugs: emergency guidance lost when only
a high digital signal was extracted, and English-only emergency replacement.
Both were fixed and regression tests passed; follow-up review found no further
important deterministic defects in the reviewed changes.

- Focused orchestration/prompt/policy/evaluation run: **125 passed**.
- Full `npm run validate`: **1,031 passed, 38 skipped** across **142 passing test
  files and 5 skipped files**; TypeScript, lint and production build pass.
- `node --import tsx scripts/agent-benchmark.ts --mode deterministic`: **42 cases,
  no failed IDs**; routing/recall explicitly **not measured** in offline mode.
- `git diff --check`: clean.

The first full run hit sandbox `listen EPERM` in the local HTTP smoke tests and an
old social scoring fixture. The scoring test now uses a digital-safety case to
retain its missed-required/selected-forbidden coverage; rerunning validation with
local-port access passed. The existing Vite tsconfig-paths deprecation advisory
remains; no dependency change was needed.

The seven social benchmark cases now require Triage and forbid a separate AAC
call. Historical six-role routing aggregates are not directly comparable against
these revised role expectations. Offline results and mocked provider tests are
not live evidence of social response quality, multilingual understanding or scam
recall. The existing environment-dependent skipped tests were not made to run.

## Release boundary / next gate

No deployment, paid model inference, Jev/Laya setup, outbound messages, migration
or live database write was performed in this chunk. Before production promotion:
run a bounded paid before/after evaluation on identical fictional messages with
fixed model/version/settings; separately inspect grounded replies, refusals,
mixed care/scam cases, Mandarin/Singlish and unavailable-memory scenarios. Record
failures, call/token counts, actual cost and end-to-end latency. Agree the spending
cap before running; the prior embedding-pilot cap does not cover this evaluation.
Then follow the existing exact-candidate signed-in dashboard/release checks.

Known limits: regex guards are supplemental and not comprehensive multilingual
secret/scam/emergency classifiers; briefings with matching risk fields can still
contain semantic mistakes and need live evaluation. Event discovery and Jev are
separate proposals; UI work follows stable behaviour.
