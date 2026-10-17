# Priority-first UI revamp

Date: 17 October 2026 (Asia/Singapore)
Status: approved for implementation by owner; release approval remains separate

This is the approved UI source of truth for the remaining hackathon sprint.
It updates the July Care Desk design where layout/hierarchy differs. The active
BUILD_ROADMAP remains the overall project source of truth.

## Decisions settled in the owner interview

1. AAC staff first; family caregivers use the same workspace within their existing
   authorised senior scope. No new roles or access grants.
2. Laptop first, usable mobile layout.
3. Retain the green identity; redesign layout, typography hierarchy and spacing.
4. First five seconds: priority senior, reason and next human action.
5. Compact relevant personal context; source and last-confirmed date; expand for
   fuller history and existing authorised management controls.
6. Separate restricted judge demo with chat and a readable Jev/RAG decision trail.

## Proposed visual direction: a focused Care Desk

A calm community-care workspace. One selected case gets the clearest visual
weight, with its recommended human action visible above deeper evidence.
The distinctive element is the existing care thread: dated observations aligned
on one chronological line, showing how a change emerged over time.

## Visual refinement approved after the first implementation

The owner requested a more visible change to fonts, buttons and colours after
finding the first pass too similar. This supersedes the initial Source font,
square-corner and coral-primary direction.

| Role | Value |
| --- | --- |
| Evergreen brand | #164F3E |
| Ink primary text | #1D342B |
| Paper working surface | #FFFFFF |
| Mist canvas | #F2F6F3 |
| Sage identity surface | #E6F1E8 |
| Selected roster row | #DCEEE1 |
| Primary action / hover | #216548 / #174F37 |
| Hairline dividers | #D9E4DC |

Manrope headings, DM Sans body; both font variables live on the root html element
so theme aliases resolve correctly. Body 15px, supporting labels 12–14px, case
heading 25px and selected senior 30–34px. Green primary buttons, quiet bordered
secondary controls, 8px control corners and 12–16px panel corners. White navigation,
sage identity panel and a softly highlighted action section establish hierarchy.
Retain labelled green/amber/red statuses and visible keyboard focus. No shadows,
gradients, ornamental animation or new imagery.

Self-critique: another set of equal-weight cards would retain the current
scanning problem. Use one working surface and a clear action section instead.
The care thread carries meaning through chronology; decorative counters and
unrelated charts add no decision value here.

## Desktop layout

At wide laptop sizes, three regions with unequal weight:

```text
TrustKaki        Care workspace | Activity | Care setup       Demo [admin]
-----------------------------------------------------------------------
SENIORS         SELECTED SENIOR                         WHAT WE KNOW
Urgent / Today  Name · age · case status                Relevant preference
Compact rows    What changed + when                    Source · confirmed date
                Recommended human action               Up to 3 useful facts
Selected row    [Update case]                           [View all context]
                Why this surfaced                       Care contacts
                [Expand dated evidence]
```

- Roster about 240–260px. One heading; priority groups and status words.
- Main case is the largest region. Senior identity appears once; remove duplicate
  risk, last-response, address and contact summaries around the same case.
- Right context region about 292px when space permits. Contacts appear here
  rather than being repeated in the main identity block.
- At narrower laptop widths, context becomes an expandable section under the
  selected case; preserve enough width for reading and completing case updates.
- Preserve the user's explicit selection during refresh; do not unexpectedly
  switch to another senior. Priority ordering makes the next case discoverable.
- Keep urgent reason/evidence visible. Collapse deeper history, never hide an
  urgent safety concern behind a disclosure.

## Actions and content

- Existing Update case opens the retained action form: acknowledge, assign,
  record follow-up, snooze, escalate or resolve, as supported by case state.
- Surface one strong action button next to the recommendation; secondary history
  and setup controls remain visually quieter. Buttons describe actual effects.
- No button implies the app has called a senior, notified family or booked an
  activity. Existing human-owned workflow remains intact.
- Recorded actions receive visible success feedback. Resolve removes the active
  item while preserving history. Keep existing stale-editor/conflict handling.
- Use existing factual pattern descriptions and dated evidence. Do not invent
  a diagnosis, cause, certainty or new care recommendation for presentation.

## What we know

- Show at most three active facts useful to the selected case, using available
  case references/application tags and confirmation metadata. Label this as known
  context; do not call the profile preview a live semantic retrieval result.
- Show actual source and last confirmation, or an honest missing-value label.
  Distinguish empty context, unavailable context and loading.
- Fuller context opens existing context/history controls. Rename the management
  entry from Confirm details to Edit / confirm (final wording during build).
- Preserve existing demo-admin edit/archive permissions and conflict checks.
  Ordinary staff do not acquire management rights through the redesign.

## Judge demo

- A separately labelled admin-only workspace reuses existing chat and run data.
- Show the senior message and one selected reply alongside a compact decision
  trail: retrieved context (when recorded), Jev specialist requests/execution,
  final policy decision, selected response and persistence status.
- Display the actual model/version, fallback and recorded execution. Never infer
  that a specialist ran merely because it was requested.
- Run-specific retrieved context must come from the actual run; saved profile
  facts cannot be presented as retrieval evidence. If a needed run summary is not
  currently exposed, add only the minimal authorised summary to existing demo
  data; no extra model calls or new tracing platform. Show not recorded or
  unavailable rather than simulate evidence.
- Raw values stay expandable. No chain-of-thought, keys or raw provider payloads.
- Explain Jev as specialist routing, with deterministic policy retaining final
  risk authority. Show a pending/rejected memory write honestly.

## Mobile and states

Retain Queue / People / Context navigation. Queue opens with senior identity,
reason and action; context/history follows through the relevant tab/disclosure.
Use at least 44px touch targets, visible focus, readable type, useful wrapping and
no horizontal page scrolling at 390px. Keep admin controls restricted on mobile.

Cover urgent, routine, resolved, no selected case, empty context, loading,
failed refresh and expired session. Empty/error views give a specific recovery
step using the existing APIs. Do not display stale prior-account content.

## Deadline-sized implementation order

1. Care workspace: roster, selected identity, case hierarchy and action placement.
2. Compact context preview and clearer existing context-management labels.
3. Demo chat/decision trail and consistent visual polish across touched surfaces.
4. Focused behavior/accessibility checks, desktop/mobile browser inspection,
   one final build/release batch and remaining chat-preference hosted check.

Reuse Dashboard, SelectedSeniorSummary, PriorityCase, SeniorCoverage,
SeniorContextPanel, ChatSimulation, AgentTracePanel, existing portraits and component behavior.
Preserve forms, persistence and permissions. No new dashboard analytics, event
integrations, role model, storage service or autonomous outreach in this sprint.

Acceptance: from the default laptop view, a person can identify priority senior,
reason and next action without opening technical detail; demo evidence describes
actual execution; existing authorised action/context flows still work.
Target-user five-second usability validation is not yet measured and must not be
claimed from developer inspection alone.

## Implementation checkpoint

Owner approved implementation with “proceed for now”. The Care Desk and judge
workspace are implemented locally. The compact preview prioritises personal
preferences and caps the display at three active facts; it does not claim
case-specific semantic ranking. Actual semantic retrieval is shown only from
validated evidence returned for a submitted judge request.

Release and the remaining hosted memory example are separate checkpoints.
