# Mixed-care extraction and Jev contract follow-up

Date:16 October 2026. Local implementation:`37334d2`.

## Observed care gap and changes

Saved mixed baseline omitted a daily_living signal for a current skipped lunch
while reporting health/social signals. The active evaluation now explicitly
requires that daily-living signal for this case. Its negative test first failed
because the screen was absent, then passed after implementation; the same saved
signal types fail the new screen. Historical results were not rewritten.

Triage instructions now require independent extraction of current care concerns
when a lasting preference appears in the same message. A concrete schema-valid
pain-plus-meal-access example preserves both signals while routing preference to
context_memory. Ordinary food preferences/recipes and historical/third-party
missed meals are excluded. No diagnosis, deterministic severity escalation or
fabricated urgent danger was added. This is a prompt correction with offline
coverage, **not a demonstrated live extraction improvement yet**.

## Jev contract investigation

Official [Choice documentation](https://docs.typesafe.ai/primitives/choice)
confirms the selected choice has highest probability and probabilities sum to1;
[confidence documentation](https://docs.typesafe.ai/confidence) describes its0–1
range. Current checks match these documented constraints. Do not remove a guard
or guess a provider defect from the earlier `jev_schema` error.

Distribution validation now gives distinct paths for invalid probability sums
and a choice that is not the largest probability. Its acceptance thresholds are
unchanged. Local tests verify both rejected cases and preserve existing valid,
invalid and fallback tests.

User requested continuation of the reliability investigation. The existing
single-request diagnostic was reused with a fixed Jev mode: exact stopped
15-attempt ledger hash, full-context reservation before transport, correct
OpenRouter key/endpoint, exclusive artifact preventing reruns, no original-ledger
edits and no database access. Three prior Triage diagnostic tests remain valid;
two new Jev tests cover success/failure, retained reservations, key separation,
safe issue paths and no resumption. Independent review found no blockers.

Executed once, exit0:

```sh
node --env-file=.env.local --import tsx scripts/triage-output-diagnostic.ts --confirm-one-diagnostic --jev
```

Saved bounded report:

```json
{"capMicroUsd":1000000,"reservedMicroUsd":58601,"calls":16,"previousLedgerHash":"72af3777314f5815e3f00328722b15ab641bf5968b683311c6566e97b66041f6","runtimeBaseCommit":"a56a708","caseId":"mixed_preference","status":"schema_valid","schemaValid":true,"successfulCostUsd":0.00006468,"issues":[]}
```

The mixed-case response validated this time. Its labels/reply quality were not
scored by this schema-only diagnostic. The previous response was not retained;
its exact defect remains unknown. Do not call the provider problem fixed or
claim that the diagnostic establishes general reliability.

Total16 attempts; cumulative reservation US$0.058601, not billed spend. This
response's usage cost was US$0.00006468. Known response cost including earlier
validated responses/diagnostic is US$0.003380574; three unvalidated earlier
responses have unknown billed costs covered by retained reservations. The
original main ledger remains at15; the one-shot `jev-diagnostic.json` sidecar
carries attempt16 and must be included in any future recovery accounting.

## Fresh verification

- 224 focused prompt/orchestration/routing/evaluation tests passed.
- Full suite:155 files passed,5 skipped;1,235 tests passed,38 skipped.
- Typecheck and targeted lint:exit0.
- Production build:exit0;24 static pages generated.
- Independent review:no blocking findings.
- `git diff --check`:exit0.

No deployment, production configuration change, senior messages or database
operations. Broader active routing remains disabled pending a completed
comparison; no new model retries or automatic resumption occurred.

## Next evaluation design

Current stop-on-any-error protocol leaves most cases uncovered after an invalid
model output. Before another run, review a revised protocol that counts a
schema-invalid decision as a failed case, observes the app's bounded fallback,
and continues to other cases **without retrying the failed model request**.
Transport, unverified pricing/model, usage or cap failures must still stop the
run. Preserve all historical attempts and reservations, distinguish quality
failures from transport failures, and report complete coverage rather than
filtering failures. This protocol revision requires explicit approval before
paid execution; it was not implemented or run in this follow-up.
