# Gate 7 Care Workspace Design

**Date:** 2026-07-18
**Status:** Approved for implementation planning

## Goal

Refine TrustKaki into a calm, efficient AAC staff workspace that makes the
highest-priority senior, the reason for attention, and the next human action
clear within the first viewport. Preserve the existing authenticated care
workflow and keep hackathon demonstration controls separate from normal staff
work.

## Audience And Product Job

The primary user is an AAC staff member or volunteer repeatedly reviewing
several seniors. The page's main job is to answer three questions quickly:

1. Who needs attention first?
2. Why do they need attention now?
3. What human action should happen next?

Hackathon judges remain an important audience, but the interface should
demonstrate value by behaving like a credible care operations product rather
than a technical showcase.

## Selected Direction

Use a calm case workspace instead of the current long stack of equal-weight
panels.

Desktop uses three regions:

```text
+----------------------+--------------------------------+----------------------+
| Ranked senior rail   | Selected senior and case       | Supporting context   |
|                      |                                |                      |
| 1  Urgent            | Profile                        | Care team            |
| 2  Today             | Priority case                  | Usual context        |
| 3  Stable            | Evidence and action            | Latest contact       |
+----------------------+--------------------------------+----------------------+
```

Mobile replaces the left rail with a horizontally scrollable priority strip.
The strip remains above the selected senior and active case so switching and
action remain available in the first viewport.

The rejected alternatives were:

- a refined version of the existing stacked queue, which has lower
  implementation risk but wastes wide-screen space and keeps supporting
  information visually equal to active work;
- a dense operations command board, which exposes more metrics and technical
  activity but is too busy for the current AAC workflow and hackathon scope.

## Priority Rail

The senior coverage area becomes a ranked worklist rather than an alphabetical
directory.

Ordering is deterministic:

1. active follow-up queue priority;
2. policy-authoritative risk severity;
3. latest relevant activity;
4. stable name ordering as a final tie-breaker.

Each rail item contains only:

- priority position;
- circular portrait or initials fallback;
- senior name;
- one short urgency label: `Urgent`, `Today`, or `Stable`;
- one truncated reason when action is required.

Cards use both a colored left edge and a very light background tint. The
interface does not spell out color names. Position and urgency text preserve
meaning for color-vision accessibility. Active high-priority work appears
before stable seniors, with stable seniors grouped under `Monitoring`.

The selected item has a distinct focus/selection treatment that does not
replace its urgency styling.

## Senior Portraits

Gate 7 uses respectful fictional portraits for the three known demo seniors.
The portraits are local optimized bitmap assets, displayed in circles, and do
not represent real service users.

This gate does not add uploads, Supabase Storage, consent administration, or a
database photo column. A small closed presentation mapping selects local demo
assets. Any unknown senior receives deterministic initials and a neutral color
fallback. A missing or failed image also falls back to initials without
changing layout dimensions.

Portraits adjacent to an already visible name are decorative and use empty alt
text to avoid duplicate screen-reader announcements.

## Visual System

The interface should feel like a quiet community-care workspace, not a hospital
system or a generic AI dashboard.

Core colors:

- Ink `#17211D`: primary text and commands
- Porcelain `#F4F7F5`: workspace background
- Eucalyptus `#187652`: operational selection and TrustKaki care identity
- Soft green `#E1F3E9`: stable and supporting information
- Amber `#C27A20`: attention required
- Coral red `#B53A37`: urgent work
- White `#FFFFFF`: primary working surfaces

Purple is a restrained secondary identity accent:

- Muted plum `#705A82`: brand detail and selected AI affordances
- Pale lavender `#F0EBF4`: plain-language AI explanation surfaces

Purple must not replace care-status colors, become a large background, or
appear as a gradient. It should occupy approximately 5-10% of the interface and
distinguish TrustKaki intelligence from care urgency.

Use the existing Geist type family. Headings become smaller and tighter than
the current dashboard hero. Geist Mono is reserved for technical demo details.
Surfaces use 6-8px corners, fine borders, minimal shadows, and no decorative
orbs or gradients.

The signature visual element is the portrait-based priority rail. Other
surfaces remain quiet so this element carries the product identity.

## Information Hierarchy

The main case workspace presents:

1. selected senior identity and concise living context;
2. current urgency and policy risk;
3. priority case headline;
4. plain-language `Why now` explanation;
5. one recommended next human action;
6. the primary case update command;
7. chronological evidence on demand.

Supporting information moves into the right region on wide screens and compact
expandable sections on narrower screens:

- care team;
- known context;
- latest contact;
- proactive check-in schedule;
- masked contact plan;
- context memory;
- evidence and prior actions.

The current case update actions, required reasons, escalation destinations,
stale-conflict behavior, and action history remain unchanged.

## AI And Demo Visibility

Normal staff users see a concise, plain-language explanation inside each case.
Raw agent traces, provider metadata, run durations, and technical validation
controls are not part of the default care workflow.

Authenticated demo administrators can enter the existing explicit demo mode to
access:

- chat simulation;
- Quick Demo and reset controls;
- full agent replay when enabled;
- raw technical traces.

Demo mode remains visibly distinct through restrained plum/lavender accents.
It does not weaken authorization or make demo authority equivalent to
production organisation administration.

## Data And Security Boundaries

Gate 7 consumes the existing authenticated dashboard read model and APIs. It
does not introduce a new ranking service or persistence path.

The presentation layer may derive:

- ordered senior items;
- urgency labels;
- truncated display reasons;
- portrait asset selection;
- initials fallback;
- responsive grouping.

The following remain authoritative and unchanged:

- policy risk from persisted server state;
- queue priority and status;
- organisation membership and volunteer assignment;
- direct family-caregiver access;
- admin mutation authorization;
- transactional command IDs and stale-conflict checks;
- Realtime refresh hints and authenticated polling fallback.

No server-only values, raw destinations, provider payloads, message identifiers,
credentials, or secrets may enter the new presentation model.

## Responsive Behavior

At wide desktop widths, the senior rail and supporting panel remain visible
while the main case region scrolls normally. The layout must not create nested
cards or horizontal page overflow.

At intermediate widths, the supporting panel moves below the main case while
the senior rail remains available at a reduced fixed width.

On mobile:

- seniors appear in a horizontally scrollable priority strip;
- each strip item has a stable width and touch target;
- the selected senior and primary case remain in the first viewport;
- supporting sections follow the case as expandable blocks;
- text wraps or truncates without overlapping controls;
- scroll position does not unexpectedly jump when background refreshes arrive.

## Interaction And Accessibility

- All senior selectors and commands are keyboard reachable.
- Focus indicators remain visible against every tint.
- Touch targets are at least 44px in their interactive dimension.
- Status never depends on color alone.
- Text and controls meet WCAG AA contrast.
- Portrait dimensions remain fixed during loading and fallback.
- Selection transitions are brief and respect `prefers-reduced-motion`.
- Loading placeholders preserve final dimensions to prevent layout shift.
- Empty, unavailable, unauthorized, and stale-conflict states explain the next
  available action in plain language.

## Component Boundaries

Implementation should follow existing dashboard boundaries rather than replace
the application shell.

Expected responsibilities:

- a focused presentation helper derives ordering, urgency, portrait, and
  fallback values;
- `SeniorCoverage` becomes the desktop rail and mobile priority strip;
- `SelectedSeniorSummary` becomes the compact profile header;
- `PriorityCase` remains responsible for the active case and human action;
- existing contact, context, schedule, and detail components are recomposed
  into supporting sections without changing their API behavior;
- `NavBar`, `ChatSimulation`, and `AgentTracePanel` receive only the styling and
  demo-mode placement changes required by this design.

Avoid a new design-system layer. Shared tokens belong in the existing global
CSS/Tailwind theme only when they remove real duplication.

## Verification

Focused tests must cover:

- deterministic senior ordering and tie-breaking;
- urgency labels for active and stable seniors;
- known demo portrait selection;
- unknown and failed-image initials fallback;
- compact reason truncation without altering source data;
- selected-senior behavior after background refresh;
- demo-only visibility of raw technical traces;
- preservation of existing case actions and stale-conflict behavior.

Run the complete non-live validation gate after focused tests.

Browser verification must cover at least:

- desktop workspace at 1440x900;
- tablet/intermediate layout around 1024x768;
- mobile layout at 390x844;
- ranked ordering and visible urgency;
- senior switching;
- opening and exercising the existing case form fields without overlap;
- empty and loading states;
- keyboard focus;
- reduced motion;
- no console errors, error overlays, horizontal overflow, clipped text, or
  broken portrait assets.

Use screenshots to compare the implemented result with the approved calm case
workspace. Existing focused tests verify case submission semantics and stale
conflicts. Live database operations are not required unless implementation
changes a server or persistence boundary, which this design explicitly avoids.

## Out Of Scope

- profile photo uploads or storage administration;
- database photo schema;
- staff roster management;
- new organisation or authorization behavior;
- new queue ranking persistence;
- family notification fan-out;
- WhatsApp account recovery;
- distributed infrastructure or load testing;
- broad marketing-site redesign;
- changes to deterministic risk policy or agent prompts.

## Completion Standard

Gate 7 is complete when an AAC staff user can identify the highest-priority
senior, understand the reason, and begin the correct human follow-up within the
first viewport on desktop and mobile; all existing authorization and caregiver
actions remain intact; demo-only technical detail remains available without
dominating normal work; and focused, full, and visual verification pass.
