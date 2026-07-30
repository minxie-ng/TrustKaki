# TrustKaki Target-User Validation

Date prepared: 30 July 2026

## Purpose

Test whether a first-time user can understand and complete TrustKaki's core
fictional care workflow without coaching. This is bounded hackathon evidence,
not formal clinical or production usability research.

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
| P1 |  |  |  |  |  |  |  |  |
| P2 |  |  |  |  |  |  |  |  |
| P3 |  |  |  |  |  |  |  |  |
| P4 |  |  |  |  |  |  |  |  |
| P5 |  |  |  |  |  |  |  |  |

Use only `PASS`, `COACHED`, `FAIL`, or `TECHNICAL FAILURE` for task results.

## Summary Calculations

Complete only after the sessions:

- Participants: `__/5`
- Relevant or adjacent experience: `__/__`
- Unassisted task completion: `__ successful tasks / __ attempted tasks`
- Participants completing all three tasks unassisted: `__/__`
- Median completion time: `__`
- Median ease rating: `__/5`
- Median confidence rating: `__/5`
- Most common usability finding: `__`
- Validation limitations: `__`

Do not convert this small convenience sample into population-level percentages
or claim clinical validation.

## Deck And Closeout Update

After at least three completed sessions:

1. Add a compact evidence block to Slide 12 with participant count, unassisted
   task completion, median time, and the most important bounded finding.
2. Label the evidence as a small fictional-demo usability check.
3. Do not add participant names, unsupported percentages, or clinical claims.
4. Update item D and the Current Verified State in `docs/PROJECT_CLOSEOUT.md`.
5. Re-export the private deck and visually inspect Slide 12 before submission.

