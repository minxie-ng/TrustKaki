# One-Click Public Demo Design

**Date:** 29 July 2026  
**Status:** Approved for implementation planning  
**Scope:** isolated browser-only public demonstration

## Context

TrustKaki currently requires a Supabase caregiver session. Its guided demo is
restricted to a trusted `demo_admin` account and mutates one shared Supabase
fixture through privileged demo routes. Publishing those credentials or
exposing the reset path would let unrelated visitors interfere with the judge
workspace and could expose operational controls.

The public portfolio needs a one-click experience that demonstrates the care
workflow without weakening authentication, creating anonymous production
tenants, consuming LLM credits, or triggering external messaging.

## Decision

Add a separate `Explore demo` execution mode that runs entirely in the
visitor's browser with fictional deterministic data.

The authenticated application remains unchanged in authority and purpose:

- `Sign in` opens the real Supabase-backed caregiver workspace.
- `Explore demo` opens an isolated synthetic workspace with no backend calls.

Public demo mode reuses the production dashboard presentation and guided-demo
state rules where practical. It does not claim to execute the production
backend. The interface labels the workspace as demo data.

## Goals

- Let a visitor enter without credentials.
- Demonstrate the complete four-step pattern-to-action workflow.
- Preserve progress across a refresh within the same browser tab.
- Keep each tab's state isolated from other tabs and visitors.
- Provide explicit reset and exit controls.
- Reuse the real care workspace, timeline, and activity presentation.
- Make simulated data unmistakable without adding explanatory clutter.
- Preserve the existing authenticated and live-channel behavior.

## Non-Goals

- Anonymous Supabase Auth users or database tenants.
- Public LLM calls or generated agent output.
- Real WhatsApp, Telegram, scheduler, webhook, or processor activity.
- Cross-device or long-term public-demo persistence.
- Public care setup, contact editing, technical traces, or provider controls.
- Replacing the authenticated judge workflow as backend evidence.

## User Experience

### Entry

The sign-in screen keeps the existing form and primary `Sign in` action. A
separate secondary `Explore demo` action opens the public demo. Supporting copy
states only that the demo uses fictional data and disables external messaging.

### Demo workspace

The visitor enters the guided-demo orientation immediately. The header shows a
compact `Demo data` status and offers:

- `Reset demo`, which restores the orientation and original fictional data;
- `Exit demo`, which removes stored demo progress and returns to sign-in.

The workspace excludes care setup, agent traces, chat simulation, real channel
controls, and authenticated-only navigation.

### Guided flow

1. `Prepare history` creates the deterministic four-day mobility, appetite,
   routine, and social-withdrawal evidence.
2. `Review priority case` exposes the chronological evidence timeline and the
   usual-context comparison.
3. `Record human response` adds Rachel's fictional follow-up and acknowledges
   the case.
4. `Resolve and verify` removes the case from the active queue and retains both
   caregiver actions in Activity.

After completion, the visitor can return to the cleared queue, expand recent
activity inline, reset, or exit.

## Architecture

```text
Home authentication boundary
├── authenticated session
│   └── existing API-backed TrustKaki workspace
└── public demo selection
    └── PublicDemoWorkspace
        ├── deterministic DashboardData fixture
        ├── pure public-demo state transitions
        ├── guided-demo presentation adapter
        └── sessionStorage persistence
```

### Authentication boundary

Public demo state is an explicit client mode, not a fabricated user session.
It has no bearer token and must never pass through authenticated API helpers.
Exiting public demo returns the application to its normal unauthenticated
sign-in state.

### Public demo state module

A pure module owns:

- the schema version;
- the two-hour expiry;
- the initial fictional dashboard state;
- prepare, record-response, and resolve transitions;
- reset behavior;
- serialization validation and safe restoration.

The module accepts a clock where needed so expiry and dated evidence are
deterministic in tests. Invalid, expired, or incompatible stored state falls
back to a clean orientation state.

### Guided command boundary

The guided-demo presentation must not decide where commands execute. Define a
small command interface for:

- prepare history;
- refresh or read current state;
- record the fictional response;
- resolve the fictional case.

The existing authenticated adapter keeps its current API calls. The public
adapter invokes pure local transitions. This avoids duplicating the guide UI
while making accidental public API use testable.

### Storage

Use `sessionStorage`, not `localStorage`.

- Refreshing one tab retains its demo progress.
- Separate tabs have separate state.
- Closing the tab ends the browser session.
- Stored state includes `schemaVersion`, `createdAt`, `expiresAt`, current phase,
  active view, and deterministic dashboard state.
- State expires two hours after creation and is not extended by activity.
- Reset replaces the stored document with a fresh initial state.
- Exit removes the storage key.

Storage failure is non-fatal. The demo continues in memory and shows no
technical error.

### Presentation reuse

Reuse `AppShell`, `Dashboard`, `CareActivity`, `DemoGuide`, and existing
presentation helpers with explicit public-demo props or adapters. Avoid copying
the dashboard component tree.

Public mode supplies fictional contact and context data directly and disables
callbacks that would fetch authenticated resources. Workspace mutations outside
the guided flow stay locked.

## Data And Transitions

### Initial state

- fictional Mr Tan profile and caregiver relationships;
- no active follow-up case;
- no generated four-day evidence;
- guided phase `orientation`;
- workspace view selected.

### Prepared state

- four dated fictional senior messages;
- deterministic medium health, daily-living, and social signals;
- one consolidated pending priority case;
- deterministic Pattern Watch explanation and recommendation;
- no provider identifiers or channel claim.

### Responded state

- the same priority case is acknowledged;
- one fictional caregiver `record_outcome` action appears in the timeline and
  retained activity.

### Resolved state

- the active queue is empty;
- the recorded response and resolution both remain in Activity;
- assessed risk remains unchanged until a new fictional reassessment.

Transitions are idempotent. Repeating a command does not duplicate messages,
signals, queue items, or actions.

## Safety Boundaries

- Public mode performs no `fetch` calls.
- Public mode creates no Supabase browser client and stores no Auth session.
- Public mode does not subscribe to Supabase Realtime.
- Public mode never imports server-only persistence, messaging, or agent code.
- Public mode cannot invoke demo reset, queue-action, orchestration, webhook, or
  processor routes.
- Public fixtures contain no phone number, provider ID, credential, destination,
  or real personal data.
- All visible people and events are identified as fictional demo data.

The existing backend continues to reject unmapped channel senders. Telegram
requires an active verified messaging identity. WhatsApp currently requires a
normalized phone match and should move to the same explicit verified identity
model before a real pilot.

## Error Handling

- Malformed or incompatible storage: discard and start clean.
- Expired storage: discard and start clean.
- Storage unavailable: continue in memory for the current page lifetime.
- Invalid transition: remain on the current phase without changing data.
- Render failure or missing fixture: show the existing bounded operational error
  with a `Reset demo` recovery action.

No public-demo error may redirect into an authenticated route or fall back to a
real API request.

## Testing

### Unit tests

- initial fixture is fictional and contains no external identifiers;
- prepare, respond, and resolve produce the expected state;
- every transition is idempotent;
- resolved state retains both caregiver actions;
- reset returns the clean orientation state;
- valid session state restores after refresh;
- expired, malformed, and wrong-version state resets safely;
- session storage keys are tab-scoped by browser behavior and never use
  `localStorage`;
- public command adapter performs no network calls.

### Component tests

- sign-in remains the primary authenticated action;
- `Explore demo` enters public mode without Supabase sign-in;
- `Demo data`, reset, and exit controls are visible;
- authenticated-only setup, traces, and channel controls are absent;
- exit removes public state and returns to sign-in;
- the full four-step guide reaches retained Activity.

### Regression tests

- authenticated sign-in and sign-out remain unchanged;
- authenticated guided-demo commands still use protected API routes;
- normal caregivers still cannot see demo-admin controls;
- deployment hardening continues to disable development simulators.

### Browser verification

Run the public flow on desktop and mobile viewports. Verify no text overlap,
layout shift, blank state, new-tab navigation, or horizontal overflow. Refresh
at orientation, prepared, responded, and complete phases. Open a second tab and
confirm its demo starts independently.

## Rollout

1. Implement and validate locally using test-first changes.
2. Deploy the same commit to Vercel and EdgeOne.
3. Run public release smoke on both hosts.
4. Run the unauthenticated public demo on both hosts.
5. Rerun the authenticated judge flow to prove no regression.
6. Update `docs/PROJECT_CLOSEOUT.md` with dated evidence.

The public demo is ready for portfolio sharing only after the no-network
boundary, reset, expiry, tab isolation, desktop, and mobile checks all pass.
