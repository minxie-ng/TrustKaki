# TrustKaki General-User Usability Check

Date prepared: 30 July 2026

## Purpose

Test whether a first-time general user can understand and complete TrustKaki's
core fictional care workflow without coaching. This is bounded hackathon
evidence, not target-user validation or formal clinical or production usability
research.

## Privacy Boundary

- Use only `https://trustkaki.vercel.app` and the public `Explore demo` flow.
- Do not collect names, contact details, employer names, account identifiers,
  personal care stories, screenshots containing personal data, or credentials.
- Record only a participant code, broad role category, task results, timing,
  ratings, and one non-personal usability observation.
- Do not use the restricted judge account or any live messaging channel.

## Participant Mix

Target three to five participants. Prefer people with caregiving, Active Ageing
Centre, eldercare, community operations, healthcare operations, social-service,
or adjacent experience. Record the limitation when a participant does not have
relevant experience.

Allowed role categories:

- family caregiver;
- AAC, eldercare, or community-care worker;
- healthcare or social-service operations;
- adjacent operational experience;
- general user without relevant experience.

## Five-Minute Test Script

Give the participant the public URL and say only:

> TrustKaki helps care teams turn everyday senior messages into coordinated
> follow-up. Please open Explore demo and complete the three tasks below. Think
> aloud if comfortable. I will not guide you unless the interface becomes
> unusable.

Start the timer when the participant enters the demo.

1. Find and explain why the current case was surfaced.
2. Find the recommended human follow-up action.
3. Record a response, resolve the case, and find the retained resolution in
   recent activity.

Stop the timer when the participant shows the retained resolution, gives up,
or reaches five minutes.

After the tasks, ask:

1. On a scale from 1 to 5, how easy was the workflow to understand?
2. On a scale from 1 to 5, how confident are you that the follow-up was recorded?
3. What is the single most confusing or useful part of the workflow?

## Success Rules

- Task 1 passes when the participant identifies the visible observations or
  pattern that caused the case to be surfaced without being told where to look.
- Task 2 passes when the participant locates and states the recommended human
  action without being told where to look.
- Task 3 passes when the participant records a response, resolves the case, and
  locates the retained resolution without being told the control sequence.
- A task completed only after coaching is recorded as `COACHED`, not `PASS`.
- A technical failure is recorded separately and is not silently counted as a
  participant failure.

## Results

| Code | Role category | T1 | T2 | T3 | Time | Ease /5 | Confidence /5 | Bounded observation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | General user | COACHED | PASS | PASS | 7 min | 4 | 4 | Described the workflow as useful. |
| P2 | General user | COACHED | COACHED | PASS | 8 min | 4.5 | 4 | No observation provided. |
| P3 | General user | PASS | PASS | PASS | 4 min | 4.5 | 4.5 | Valued the concept of multiple AAC staff coordinating care for many seniors. |
| P4 |  |  |  |  |  |  |  |  |
| P5 |  |  |  |  |  |  |  |  |

Use only `PASS`, `COACHED`, `FAIL`, or `TECHNICAL FAILURE` for task results.

## Summary Calculations

Completed summary:

- Participants: `3`
- Relevant or adjacent experience: `not established; no AAC role represented`
- Unassisted task completion: `6 successful tasks / 9 attempted tasks`
- Participants completing all three tasks unassisted: `1/3`
- Response, resolution, and retained-history task completion: `3/3`
- Median completion time: `7 minutes`
- Median ease rating: `4.5/5`
- Median confidence rating: `4/5`
- Most important usability finding: the core response and resolution workflow
  was completed by all participants, but the case rationale and recommended
  action need clearer first-time discoverability.
- Validation limitations: this was a three-person general-user convenience
  sample using a fictional public demo. No AAC role was represented and
  relevant care experience was not established. Two sessions exceeded the
  planned five-minute cap, two participants required coaching, and the check
  did not measure clinical outcomes or longitudinal use.

Do not describe this check as target-user or AAC validation, convert the small
sample into population-level percentages, or claim clinical validation.

## Product Response

Completed on 30 July 2026:

- The collapsed priority case now labels its rationale `Why this case was
  surfaced` instead of `Why now`.
- The primary action block now says `Recommended human action` instead of
  `Recommended next step`.
- Both sections remain visible before the evidence timeline is expanded and
  expose semantic region names for assistive technology.
- Focused component tests passed, followed by the complete 799-test suite,
  TypeScript, ESLint, and the production build.
- Desktop and mobile browser checks confirmed readable text, no horizontal
  overflow, and no console errors.

This product response has not yet been re-tested with a genuine caregiver,
AAC, eldercare, or adjacent operational user.

## Deck And Closeout Update

Completed on 30 July 2026:

- Slide 12 contains participant count, task outcomes, median time, ratings, the
  main discoverability finding, and the small-sample boundary.
- A fresh 1600x900 thumbnail confirmed that the editable evidence block is
  readable without clipping or overlap.
- `docs/PROJECT_CLOSEOUT.md` records the results and limitations.

The update followed these controls:

After at least three completed sessions:

1. Add a compact evidence block to Slide 12 with participant count, unassisted
   task completion, median time, and the most important bounded finding.
2. Label the evidence as a small fictional-demo usability check.
3. Do not add participant names, unsupported percentages, or clinical claims.
4. Update item D and the Current Verified State in `docs/PROJECT_CLOSEOUT.md`.
5. Re-export the private deck and visually inspect Slide 12 before submission.
