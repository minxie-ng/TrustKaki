# TrustKaki UI Revamp Design

**Date:** 2026-07-28

**Status:** Approved visual and interaction direction; ready for implementation planning after written-spec review

## Objective

Redesign TrustKaki as a premium, human-designed care operations product while
preserving the completed feature set, API contracts, persistence, authorization,
deterministic policy authority, and release hardening.

The primary experience serves AAC staff and caregivers doing repeated daily
work. A restricted demo mode adds a polished, linear path for hackathon judges
without replacing the real authenticated workspace with a slideshow.

## Product Principles

1. The main screen answers three questions quickly: who needs attention, why,
   and what should a human do next?
2. Caregiver operations take priority over AI implementation detail.
3. Demo mode exposes exactly one dominant action at each state.
4. Visual warmth comes from type, language, portraits, and restrained color,
   not decorative effects or excessive rounded cards.
5. Status always uses plain text plus an 8px solid color dot. Color never
   appears without a text label.
6. The redesign changes presentation and navigation, not safety, tenancy,
   persistence, messaging, or policy behavior.

## Visual Direction

### Identity

The selected direction is **The Care Desk**: calm care operations with touches
of Singapore community warmth. It should feel trustworthy, practical, and
human rather than clinical, consumer-wellness-oriented, or technical.

The signature element is the **care thread**: a restrained vertical line with
small circular evidence markers that turns scattered daily events into one
legible pattern. This is used only where chronological evidence is meaningful.

### Palette

Primary palette:

- `Care Ink` `#18231E`: primary text
- `Evergreen` `#1D3C35`: navigation and structural emphasis
- `Mist` `#F2F4F3`: neutral workspace background
- `Paper` `#FFFFFF`: main working surface
- `Human Coral` `#CB5545`: the single dominant action and active-step accent
- `Hairline` `#B8C1BD`: borders and structural rules

Functional status dots:

- stable or completed: `#347A59`
- needs attention or pending: `#C57B1D`
- failed or urgent operational error: `#B9463D`

Functional colors are reserved for status dots, validation, and relevant
left-edge notices. They are not page themes or filled badges.

### Typography

- Display and section headings: `Source Serif 4`, with a system serif fallback.
  It is used sparingly for product name, page titles, and case headlines.
- Body and controls: `Source Sans 3`, with a system sans-serif fallback.
- Technical run details only: the existing monospace stack.

Typography must not scale with viewport width. Letter spacing remains zero for
normal text; only short uppercase utility labels may use positive tracking.

### Geometry And Effects

- No drop shadows.
- No ambient background glows.
- No neon text.
- No gradients or gradient borders.
- No floating page-section cards.
- No filled status pills or badges.
- Main surfaces share edges and use borders, whitespace, and typography for
  hierarchy.
- Buttons and inputs use at most a `2px` radius.
- Portraits and status/evidence dots remain circular because their shape has a
  semantic purpose.
- Repeated items may use borders and active left edges, not isolated rounded
  tiles.

## Information Architecture

### Primary Navigation

The authenticated app shell contains:

1. **Care workspace**: senior roster, active follow-up case, immediate action,
   and selected-senior context.
2. **Activity**: retained case history, caregiver actions, observed signals,
   and case transitions.
3. **Care setup**: context, proactive check-in schedules, and contact plans in
   one consistent drawer or focused subview.
4. **Demo tools**: reset, guided walkthrough, and run details. This entry is
   visible only to authorized demo administrators.

No new backend feature is implied by these labels. They reorganize existing
read models and controls.

### Desktop

At `1280px` and above, the Care workspace uses three stable regions:

- `210px` senior roster
- flexible active-case workspace
- `245px` selected-senior care context

The roster and context regions use flat neutral surfaces separated by hairline
borders. The active case uses the white working surface and owns the strongest
heading and action hierarchy.

### Tablet

At tablet widths, the senior roster remains beside the case. Care context moves
below the active case. Administrative editing opens as a full-width lower
drawer or focused overlay with stable dimensions.

### Mobile

Mobile does not stack all desktop columns. It exposes three explicit views:

- **Queue**
- **People**
- **Context**

Queue is the default and keeps the selected senior, status, concise evidence,
and current human action visible. Care setup opens as a focused full-screen
subview. Technical details never compete with the care action.

## Care Workspace

### Senior Roster

Each row contains:

- portrait or initials fallback
- respectful display name
- status dot and plain-language status
- active left-edge marker when selected

Rows share the roster surface. They do not float as individual cards and do not
move or gain shadows on hover.

### Priority Case

The selected case presents:

1. senior identity and plain-language attention status
2. concise explanation of why the case exists
3. chronological care thread
4. one evidence-bound suggested human action
5. current valid caregiver command

AI-generated explanation remains labelled. Deterministic policy evidence and
risk remain authoritative. Normal caregivers do not see technical traces.

### Empty Queue

An empty queue is a successful operational state, not a blank card. It states
that no active follow-ups remain and keeps recently completed activity
available below.

## Guided Demo

### Hybrid Entry

Demo mode starts with a short orientation screen:

- literal product value: quiet changes becoming human action
- four-step overview
- estimated duration
- one action: **Start guided demo**

The authenticated workspace is not displayed beside this opening. When Start
is selected, the opening is unmounted before the workspace guide appears.

### Four-Step Flow

1. **Prepare Uncle Tan's history**
   Reset the authorized fictional demo and build the four-day scenario.
2. **Review today's priority case**
   Open the case and review the evidence-bound care pattern.
3. **Record the human response**
   Save the controlled fictional follow-up outcome.
4. **Resolve and review history**
   Resolve the active case, confirm the queue clears, and retain its history.

At every state:

- at most one coral primary action is rendered;
- later actions are unavailable or visually subordinate;
- a successful API response and the expected refreshed dashboard state are
  required before progression;
- failure keeps the current step active and offers one specific retry;
- completed steps recede into a compact progress summary;
- an unobtrusive text action can exit demo mode without becoming a competing
  primary command.

The guide is a deterministic client state machine validated against persisted
application state. It must not advance solely because a button was clicked.

## Supporting Workflows

### Activity

Activity is a chronological, source-labelled view of observed signals, policy
events, caregiver actions, and case transitions. It uses the care-thread pattern
and preserves actor, action, outcome, and time distinctions.

### Care Setup

Senior context, proactive check-ins, and contact plans share one drawer pattern
with three tabs:

- Context
- Check-ins
- Contacts

The drawer uses stable dimensions, explicit save/cancel commands, existing
authorization, and inline validation. It does not duplicate data or bypass
existing API routes.

### Demo-Only Technical Detail

Agent run details remain behind a deliberate demo-admin-only disclosure.
Opening run details cannot change the care workflow or expose secrets, raw
destinations, provider payloads, or unredacted identifiers.

## Entry And Operational States

### Sign-In

The sign-in screen uses the flat neutral system and clearly states that access
is restricted to authorized caregivers and AAC staff. It contains no marketing
hero, decorative illustration, or demo credentials.

### Loading

Loading placeholders reserve final layout dimensions. They use flat neutral
lines without pulsing glow, layout shift, or blocked unrelated controls.

### Errors And Conflicts

- Errors remain inline until resolved and explain the recovery action.
- A failed refresh keeps the last loaded data visible and offers Retry.
- Unauthorized state offers sign-in again.
- Shared-case conflicts state that another caregiver changed the case and
  require reviewing the latest state before saving.
- Success feedback uses bounded live-region announcements and does not obscure
  the next control.

## Component Boundaries

Implementation should preserve existing API and data contracts while evolving
the presentation into these focused units:

- `AppShell`: navigation, role-aware entries, and responsive view container
- `DemoGuide`: deterministic demo state and current primary action
- `CareWorkspace`: selected-senior composition
- `SeniorRoster`: coverage ordering and selection
- `PriorityCase`: summary, evidence, recommendation, and action entry
- `CareActivity`: retained chronological history
- `CareContext`: concise operational context
- `CareSetupDrawer`: Context, Check-ins, and Contacts editing
- `OperationalState`: loading, empty, error, unauthorized, and conflict patterns
- `RunDetails`: restricted demo-admin technical disclosure

These names describe responsibilities, not a requirement to create one file per
item. Existing components should be reshaped where their boundaries already
match. New abstraction is justified only when it removes real duplication or
isolates stateful behavior.

## Data And State Flow

Existing authenticated API routes remain the only browser data boundary.
Supabase and provider credentials remain server-side.

```text
Authenticated app shell
  -> existing dashboard and supporting API reads
  -> existing typed dashboard state
  -> view-specific presentation models
  -> Care workspace / Activity / Care setup

Demo administrator starts guide
  -> authorized existing demo command
  -> successful response
  -> refresh authoritative dashboard state
  -> validate expected persisted state
  -> advance exactly one demo step
```

Visual navigation state may be client-side. Care state, permissions, queue
status, policy evidence, and caregiver mutations remain authoritative on the
server and in Supabase.

## Accessibility And Interaction

- WCAG AA contrast for text and controls.
- Color never carries meaning without text.
- Visible `2px` focus outline with adequate offset.
- Logical focus order and skip-to-content support.
- Minimum `44px` touch targets for primary interactive controls.
- Dialogs and drawers trap focus, restore focus on close, and close with Escape
  where safe.
- Reduced-motion preferences disable non-essential transitions.
- No hover-only information.
- Stable board, toolbar, tab, and action dimensions prevent layout shift.
- Mobile text and control labels wrap without overlap or truncating critical
  meaning.

## Implementation Constraints

- Preserve all existing features and backend behavior.
- Preserve deterministic policy authority and source labelling.
- Preserve role, tenancy, senior-access, and demo-admin boundaries.
- Preserve API routes and typed contracts unless a presentation requirement
  proves a minimal compatible extension is necessary.
- Do not add a component library merely to obtain styling.
- A small icon package may be added only if it replaces ambiguous text controls
  consistently and is pinned in the lockfile.
- Do not introduce new gradients, shadows, glow utilities, or status fills.
- Do not expose agent traces in the normal caregiver workflow.

## Verification

### Automated

- Preserve the complete existing Vitest suite.
- Add focused unit tests for demo-state transitions, including failed commands,
  stale state, retries, exit, and completion.
- Add component tests for one-primary-action enforcement, status dot plus text,
  navigation authorization, mobile tabs, drawer focus behavior, empty state,
  refresh failure, and conflict recovery.
- Run TypeScript, ESLint, and the production build through `npm run validate`.

### Browser

Verify authenticated behavior at desktop, tablet, and mobile viewports:

- desktop: `1440 x 900`
- tablet: `1024 x 768`
- mobile: `390 x 844`

Capture and inspect the sign-in screen, normal care workspace, each demo step,
empty queue, Activity, Care setup, loading, error, and conflict states. Check
for overflow, overlap, clipped text, layout shift, keyboard traps, blank media,
and inaccessible focus.

### Release

After the revamp is complete:

- deploy one exact clean commit;
- run the credential-free public smoke;
- run the authenticated judge walkthrough;
- confirm normal caregivers cannot see demo tools or technical traces;
- rerun the final security/privacy review and rollback rehearsal required by
  Gate 8.

## Non-Goals

- New care, messaging, scheduling, contact, memory, or policy features
- New database tables or migrations
- A marketing landing page
- Enterprise roster or analytics expansion
- Full localization before a pilot defines required languages and translated
  operational copy
- Real AAC pilot or clinical-use approval
