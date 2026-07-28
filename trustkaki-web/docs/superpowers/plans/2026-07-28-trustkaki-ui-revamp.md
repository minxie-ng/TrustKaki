# TrustKaki UI Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild TrustKaki as a flat, premium caregiver operations workspace with a deterministic one-action-at-a-time judge demo while preserving every existing care, security, persistence, and authorization behavior.

**Architecture:** Keep `src/app/page.tsx` as the authenticated data owner and existing API routes as the browser boundary. Add focused presentation units for the app shell, activity, care setup, operational states, status indicators, and guided-demo state; extend `DashboardData` compatibly with selected-senior caregiver activity read from the existing `caregiver_actions` table. Mutations continue through the existing demo and queue-action endpoints and the demo advances only after its command succeeds and a refreshed dashboard matches the expected persisted state.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS 4, Supabase, Vitest, React DOM server rendering, jsdom for focus interaction tests, existing authenticated API routes

---

## File Map

- Create `src/components/ui/StatusIndicator.tsx`: the only status-dot primitive.
- Create `src/components/ui/StatusIndicator.test.ts`: dot, label, and no-filled-badge contract.
- Create `src/components/OperationalState.tsx`: loading, empty, error, unauthorized, and conflict presentation.
- Create `src/components/OperationalState.test.ts`: stable semantics and recovery action tests.
- Create `src/components/AppShell.tsx`: authenticated navigation, responsive content surface, skip link, role-aware demo entry.
- Create `src/components/AppShell.test.ts`: navigation authorization and active-view tests.
- Create `src/components/dashboard/CareActivity.tsx`: chronological retained caregiver history.
- Create `src/components/dashboard/CareActivity.test.ts`: source labels, resolved history, and empty history.
- Create `src/components/dashboard/CareSetupDrawer.tsx`: accessible Context/Check-ins/Contacts drawer composition.
- Create `src/components/dashboard/CareSetupDrawer.test.tsx`: tabs, Escape, initial focus, and focus restoration.
- Create `src/components/dashboard/demoGuideState.ts`: pure deterministic judge-demo state machine and persisted-state predicates.
- Create `src/components/dashboard/demoGuideState.test.ts`: success, stale refresh, retry, exit, and completion transitions.
- Create `src/components/dashboard/DemoGuide.tsx`: orientation plus one-current-command guided UI.
- Create `src/components/dashboard/DemoGuide.test.ts`: one-primary-action and workspace/orientation exclusivity.
- Create `src/components/visualSystemGuard.test.ts`: repository-level prohibition of disallowed visual utilities.
- Modify `package.json`: add direct `jsdom` development dependency for DOM interaction tests.
- Modify `package-lock.json`: pin the test dependency resolution; do not run `npm audit fix`.
- Modify `src/app/layout.tsx`: load Source Serif 4 and Source Sans 3 with `next/font/google`.
- Modify `src/app/globals.css`: exact approved tokens, typography, focus, reduced-motion, and flat global rules.
- Modify `src/app/page.tsx`: awaitable dashboard refresh, operational states, app-view state, and guided-demo composition.
- Modify `src/components/NavBar.tsx`: flat product header with plain dot-plus-text risk and role-aware demo command.
- Modify `src/components/SignInForm.tsx`: restrained authorized-caregiver entry state.
- Modify `src/components/Dashboard.tsx`: 210px/flexible/245px workspace and mobile Queue/People/Context tabs.
- Modify `src/components/dashboard/SeniorCoverage.tsx`: shared roster surface with active edge and status indicator.
- Modify `src/components/dashboard/SelectedSeniorSummary.tsx`: compact selected-senior context without a card.
- Modify `src/components/dashboard/PriorityCase.tsx`: flat priority surface, successful empty queue, and demo guide hooks.
- Modify `src/components/dashboard/CaseDetails.tsx`: care thread and source-labelled evidence hierarchy.
- Modify `src/components/dashboard/CaseUpdateForm.tsx`: flat controls, conflict recovery, and optional demo lock.
- Modify `src/components/dashboard/SeniorContextPanel.tsx`: remove standalone card chrome for drawer composition.
- Modify `src/components/dashboard/ProactiveCheckInPanel.tsx`: remove standalone card chrome for drawer composition.
- Modify `src/components/dashboard/ContactPlanPanel.tsx`: remove standalone card chrome for drawer composition.
- Modify `src/components/ChatSimulation.tsx`: restricted flat demo-only simulation styling.
- Modify `src/components/AgentTracePanel.tsx`: restricted, redacted run-details disclosure styling.
- Modify `src/components/dashboard/presentation.ts`: status tone mapping without fill classes.
- Modify `src/components/dashboard/careWorkspacePresentation.ts`: flat roster presentation metadata.
- Modify `src/components/dashboardViewModel.ts`: app-view/mobile-view helpers and preserve activity during optimistic selection.
- Modify `src/lib/types.ts`: add `CareActivityItem` and compatible `DashboardData.activity`.
- Modify `src/lib/persistence/dashboardRepository.ts`: read selected-senior caregiver actions, including resolved cases.
- Modify `src/lib/persistence/dashboardRepository.test.ts`: activity row mapping and selected-senior query behavior.
- Modify existing focused component tests beside each changed dashboard component to assert the new semantics.

### Task 1: Establish The Flat Visual System

**Files:**
- Create: `src/components/ui/StatusIndicator.tsx`
- Create: `src/components/ui/StatusIndicator.test.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/dashboard/presentation.ts`
- Modify: `src/components/dashboard/careWorkspacePresentation.ts`
- Modify: `src/components/dashboard/careWorkspacePresentation.test.ts`

- [ ] **Step 1: Write the failing status-indicator test**

```tsx
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusIndicator } from "./StatusIndicator";

describe("StatusIndicator", () => {
  it("renders an 8px flat dot and visible text without badge fill", () => {
    const html = renderToStaticMarkup(
      createElement(StatusIndicator, { tone: "attention", label: "Needs attention" })
    );
    expect(html).toContain("Needs attention");
    expect(html).toContain('data-status-dot="true"');
    expect(html).toContain("h-2 w-2");
    expect(html).not.toMatch(/rounded-full[^"]*(bg-.*50|px-2|px-3)/);
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing module**

Run: `npm test -- src/components/ui/StatusIndicator.test.ts`

Expected: FAIL with `Cannot find module './StatusIndicator'`.

- [ ] **Step 3: Implement the status primitive and exact design tokens**

```tsx
export type StatusTone = "stable" | "attention" | "urgent" | "neutral";

const dotClass: Record<StatusTone, string> = {
  stable: "bg-[var(--status-green)]",
  attention: "bg-[var(--status-amber)]",
  urgent: "bg-[var(--status-red)]",
  neutral: "bg-[var(--care-hairline)]",
};

export function StatusIndicator({
  tone,
  label,
  className = "",
}: {
  tone: StatusTone;
  label: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 text-sm ${className}`}>
      <span
        data-status-dot="true"
        className={`h-2 w-2 shrink-0 rounded-full ${dotClass[tone]}`}
        aria-hidden="true"
      />
      <span>{label}</span>
    </span>
  );
}
```

In `globals.css`, replace the current palette with:

```css
:root {
  --care-ink: #18231e;
  --care-evergreen: #1d3c35;
  --care-mist: #f2f4f3;
  --care-paper: #ffffff;
  --care-coral: #cb5545;
  --care-coral-hover: #ad4639;
  --care-hairline: #b8c1bd;
  --status-green: #347a59;
  --status-amber: #c57b1d;
  --status-red: #b9463d;
  --font-sans: var(--font-source-sans), system-ui, sans-serif;
  --font-serif: var(--font-source-serif), Georgia, serif;
}

* { border-color: var(--care-hairline); }
body { background: var(--care-mist); color: var(--care-ink); letter-spacing: 0; }
button, input, select, textarea { border-radius: 2px; }
:focus-visible { outline: 2px solid var(--care-coral); outline-offset: 2px; }
.font-display { font-family: var(--font-serif); }
```

Load `Source_Sans_3` and `Source_Serif_4` in `layout.tsx`, assign their CSS variables to `<body>`, and change presentation mappings to return semantic tones rather than background-fill classes.

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- src/components/ui/StatusIndicator.test.ts src/components/dashboard/careWorkspacePresentation.test.ts`

Expected: PASS with both files green.

- [ ] **Step 5: Commit**

```bash
git add trustkaki-web/src/app/layout.tsx trustkaki-web/src/app/globals.css trustkaki-web/src/components/ui trustkaki-web/src/components/dashboard/presentation.ts trustkaki-web/src/components/dashboard/careWorkspacePresentation.ts trustkaki-web/src/components/dashboard/careWorkspacePresentation.test.ts
git commit -m "feat: establish flat care desk visual system"
```

### Task 2: Extend Dashboard Activity Without A Migration

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/persistence/dashboardRepository.ts`
- Modify: `src/lib/persistence/dashboardRepository.test.ts`
- Modify: `src/components/dashboardViewModel.ts`
- Modify: `src/components/dashboardViewModel.test.ts`

- [ ] **Step 1: Write failing row-mapping and optimistic-state tests**

```ts
import { activityItemFromRow } from "./dashboardRepository";

it("maps resolved caregiver action history without exposing command ids", () => {
  expect(activityItemFromRow({
    id: "action-1",
    queue_item_id: "queue-1",
    senior_id: "senior-1",
    action_type: "resolve",
    outcome_type: "resolved",
    previous_status: "followed_up",
    resulting_status: "resolved",
    note: "Rachel confirmed Uncle Tan is safe.",
    created_at: "2026-07-28T08:00:00.000Z",
    actor_caregiver: { display_name: "Rachel Tan" },
  })).toEqual({
    id: "action-1",
    queueItemId: "queue-1",
    seniorId: "senior-1",
    actionType: "resolve",
    outcomeType: "resolved",
    previousStatus: "followed_up",
    resultingStatus: "resolved",
    note: "Rachel confirmed Uncle Tan is safe.",
    caregiver: "Rachel Tan",
    createdAt: "2026-07-28T08:00:00.000Z",
  });
});
```

Add an `optimisticDashboardForSenior` assertion that the existing `activity` array remains present until the authoritative refresh replaces it.

- [ ] **Step 2: Run tests and confirm the type/export failures**

Run: `npm test -- src/lib/persistence/dashboardRepository.test.ts src/components/dashboardViewModel.test.ts`

Expected: FAIL because `activityItemFromRow` and `DashboardData.activity` do not exist.

- [ ] **Step 3: Add the compatible read model and selected-senior query**

```ts
export interface CareActivityItem {
  id: string;
  queueItemId: string;
  seniorId: string;
  actionType: CaregiverActionItem["actionType"];
  outcomeType: ContactOutcome | null;
  previousStatus: FollowUpStatus | null;
  resultingStatus: FollowUpStatus | null;
  note: string | null;
  caregiver: string | null;
  createdAt: string;
}

export interface DashboardData {
  selectedSeniorId?: string;
  seniors?: SeniorListItem[];
  assignableCaregivers?: CaregiverOption[];
  senior: SeniorProfile;
  activeSessions: CheckInSession[];
  recentAlerts: AlertItem[];
  followUpQueue: FollowUpQueueItem[];
  activity?: CareActivityItem[];
}
```

Export a pure `activityItemFromRow` mapper. Add `readCareActivity(client, selectedSeniorId)` selecting only:

```ts
"id, queue_item_id, senior_id, action_type, outcome_type, previous_status, resulting_status, note, created_at, actor_caregiver:caregivers!caregiver_actions_caregiver_id_fkey(display_name)"
```

Filter with `.eq("senior_id", selectedSeniorId)`, order `created_at` descending, and limit to `100`. Await it with the existing dashboard reads and return `activity` under `data`. For local-demo fallback, return `activity: []`. Do not query command IDs, destinations, or provider payloads.

- [ ] **Step 4: Run persistence, route, type, and security tests**

Run: `npm test -- src/lib/persistence/dashboardRepository.test.ts src/app/api/dashboard/state/route.test.ts src/lib/security/gate6Tenancy.integration.test.ts`

Expected: PASS; non-demo trace suppression remains green.

Run: `npm run typecheck`

Expected: PASS with the optional compatible field accepted by existing fixtures.

- [ ] **Step 5: Commit**

```bash
git add trustkaki-web/src/lib/types.ts trustkaki-web/src/lib/persistence/dashboardRepository.ts trustkaki-web/src/lib/persistence/dashboardRepository.test.ts trustkaki-web/src/components/dashboardViewModel.ts trustkaki-web/src/components/dashboardViewModel.test.ts
git commit -m "feat: expose retained caregiver activity"
```

### Task 3: Build Operational States And The Authenticated App Shell

**Files:**
- Create: `src/components/OperationalState.tsx`
- Create: `src/components/OperationalState.test.ts`
- Create: `src/components/AppShell.tsx`
- Create: `src/components/AppShell.test.ts`
- Modify: `src/components/NavBar.tsx`
- Modify: `src/components/SignInForm.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write failing shell and state tests**

```tsx
it("hides demo tools from a normal caregiver", () => {
  const html = renderToStaticMarkup(createElement(AppShell, {
    activeView: "workspace",
    isDemoAdmin: false,
    riskLevel: "yellow",
    onViewChange: () => undefined,
    onOpenSetup: () => undefined,
    onSignOut: () => undefined,
    children: createElement("div", null, "Workspace"),
  }));
  expect(html).toContain("Care workspace");
  expect(html).toContain("Activity");
  expect(html).toContain("Care setup");
  expect(html).not.toContain("Demo tools");
  expect(html).toContain('href="#main-content"');
});
```

```tsx
it("keeps the last view visible during refresh failure and offers retry", () => {
  const html = renderToStaticMarkup(createElement(OperationalState, {
    kind: "refresh-error",
    message: "Could not refresh.",
    actionLabel: "Retry",
    onAction: () => undefined,
  }, createElement("div", null, "Existing queue")));
  expect(html).toContain("Existing queue");
  expect(html).toContain("Retry");
  expect(html).toContain('role="alert"');
});
```

- [ ] **Step 2: Run tests and verify missing components**

Run: `npm test -- src/components/AppShell.test.ts src/components/OperationalState.test.ts`

Expected: FAIL with missing-module errors.

- [ ] **Step 3: Implement the shell, entry, loading, and recovery states**

Use:

```ts
export type AppView = "workspace" | "activity";
```

`AppShell` renders a flat evergreen header, desktop navigation, `#main-content`, plain status indicator, and buttons for Care setup and authorized Demo tools. `OperationalState` reserves the workspace grid for loading, keeps children mounted for refresh errors, announces errors with `role="alert"`, and uses `aria-live="polite"` for bounded success.

Refactor `refreshDashboardState` to:

```ts
const refreshDashboardState = useCallback(async (
  nextSeniorId?: string | null
): Promise<DashboardData | null> => {
  if (!authToken) return null;
  const requestId = dashboardRequestSeq.current + 1;
  dashboardRequestSeq.current = requestId;
  setDashboardError(null);
  const response = await fetch(dashboardStateEndpoint(nextSeniorId ?? selectedSeniorIdRef.current), {
    cache: "no-store",
    headers: authHeader(authToken),
  });
  if (response.status === 401) {
    handleUnauthorized();
    return null;
  }
  if (!response.ok) throw new Error("dashboard_request_failed");
  const state = (await response.json()) as DashboardStateResponse;
  if (requestId !== dashboardRequestSeq.current) return null;
  setLiveDashboardData(state.data);
  setLiveTraces(state.traces);
  setLiveBriefing(state.briefing ?? null);
  setRiskLevel(state.data.senior.riskLevel);
  return state.data;
}, [authToken, handleUnauthorized]);
```

Wrap the await in the existing caller-facing error handling: on rejection, set
`dashboardError` only for the latest request and rethrow so DemoGuide can retain
its current phase. Keep last loaded data rendered when a later refresh fails.
Change sign-in copy to “Authorized caregivers and AAC staff” and remove
demo-credential language, shadows, rounded card chrome, and marketing copy.

- [ ] **Step 4: Run entry and shell tests**

Run: `npm test -- src/components/AppShell.test.ts src/components/OperationalState.test.ts src/components/dashboardViewModel.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS; callbacks returning promises remain valid at existing void call sites.

- [ ] **Step 5: Commit**

```bash
git add trustkaki-web/src/app/page.tsx trustkaki-web/src/components/AppShell.tsx trustkaki-web/src/components/AppShell.test.ts trustkaki-web/src/components/OperationalState.tsx trustkaki-web/src/components/OperationalState.test.ts trustkaki-web/src/components/NavBar.tsx trustkaki-web/src/components/SignInForm.tsx
git commit -m "feat: add care desk app shell and states"
```

### Task 4: Recompose The Responsive Care Workspace

**Files:**
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/components/dashboard/SeniorCoverage.tsx`
- Modify: `src/components/dashboard/SeniorCoverage.test.ts`
- Modify: `src/components/dashboard/SelectedSeniorSummary.tsx`
- Modify: `src/components/dashboard/SelectedSeniorSummary.test.ts`
- Modify: `src/components/dashboard/careWorkspacePresentation.ts`
- Modify: `src/components/dashboard/careWorkspacePresentation.test.ts`

- [ ] **Step 1: Add failing roster and mobile-navigation assertions**

```tsx
it("uses explicit mobile Queue People Context views", () => {
  const html = renderDashboard();
  expect(html).toContain('role="tablist"');
  expect(html).toContain(">Queue<");
  expect(html).toContain(">People<");
  expect(html).toContain(">Context<");
});

it("renders a selected roster row with a semantic status", () => {
  const html = renderSeniorCoverage();
  expect(html).toContain('aria-current="true"');
  expect(html).toContain('data-status-dot="true"');
  expect(html).not.toContain("shadow");
});
```

- [ ] **Step 2: Run focused tests**

Run: `npm test -- src/components/dashboard/SeniorCoverage.test.ts src/components/dashboard/SelectedSeniorSummary.test.ts`

Expected: FAIL because mobile tabs and the new status primitive are absent.

- [ ] **Step 3: Implement stable responsive regions**

Desktop grid:

```tsx
<div className="grid min-h-0 flex-1 xl:grid-cols-[210px_minmax(0,1fr)_245px]">
```

At tablet, keep roster and case in `lg:grid-cols-[210px_minmax(0,1fr)]` and place context under the case. Below `lg`, render a stable `role="tablist"` with Queue selected initially and only one corresponding panel visible. Roster rows share one surface, have `border-l-2` only when active, use `StatusIndicator`, keep portraits circular, and never translate or shadow on hover. Keep the selected senior summary compact and unframed.

- [ ] **Step 4: Run dashboard presentation tests**

Run: `npm test -- src/components/dashboard/SeniorCoverage.test.ts src/components/dashboard/SelectedSeniorSummary.test.ts src/components/dashboard/careWorkspacePresentation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add trustkaki-web/src/components/Dashboard.tsx trustkaki-web/src/components/dashboard/SeniorCoverage.tsx trustkaki-web/src/components/dashboard/SeniorCoverage.test.ts trustkaki-web/src/components/dashboard/SelectedSeniorSummary.tsx trustkaki-web/src/components/dashboard/SelectedSeniorSummary.test.ts trustkaki-web/src/components/dashboard/careWorkspacePresentation.ts trustkaki-web/src/components/dashboard/careWorkspacePresentation.test.ts
git commit -m "feat: recompose responsive care workspace"
```

### Task 5: Flatten The Priority Case And Care Thread

**Files:**
- Modify: `src/components/dashboard/PriorityCase.tsx`
- Modify: `src/components/dashboard/PriorityCase.test.ts`
- Modify: `src/components/dashboard/CaseDetails.tsx`
- Modify: `src/components/dashboard/CaseDetails.test.ts`
- Modify: `src/components/dashboard/CaseUpdateForm.tsx`
- Modify: `src/components/dashboard/CaseUpdateForm.test.ts`

- [ ] **Step 1: Write failing care-thread, empty-state, and conflict assertions**

```tsx
it("treats an empty queue as successful and preserves activity navigation", () => {
  const html = renderPriorityCase([]);
  expect(html).toContain("No active follow-ups");
  expect(html).toContain("View recent activity");
  expect(html).toContain('data-status-dot="true"');
});

it("labels AI copy and renders evidence as one care thread", () => {
  const html = renderCaseDetails();
  expect(html).toContain("AI-generated caregiver summary");
  expect(html).toContain('data-care-thread="true"');
  expect(html).toContain("Why this case was surfaced");
});
```

Extend the case-update pure response helper test:

```ts
expect(caseMutationMessage(409)).toEqual({
  kind: "conflict",
  message: "Another caregiver changed this case. Review the latest state before saving again.",
});
```

- [ ] **Step 2: Run the focused case tests**

Run: `npm test -- src/components/dashboard/PriorityCase.test.ts src/components/dashboard/CaseDetails.test.ts src/components/dashboard/CaseUpdateForm.test.ts`

Expected: FAIL on the new semantics and helper.

- [ ] **Step 3: Implement the flat working surface**

Remove every `shadow-*`, filled status pill, rounded section shell, and tinted header from these files. Give the priority case one white surface separated by hairlines; use Source Serif only for its case headline. Render the care thread as:

```tsx
<ol data-care-thread="true" className="relative border-l border-[var(--care-hairline)]">
  {evidence.map((item) => (
    <li key={item.id} className="relative pb-6 pl-6">
      <span className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-[var(--status-amber)]" aria-hidden="true" />
      {/* timestamp, source label, description */}
    </li>
  ))}
</ol>
```

Keep deterministic risk/evidence authoritative and label AI text. Make the case update panel an inline bordered region with a single coral Save command only after the user opens it. On `409`, keep inputs, set the conflict message, refresh, and require the user to review before the next submit. Add `guideLocked?: boolean` so guided mode can suppress competing case commands.

- [ ] **Step 4: Run case and queue-action route tests**

Run: `npm test -- src/components/dashboard/PriorityCase.test.ts src/components/dashboard/CaseDetails.test.ts src/components/dashboard/CaseUpdateForm.test.ts src/app/api/caregiver/queue-action/route.test.ts`

Expected: PASS with queue-action behavior unchanged.

- [ ] **Step 5: Commit**

```bash
git add trustkaki-web/src/components/dashboard/PriorityCase.tsx trustkaki-web/src/components/dashboard/PriorityCase.test.ts trustkaki-web/src/components/dashboard/CaseDetails.tsx trustkaki-web/src/components/dashboard/CaseDetails.test.ts trustkaki-web/src/components/dashboard/CaseUpdateForm.tsx trustkaki-web/src/components/dashboard/CaseUpdateForm.test.ts
git commit -m "feat: redesign priority case care thread"
```

### Task 6: Add Activity And Consolidate Care Setup

**Files:**
- Create: `src/components/dashboard/CareActivity.tsx`
- Create: `src/components/dashboard/CareActivity.test.ts`
- Create: `src/components/dashboard/CareSetupDrawer.tsx`
- Create: `src/components/dashboard/CareSetupDrawer.test.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/app/page.tsx`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/components/dashboard/SeniorContextPanel.tsx`
- Modify: `src/components/dashboard/ProactiveCheckInPanel.tsx`
- Modify: `src/components/dashboard/ContactPlanPanel.tsx`
- Modify: their existing colocated tests

- [ ] **Step 1: Add jsdom and write failing interaction tests**

Run: `npm install --save-dev jsdom@^26.1.0`

Expected: `jsdom` appears under `devDependencies`; do not change production dependencies and do not run `npm audit fix`.

```tsx
// @vitest-environment jsdom
it("moves focus into the drawer and restores it on Escape", async () => {
  const opener = document.createElement("button");
  opener.textContent = "Care setup";
  document.body.append(opener);
  opener.focus();
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<CareSetupDrawer open onClose={() => root.unmount()} {...props} />));
  expect(document.activeElement?.getAttribute("role")).toBe("tab");
  act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(document.activeElement).toBe(opener);
});
```

```tsx
it("keeps resolved activity visible with actor, action, outcome, and time", () => {
  const html = renderCareActivity({
    activity: [{ ...activity, resultingStatus: "resolved" }],
    queue: [],
  });
  expect(html).toContain("Rachel Tan");
  expect(html).toContain("Resolved");
  expect(html).toContain("Reached and okay");
  expect(html).toContain('data-care-thread="true"');
});

it("merges active observed signals into the source-labelled chronology", () => {
  const html = renderCareActivity({ activity: [], queue: [queueWithEvidence] });
  expect(html).toContain("Observed signal");
  expect(html).toContain("Care policy");
  expect(html).toContain("Knee discomfort");
});
```

- [ ] **Step 2: Run the new tests**

Run: `npm test -- src/components/dashboard/CareActivity.test.ts src/components/dashboard/CareSetupDrawer.test.tsx`

Expected: FAIL with missing components.

- [ ] **Step 3: Implement chronological activity and one accessible drawer**

`CareActivity` accepts `activity`, the selected senior's `queue`, `seniorName`,
and `onReturnToWorkspace`. It builds one local discriminated union:

```ts
type CareActivityEntry =
  | { kind: "signal"; id: string; at: string; source: "Observed signal"; text: string }
  | { kind: "policy"; id: string; at: string; source: "Care policy"; text: string }
  | { kind: "caregiver"; id: string; at: string; source: "Caregiver record"; item: CareActivityItem };
```

Map active `queue.pattern.evidence` to signal entries, each queue item to one
policy entry using its reason and `lastUpdatedAt`, and retained activity to
caregiver entries. Sort the combined entries descending without mutating props;
map action/outcome/status transitions to plain language; and use the care-thread
marker. Resolved actions remain visible even after the active queue empties.

`CareSetupDrawer` accepts the existing context, schedule, and contact props from `Dashboard`. It uses:

```tsx
<section role="dialog" aria-modal="true" aria-labelledby="care-setup-title">
  <div role="tablist" aria-label="Care setup sections">
    {(["context", "check-ins", "contacts"] as const).map((tab) => (
      <button role="tab" aria-selected={activeTab === tab}>{label[tab]}</button>
    ))}
  </div>
</section>
```

Trap Tab/Shift+Tab within the drawer, focus the active tab on open, close on Escape, and restore the recorded opener. Compose the existing panels as unframed tab contents; preserve their routes, admin restrictions, inline validation, save callbacks, and masked contact data.

Wire `AppShell`'s Activity command to render `CareActivity` with
`liveDashboardData.activity ?? []` plus
`followUpQueueForSenior(liveDashboardData.followUpQueue, selectedSeniorId)`.
Wire its Care setup command to open `CareSetupDrawer`. Keep workspace data
mounted when the drawer opens, and close the drawer before changing selected
senior so editing state cannot cross senior boundaries.

- [ ] **Step 4: Run setup, activity, and existing panel tests**

Run: `npm test -- src/components/dashboard/CareActivity.test.ts src/components/dashboard/CareSetupDrawer.test.tsx src/components/dashboard/SeniorContextPanel.test.ts src/components/dashboard/ProactiveCheckInPanel.test.ts src/components/dashboard/ContactPlanPanel.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add trustkaki-web/package.json trustkaki-web/package-lock.json trustkaki-web/src/app/page.tsx trustkaki-web/src/components/AppShell.tsx trustkaki-web/src/components/Dashboard.tsx trustkaki-web/src/components/dashboard/CareActivity.tsx trustkaki-web/src/components/dashboard/CareActivity.test.ts trustkaki-web/src/components/dashboard/CareSetupDrawer.tsx trustkaki-web/src/components/dashboard/CareSetupDrawer.test.tsx trustkaki-web/src/components/dashboard/SeniorContextPanel.tsx trustkaki-web/src/components/dashboard/SeniorContextPanel.test.ts trustkaki-web/src/components/dashboard/ProactiveCheckInPanel.tsx trustkaki-web/src/components/dashboard/ProactiveCheckInPanel.test.ts trustkaki-web/src/components/dashboard/ContactPlanPanel.tsx trustkaki-web/src/components/dashboard/ContactPlanPanel.test.ts
git commit -m "feat: add activity and unified care setup"
```

### Task 7: Implement The Verified One-Action Guided Demo

**Files:**
- Create: `src/components/dashboard/demoGuideState.ts`
- Create: `src/components/dashboard/demoGuideState.test.ts`
- Create: `src/components/dashboard/DemoGuide.tsx`
- Create: `src/components/dashboard/DemoGuide.test.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/components/NavBar.tsx`
- Remove: `src/components/dashboard/DemoControls.tsx`
- Remove: `src/components/dashboard/DemoControls.test.ts`

- [ ] **Step 1: Write the failing deterministic state-machine tests**

```ts
describe("demo guide", () => {
  it("does not advance when refresh is stale", () => {
    expect(advanceDemo("prepare", { commandOk: true, stateVerified: false }))
      .toEqual({ phase: "prepare", error: "The demo data has not refreshed yet. Retry preparation." });
  });

  it("advances exactly one phase after command and state verification", () => {
    expect(advanceDemo("prepare", { commandOk: true, stateVerified: true }))
      .toEqual({ phase: "review", error: null });
  });

  it("requires retained resolved history before completion", () => {
    expect(isResolveVerified(dataWithEmptyQueueAndResolvedActivity, "queue-1")).toBe(true);
    expect(isResolveVerified(dataWithEmptyQueueOnly, "queue-1")).toBe(false);
  });
});
```

The complete phase union is:

```ts
export type DemoPhase =
  | "orientation"
  | "prepare"
  | "review"
  | "respond"
  | "resolve"
  | "complete"
  | "exited";
```

- [ ] **Step 2: Run state tests**

Run: `npm test -- src/components/dashboard/demoGuideState.test.ts`

Expected: FAIL because the state module is missing.

- [ ] **Step 3: Implement pure transitions and persisted-state predicates**

Implement:

```ts
export function isPrepared(data: DashboardData): boolean {
  return data.followUpQueue.some((item) =>
    item.status === "pending" && Boolean(item.pattern?.evidence.length)
  );
}

export function isResponseRecorded(data: DashboardData, queueItemId: string): boolean {
  return data.activity?.some((item) =>
    item.queueItemId === queueItemId &&
    item.actionType === "record_outcome" &&
    item.resultingStatus === "followed_up"
  ) ?? false;
}

export function isResolveVerified(data: DashboardData, queueItemId: string): boolean {
  return !data.followUpQueue.some((item) => item.id === queueItemId) &&
    Boolean(data.activity?.some((item) =>
      item.queueItemId === queueItemId && item.resultingStatus === "resolved"
    ));
}
```

`advanceDemo` accepts only the current phase and `{ commandOk, stateVerified }`; failed or stale results retain the phase and set one specific retry message.

- [ ] **Step 4: Write and run failing DemoGuide rendering tests**

```tsx
it("never renders orientation and workspace together", () => {
  const html = renderGuide({ phase: "orientation" });
  expect(html).toContain("Start guided demo");
  expect(html).not.toContain("Care workspace");
});

it.each(["prepare", "review", "respond", "resolve"])(
  "renders one coral primary action in %s",
  (phase) => {
    const html = renderGuide({ phase });
    expect((html.match(/data-demo-primary="true"/g) ?? [])).toHaveLength(1);
  }
);
```

Run: `npm test -- src/components/dashboard/DemoGuide.test.ts`

Expected: FAIL because `DemoGuide` is missing.

- [ ] **Step 5: Implement the guide using only existing routes**

Orientation renders literal value, four compact steps, “About 90 seconds”, and only `Start guided demo`. After starting, render the workspace and a compact guide bar with one `data-demo-primary="true"` coral button:

- Prepare: POST `/api/demo/pattern-watch/quick`, await `onRefresh()`, require `isPrepared`.
- Review: await the dashboard GET via `onRefresh()`, require prepared evidence, then open the care thread and move to Respond.
- Respond: POST `/api/caregiver/queue-action` with `record_outcome`, `needs_follow_up`, a fixed fictional note, `expectedUpdatedAt`, and a stable command ID; await refresh and require `isResponseRecorded`.
- Resolve: POST the same route with `resolve`, outcome `resolved`, a fixed fictional note, and current `expectedUpdatedAt`; await refresh and require `isResolveVerified`.

Handle `401` with the existing unauthorized callback and `409` as stale state. Disable the sole primary while pending. On failure, leave the current phase active and relabel the same button `Retry …`; do not render a second retry button. “Exit guided demo” remains a plain text command. Hide all normal case mutations while the guide is active.

- [ ] **Step 6: Run guide, demo route, and queue route tests**

Run: `npm test -- src/components/dashboard/demoGuideState.test.ts src/components/dashboard/DemoGuide.test.ts src/app/api/demo/pattern-watch/quick/route.test.ts src/app/api/caregiver/queue-action/route.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add trustkaki-web/src/app/page.tsx trustkaki-web/src/components/Dashboard.tsx trustkaki-web/src/components/NavBar.tsx trustkaki-web/src/components/dashboard/demoGuideState.ts trustkaki-web/src/components/dashboard/demoGuideState.test.ts trustkaki-web/src/components/dashboard/DemoGuide.tsx trustkaki-web/src/components/dashboard/DemoGuide.test.ts trustkaki-web/src/components/dashboard/DemoControls.tsx trustkaki-web/src/components/dashboard/DemoControls.test.ts
git commit -m "feat: add verified guided judge demo"
```

### Task 8: Restrict And Restyle Demo-Only Technical Detail

**Files:**
- Modify: `src/components/ChatSimulation.tsx`
- Modify: `src/components/AgentTracePanel.tsx`
- Modify: `src/components/agentTraceViewModel.test.ts`
- Modify: `src/components/dashboardViewModel.ts`
- Modify: `src/components/dashboardViewModel.test.ts`

- [ ] **Step 1: Add failing visibility and redaction tests**

```ts
it("keeps simulation and run details demo-admin-only", () => {
  expect(appShellSurface({ isDemoAdmin: false, demoMode: true })).toMatchObject({
    showChatSimulator: false,
    showReasoningRail: false,
    showDemoControls: false,
  });
});

it("never formats raw secret-like values into run details", () => {
  expect(formatAgentInputForCaregiver(secretTrace)).not.toMatch(
    /service_role|authorization|bearer|sk-/i
  );
});
```

- [ ] **Step 2: Run focused tests**

Run: `npm test -- src/components/dashboardViewModel.test.ts src/components/agentTraceViewModel.test.ts`

Expected: FAIL if any technical visibility or formatting path violates the restricted contract.

- [ ] **Step 3: Apply flat demo-only styling without changing orchestration**

Remove emojis, gradients, shadows, filled badges, oversized rounded message bubbles, animated pulse, and technical pipeline narration from `ChatSimulation`. Use clear “Fictional demo conversation” labelling. Change `AgentTracePanel` to a collapsed “Run details” disclosure with hairline rows and monospace only inside individual technical values. Keep trace rendering reachable only when `appShellSurface` confirms both demo-admin role and demo mode. Preserve `containsSensitiveText` and current server-side trace suppression.

- [ ] **Step 4: Run technical-boundary and dashboard route tests**

Run: `npm test -- src/components/dashboardViewModel.test.ts src/components/agentTraceViewModel.test.ts src/app/api/dashboard/state/route.test.ts src/lib/security/gate6AdminRouteBoundary.test.ts`

Expected: PASS; normal caregiver responses contain no traces.

- [ ] **Step 5: Commit**

```bash
git add trustkaki-web/src/components/ChatSimulation.tsx trustkaki-web/src/components/AgentTracePanel.tsx trustkaki-web/src/components/agentTraceViewModel.test.ts trustkaki-web/src/components/dashboardViewModel.ts trustkaki-web/src/components/dashboardViewModel.test.ts
git commit -m "feat: refine restricted demo run details"
```

### Task 9: Enforce The Visual Contract And Verify The Complete Product

**Files:**
- Create: `src/components/visualSystemGuard.test.ts`
- Modify: any UI file reported by the guard
- Verify: all source, tests, production build, and browser states

- [ ] **Step 1: Write the failing visual-system guard**

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const roots = ["src/app", "src/components"];
const files = roots.flatMap(walk).filter((file) => /\.(tsx|css)$/.test(file));
const source = files.map((file) => `${file}\n${fs.readFileSync(file, "utf8")}`).join("\n");

describe("approved visual system", () => {
  it("contains no shadows, gradients, glows, or excessive control radii", () => {
    expect(source).not.toMatch(/\bshadow(?:-|\[)/);
    expect(source).not.toMatch(/\b(?:bg|border)-gradient|linear-gradient|radial-gradient/);
    expect(source).not.toMatch(/\bblur-|drop-shadow|text-shadow/);
    expect(source).not.toMatch(/\brounded-(?:md|lg|xl|2xl|3xl)\b/);
  });

  it("keeps filled status badges out of application components", () => {
    expect(source).not.toMatch(/rounded-full[^"\n]*(?:px-|py-)/);
  });
});
```

Implement `walk` with `fs.readdirSync(..., { withFileTypes: true })`, exclude tests from the scanned source, and allow only semantic circles (`StatusIndicator`, `SeniorAvatar`, and care-thread evidence markers) through file-specific assertions.

- [ ] **Step 2: Run the guard and remove every reported violation**

Run: `npm test -- src/components/visualSystemGuard.test.ts`

Expected: initially FAIL listing remaining legacy utilities; after scoped styling edits, PASS.

- [ ] **Step 3: Run the focused UI suite**

Run:

```bash
npm test -- src/components/ui/StatusIndicator.test.ts src/components/AppShell.test.ts src/components/OperationalState.test.ts src/components/dashboard/SeniorCoverage.test.ts src/components/dashboard/SelectedSeniorSummary.test.ts src/components/dashboard/PriorityCase.test.ts src/components/dashboard/CaseDetails.test.ts src/components/dashboard/CaseUpdateForm.test.ts src/components/dashboard/CareActivity.test.ts src/components/dashboard/CareSetupDrawer.test.tsx src/components/dashboard/demoGuideState.test.ts src/components/dashboard/DemoGuide.test.ts src/components/visualSystemGuard.test.ts
```

Expected: PASS with all focused UI files green.

- [ ] **Step 4: Run complete validation**

Run: `npm run validate`

Expected: all Vitest files pass, TypeScript emits no errors, ESLint emits no errors, and the Next.js production build completes successfully. Existing environment-gated integration skips remain skips; no new skip is added.

- [ ] **Step 5: Start the app and verify browser states at all required viewports**

Run: `npm run dev`

Expected: Next.js prints a local URL, normally `http://localhost:3000`; keep this session running until browser verification is complete.

Using the browser-control skill, capture and inspect:

```text
1440x900: sign-in, normal workspace, Activity, Care setup, all four demo steps,
           empty queue, loading, refresh error, shared-case conflict
1024x768: workspace with context below case, Care setup, demo Respond step
390x844:  Queue, People, Context tabs; Activity; full-screen Care setup;
           demo orientation and Resolve step
```

For every capture verify: no shadow/gradient/glow; no filled status badges;
exactly one coral demo action; no orientation/workspace overlap; WCAG AA text
and control contrast; primary touch targets at least 44px; and no clipped text,
horizontal overflow, layout shift, blank region, keyboard trap, hover-only
information, or hidden focus. Tab through the shell and drawer, press Escape,
confirm focus restoration, and enable reduced motion.

- [ ] **Step 6: Run regression and security boundary checks**

Run:

```bash
npm test -- src/app/api/dashboard/state/route.test.ts src/app/api/caregiver/queue-action/route.test.ts src/app/api/demo/pattern-watch/quick/route.test.ts src/lib/security/gate6AdminRouteBoundary.test.ts src/lib/security/gate6Tenancy.integration.test.ts src/lib/security/liveProjectGuard.test.ts
```

Expected: PASS or the same environment-gated skips as the clean baseline; demo tools and traces remain unavailable to normal caregivers.

- [ ] **Step 7: Commit the verified revamp**

```bash
git add trustkaki-web/src trustkaki-web/package.json trustkaki-web/package-lock.json
git commit -m "test: enforce care desk visual contract"
git status --short
```

Expected: the commit succeeds and `git status --short` is empty.

## Post-Implementation Release Gate

Do not deploy from a dirty worktree. After code review, merge the exact clean `ui-revamp` commit into `main`, run `npm run validate` on the merge commit, deploy that exact commit, and execute the credential-free public smoke plus authenticated judge walkthrough. Then complete the remaining Gate 8 final security/privacy audit, transport checks, rollback rehearsal, and explicit go/no-go record. Dependency advisory remediation remains a separate scoped task; do not use `npm audit fix` during this UI plan.
