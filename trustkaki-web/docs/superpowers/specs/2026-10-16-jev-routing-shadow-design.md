# Jev central routing assessment

## Intent and approval

Owner accepted the proposal to assess Jev alongside existing Triage, then asked
to proceed on 16 October 2026. This authorizes local evaluation preparation;
it does not authorize paid calls, production routing changes or promotion.
The desired role is central routing coordinator. Better performance is a
hypothesis, not an accepted conclusion or pitch claim.

## Alternatives

1. Keep social-intent specialist only: smallest scope, existing narrow evidence.
2. Evaluate central routing in shadow: recommended; assess broader usefulness
   without letting a new classifier suppress existing safety checks.
3. Replace Triage immediately: reject for now. Triage also extracts descriptions
   and generates replies, which Jev's typed decisions do not replace.

## First slice

This section records the completed initial screening scope. The subsequent
owner-approved local runtime slice is recorded in
[runtime evidence](../../evidence/2026-10-16-jev-routing-shadow-runtime.md): it
imports the extracted shared contract, remains disabled by default and never
uses shadow output as action authority.

Evaluation-only code under `src/lib/agents/evaluation/`: request contract, parser,
fictional dataset, unchanged-Triage output adapter and scorer. A separate
`scripts/routing-shadow-live.ts` runner prepares the capped experiment. No runtime
import or feature flag. No live execution in this slice. This isolates semantic routing
quality before a separately approved paid comparison and whole-flow experiment.

Ask six independent questions, each answered `present`, `absent` or `unclear`:
health concern, daily-living concern, digital-safety concern, social concern or
activity preference, safe durable-context proposal, current urgent danger.
Multiple concerns can coexist. These are proposed signals, never diagnoses,
final risk levels, action permissions or evidence that an external action occurred.

Send the same fictional current message, bounded history and supplied personal
context to both paths. Use actual `TRIAGE_PROMPT`, `triageUserPrompt` and
`triageOutputSchema` for the later baseline; do not rewrite Triage as a smaller
classifier or infer classifications from its reply text.

Map baseline health/daily-living/digital signals to broad types; current emergency
category to urgent danger; `context_memory` routing to durable-context proposal.
For social, use `social_isolation` category or an uncategorized broad social
signal. Exclude `caregiver_aac_escalation`: Triage puts generic caregiver needs
in its broad social type even when no social participation concern exists.
This explicit semantic adapter applies the same social definition as Jev.
Require the complete run envelope with `fallback: false`, not only schema-valid
output data; actual Triage fallback data resembles an all-negative result. Triage
has no explicit abstention per field: absent extracted flags map to `absent`.
Record its different output contract and full response cost when comparing.
Malformed/fallback Triage outputs must be recorded as failures, not silently
adapted as negatives.

## Corpus and review

Twelve new scenario families, each in English, Mandarin and Singlish: 36 messages,
but only 12 independent semantic families. Split by family, never by translation:
six development and six reserved families. Cover single concerns, mixed concerns,
urgent/scam overlap, durable context, remembered-fact queries, quoted third-party
speech and underspecified messages. Context is fictional and supplied in memory;
do not query Supabase, Neon or Pinecone.

Developer labels were reviewed by a separate AI reviewer before any model calls,
with initial English family labels recorded blind before inspecting expected
labels. Review identified missing held-out daily-living coverage and ambiguous
durable-context labeling; corrected both and re-review approved revised labels. This is not
clinical/expert annotation. Freeze corpus and prompt hashes before paid calls.
Do not tune on reserved results. Broader deployment evaluation needs fresh
independently labelled scenarios; this small corpus is an initial screen.

## Measurement and decision rules

Report each flag's correct, false-positive, false-negative and abstention counts;
report urgency/scam missed-positive counts separately. Abstention on an expected
positive is a miss for detection, even when a later fallback could recover it.
Report exact-case agreement, per-language and per-family scores and coverage.
Do not count abstentions as correct negatives. Probabilities are unvalidated on
this task; confidence is not a guarantee of correctness.

Any missed explicit urgent/scam positive blocks promotion from this screen.
Otherwise require no reduction in held-out positive recall versus Triage,
inspect false positives and abstentions, and require an operating benefit in a
subsequent whole-flow comparison. Passing this screen alone does not prove
general safety or authorize replacing Triage.

## Later checkpoints

Before live evaluation: verify current official prices match the fixed runner
rates, then obtain separate spending approval. The runner has a separate persistent
ledger, exclusive run lock, frozen request/corpus hash, full-plan budget preflight,
72-attempt bound, 15-second timeout, no retries and stop on provider/parser
failure. Its separate cap is US$1. GPT-4o-mini is pinned to 2024-07-18 with a
1,024-output-token bound; Jev 1.14 reserves full-context input cost per request
and requires reported cost and stable resolved version. Rates are the earlier
verified US$0.042/M Jev input, US$0.15/M GPT input and US$0.60/M GPT output;
they must be rechecked before real execution. Do not reuse earlier
social-intent authorization or its completed ledger.

Before runtime adoption: test policy outputs, grounded replies, memory handling,
mixed intents, provider failure and end-to-end cost/latency. Initially leave
existing Triage and safety checks running; measure which work could actually be
removed before promising savings. Keep policy authorization and caregiver access
outside model control. Any production change follows separate release approval.

## Presentation language

Now: “We integrated Jev for structured social-intent decisions and are evaluating
broader routing.” After measured routing adoption: “Jev coordinates specialist
routing; a conversational model writes replies, RAG supplies personal context,
and explicit policy rules constrain actions.” Do not claim a central role that
has only been evaluated offline or vendor-wide speedups that we did not measure.
