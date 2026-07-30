# TrustKaki Top-One Submission Sprint Design

## Objective

Increase TrustKaki's evidence-based competitiveness against the official
preliminary rubric without adding unsupported claims or unrelated product
features.

The current strict baseline is:

- Impact and Relevance: 26/30
- Use of AI Tools: 29/40
- Project Quality: 27/30
- Base score: 82/100
- Social reach bonus: 0/5

The sprint targets a credible 91-95/100 base score plus the five-point social
reach bonus. This is a planning target, not a promised judging result.

## Priorities

Work proceeds in this order:

1. Correct the multi-agent explanation so every routing claim matches runtime
   behavior.
2. Build and run a reproducible synthetic AI benchmark.
3. Add measured benchmark evidence to the deck.
4. Conduct bounded target-user validation with fictional data.
5. Add one legitimate WorkBuddy workflow only if access becomes available.
6. Produce the short demonstration video and qualifying social post.
7. Complete final QA, compliant file naming, and submission audit.

WhatsApp provider restoration remains separate and blocked. It must not delay
these independent scoring improvements.

## Multi-Agent Evidence

Slide 9 must describe conditional routing accurately.

For the existing appetite-and-knee-pain example:

- Triage always runs and identifies observed care signals.
- Deterministic safety policy remains authoritative for final risk and allowed
  actions.
- Pattern Watch compares validated signals over time.
- Briefing runs only when policy requires human follow-up.
- AAC Nudge is presented as conditional on social-disconnection signals.
- Digital Safety is presented as conditional on scam or coercion indicators.
- Context Memory is presented as conditional on durable preferences or context,
  not a temporary symptom.

The slide must say that the coordinator selects from available specialists. It
must not imply that every specialist runs for every message.

## Synthetic AI Benchmark

### Dataset

Create 40-60 fictional cases with no real personal data. Cases cover:

- health, appetite, mobility, and daily-routine changes;
- social withdrawal and low-pressure AAC outreach;
- scam, coercion, suspicious-link, and financial-pressure indicators;
- durable communication, food, accessibility, and caregiver preferences;
- harmless small talk and ordinary acknowledgements;
- prohibited memory content that must be excluded or redacted;
- ambiguous inputs and unavailable-provider fallback behavior.

Each case declares only reviewable expectations:

- specialists that must run;
- specialists that must not run;
- whether human follow-up is expected;
- whether Digital Safety recall is required;
- whether durable context may be proposed;
- the allowed deterministic risk boundary.

### Modes

The benchmark has two explicit modes.

1. Deterministic mode runs without network access and evaluates policy,
   durable-context gates, schema contracts, and fallback behavior.
2. Live mode uses the configured production-compatible LLM provider against the
   same fictional cases. It is opt-in, bounded, and never part of the default
   test suite.

Live mode must not write to Supabase, invoke messaging providers, or expose API
keys. It records aggregate metrics and sanitized per-case pass/fail reasons.

### Metrics

Report:

- route exact-match rate;
- required-specialist recall;
- forbidden-specialist avoidance;
- Digital Safety recall;
- durable-context gate precision;
- schema-valid response rate;
- fallback rate;
- median and p95 orchestration latency.

Metrics must be generated from a committed case set. Failed cases remain in the
report and are not removed merely to improve the score.

### Evidence

The repository contains:

- the fictional benchmark cases;
- focused unit tests for scoring and data validation;
- a documented command for deterministic and live modes;
- a sanitized Markdown summary generated from the final bounded run.

Only results from that summary may be placed in the submission deck.

## Target-User Validation

Run the fictional public demo with three to five participants who have relevant
caregiving, AAC, eldercare, or adjacent operational experience where possible.

Participants complete three tasks:

1. identify why the case was surfaced;
2. find the recommended human action;
3. record or locate the retained resolution.

Record role category, task success, completion time, and one bounded usability
observation. Do not record names, contact details, personal care stories, or
other personal data. Report limitations when participants are not target users.

## WorkBuddy Boundary

WorkBuddy usage is optional and must be genuine.

If access becomes available, create one bounded AAC shift-handover workflow that
reads a fictional TrustKaki case export, checks required context, identifies
missing follow-up information, and writes a handover document. Preserve the
prompt, output, and limitations as evidence.

If access remains unavailable, state that fact. Do not repackage Codex work or
claim WorkBuddy created TrustKaki.

## Video And Social Evidence

After the benchmark and deck are final, create a 90-120 second demonstration:

- problem and target users;
- message-to-case workflow;
- human response and retained history;
- conditional multi-agent routing and safety control;
- Vercel, Supabase, and Tencent EdgeOne deployment roles.

The public post must contain no credentials or identifiers and must use the
hashtags required by the handbook. Publication occurs only after the public
repository and screenshots pass the release checklist.

## Submission Controls

- Submit the Vercel web link as the primary operational demo.
- Keep the credential-bearing native Google Slides file private.
- Export and submit the deck as
  `TrustKaki-Project Introduction Deck-SandSeed.pptx`.
- Keep EdgeOne visible as the Tencent-hosted secondary deployment.
- Confirm the participant-only form fields and exact deadline cutoff.
- Submit by 7 August rather than waiting for the 9 August deadline.

## Verification

The sprint is complete only when:

- Slide 9 matches the implementation and has a fresh visual review;
- benchmark tests demonstrate a red-green cycle and the final suite passes;
- the benchmark report is reproducible from committed fictional cases;
- deck metrics match the report exactly;
- Vercel and EdgeOne release smoke checks pass;
- judge sign-in and the four-step live workflow pass;
- mobile and keyboard acceptance checks pass;
- the PPTX name follows the handbook;
- the social post is public and contains the required hashtags; and
- the submission form confirms acceptance.
