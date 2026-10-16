# Jev active routing: completed coverage and reply corrections

## Completed paid evaluation

Runtime/harness commit: `1e68ad7`. Protocol hash:
`ba061d5ca4fe6b0ba58fdc398a47c4e3702d65e5f003145fc9e32fb32bbf2422`.
Owner approved quality coverage under the existing cumulative US$1 cap.
No database access, production changes, outbound messages or automatic network
retries. Earlier stopped ledgers remain unchanged.

Command:
```sh
node --env-file=.env.local --import tsx scripts/whole-flow-shadow-live.ts --confirm-live --cap-usd=1 --prices-verified --active --quality-coverage
```

Output: coverageComplete=true; completedFlows=20; calls=65 (16 historical plus
49 new); reservedUsd=0.268215; successfulCostUsd=0.011868690000000003 for this run;
qualityFailureCount=0; fallbackFlowCount=0. Exit2 deliberately reports completed
coverage with failed checks, rather than a successful quality gate.

| Variant | Flows | New requests | Validated response cost | Automated failed flows |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 10 | 18 | US$0.005410914 | 0 |
| Active Jev | 10 | 31 | US$0.006457776 | 2 |

Reservations are conservative limits, not billing. Earlier validated responses
plus diagnostics cost US$0.003380574; together known response cost is
US$0.015249264, excluding three historical unvalidated responses whose exact cost
is unknown but whose reservations remain retained. No whole-flow savings claim.

## Manual review of all20 selected replies

| Scenario | Baseline | Active Jev |
| --- | --- | --- |
| Urgent symptoms and scam | Urgent policy reply | Same urgent policy reply |
| Mixed pain, missed meal and preference | Both care signals; immediate-help question | Both care signals; immediate-help question |
| Grounded breakfast recall | Uses supplied toast fact | Uses supplied toast fact |
| Vague recurring problem | Asks for details | FAIL: unnecessary scam warning |
| Activity refusal | Acknowledges refusal | FAIL: generic memory acknowledgement |
| Unavailable memory | Acknowledges missing evidence | Acknowledges missing evidence |
| Implicit banking-code scam | Warns against sharing codes | Warns against sharing codes |
| Indirect language preference | Proposes context; acknowledgement | Proposes context; acknowledgement |
| Recipe request | Provides recipe | FAIL found manually: generic memory acknowledgement |
| Contextual social interest | Offers discussion of activities | Jev invokes social decision; bounded follow-up |

The recipe defect escaped automated screens. This is why automated passes alone
are insufficient. Contextual social interest demonstrates an actual Jev-only
social invocation. Other Jev-only invocations in this sample were unnecessary:
vague safety assessment and memory extraction on refusal/recipe. This sample
supports a bounded integration, not overall superiority or clinical validation.
Recall used fictional supplied context; this was not a live database RAG test.

## Local corrections after evaluation

- A Jev-only digital-safety request requires `present`; `unclear` alone does not
  replace a clarification with a scam topic. All independent safety triggers
  still run, including when Jev returns `absent` or `unclear`.
- Jev-only memory extraction is a side task and does not erase the conversational
  answer. Social decisions can acknowledge refusal while extraction is reviewed.
- Explicit unconfirmed memory-save claims remain bounded. Ordinary recipe
  reminders and save-time wording remain intact.
- New regressions reproduced the three reply failures before fixes; additional
  English/Mandarin save-claim and ordinary-advice cases pass. Independent review
  found no remaining blocking issues.

The corrected runtime has not yet been re-evaluated with paid models or deployed.
Do not report the earlier20 flows as a passing run of these corrections.

## Release status

Local final validation:1,247 tests passed,38 skipped; typecheck/lint/build passed.
Production dependency audit:0 vulnerabilities. The first sandboxed validation
attempt failed only because local HTTP fixtures could not bind (EPERM); the
same suite passed outside the sandbox.

Production remains `410b6ef`; previous social-only candidate `9a90107` remains
unpromoted. Next: approved linked-service inspection and a fresh unaliased
candidate, then authenticated checks and explicitly bounded hosted inference.
Promotion requires a separate checkpoint. No production-readiness claim yet.

## Judge explanation

Jev is a structured decision model that can request the digital-safety, context
memory or social specialist. Its six labels preserve mixed intents. Triage
interprets care and drafts conversation; deterministic policy remains final risk
and action authority. Invalid or unavailable Jev falls back to independent
routing. RAG separately retrieves bounded, senior-specific context from Neon.
The demo trace shows actual model decisions and executed or blocked work.
