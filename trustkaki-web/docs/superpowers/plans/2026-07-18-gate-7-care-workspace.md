# Gate 7 Care Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stacked caregiver dashboard with a responsive, priority-ranked AAC care workspace that surfaces the next human action while keeping raw AI traces demo-only.

**Architecture:** Keep the existing authenticated dashboard APIs, data contracts, mutations, and refresh behavior unchanged. Add one pure presentation module for deterministic ordering, urgency, portrait selection, and fallbacks; recompose the existing dashboard components into desktop and mobile workspace regions; and keep all styling within existing Tailwind classes and a small set of global color tokens.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Vitest, React server rendering tests, local WebP assets, existing Supabase-authenticated dashboard APIs.

---

## Scope And Working Directory

Work only in:

```text
/Users/ngminxie/Documents/SMU/Hackathons:Events/2026/Tencent Age Well Hackathon/trustkaki-web/.worktrees/gate-7-care-workspace/trustkaki-web
```

Do not add a database migration, upload flow, storage bucket, new API route,
ranking persistence, or authorization behavior. Do not execute live database
mutations for this frontend-only gate.

If dependencies and local configuration are absent in the worktree, link the
existing ignored files without committing them:

```bash
ln -s ../../../node_modules node_modules
ln -s ../../../.env.local .env.local
```

Verify `git status --short` remains clean after creating the links because both
paths are ignored.

## File Map

- Create `src/components/dashboard/careWorkspacePresentation.ts` for pure ranking, urgency, truncation, portrait mapping, and initials behavior.
- Create `src/components/dashboard/careWorkspacePresentation.test.ts` for deterministic presentation tests.
- Create `src/components/dashboard/SeniorAvatar.tsx` for stable portrait/fallback rendering.
- Create `src/components/dashboard/SeniorAvatar.test.ts` for static markup and fallback decisions.
- Modify `src/components/dashboard/SeniorCoverage.tsx` into the desktop priority rail and mobile priority strip.
- Create `src/components/dashboard/SeniorCoverage.test.ts` for compact accessible rendering.
- Modify `src/components/dashboard/SelectedSeniorSummary.tsx` into the compact selected-senior header.
- Modify `src/components/Dashboard.tsx` to compose the three-region workspace.
- Modify `src/components/dashboard/PriorityCase.tsx` and `CaseDetails.tsx` to clarify the active case and remove technical proof from normal staff views.
- Modify `src/components/dashboard/CaseDetails.test.ts` to prove plain-language, non-technical output.
- Modify `src/components/dashboardViewModel.ts` and its test to expose chat/traces only in authenticated demo mode.
- Modify `src/app/page.tsx`, `src/components/NavBar.tsx`, and `src/components/AgentTracePanel.tsx` for the demo-only technical surface.
- Modify `src/app/globals.css` for the approved care and restrained-purple tokens, focus, motion, and scrollbar behavior.
- Create `public/seniors/mr-tan-ah-hock.webp`, `public/seniors/mdm-lim-siew-lan.webp`, and `public/seniors/mdm-siti-fatimah.webp` as fictional local demo portraits.
- Modify `docs/TrustKaki_BUILD_ROADMAP.md` only after verification passes.
- Create `docs/superpowers/verification/2026-07-18-gate-7-care-workspace.md` only after verification passes.

---

### Task 1: Deterministic Care Workspace Presentation

**Files:**
- Create: `src/components/dashboard/careWorkspacePresentation.ts`
- Create: `src/components/dashboard/careWorkspacePresentation.test.ts`

- [ ] **Step 1: Write failing ranking and presentation tests**

Create fixtures for one red senior with an escalated queue item at priority `0`,
one yellow senior with a pending item at priority `10`, one yellow senior with
no active item, and one green senior with no item. Cover queue priority before
risk, risk before recency, recency before name, stable name tie-breaking,
resolved-item exclusion, compact reasons, known portraits, unknown initials,
and empty names.

```ts
import { describe, expect, it } from "vitest";
import type { FollowUpQueueItem, SeniorListItem } from "@/lib/types";
import {
  buildSeniorCoverage,
  compactCoverageReason,
  initialsForSenior,
  portraitForSenior,
} from "./careWorkspacePresentation";

function senior(
  id: string,
  name: string,
  riskLevel: SeniorListItem["riskLevel"],
  lastCheckIn: string | null
): SeniorListItem {
  return {
    id,
    name,
    riskLevel,
    lastCheckIn,
    followUpCount: 0,
    primaryCaregiver: null,
    aacVolunteer: null,
  };
}

function queueItem(args: {
  seniorId: string;
  priority: number;
  status?: FollowUpQueueItem["status"];
  riskLevel?: FollowUpQueueItem["riskLevel"];
}): FollowUpQueueItem {
  return {
    id: `queue-${args.seniorId}-${args.priority}`,
    seniorId: args.seniorId,
    seniorName: args.seniorId,
    riskLevel: args.riskLevel ?? "yellow",
    headline: "Appetite and mobility changed together",
    reason: "Two connected changes need follow-up.",
    changeFromUsual: "Different from the usual routine.",
    lastResponseAt: "2026-07-18T01:00:00.000Z",
    recommendedAction: "Check in today.",
    status: args.status ?? "pending",
    assignedTo: null,
    lastUpdatedAt: "2026-07-18T02:00:00.000Z",
    priority: args.priority,
    pattern: null,
    relatedPatterns: [],
  };
}

const seniors = [
  senior("green-stable", "Mdm Lim Siew Lan", "green", "2026-07-18T03:00:00.000Z"),
  senior("yellow-monitoring", "Mr Ahmad", "yellow", "2026-07-17T03:00:00.000Z"),
  senior("red-active", "Mdm Siti Fatimah", "red", "2026-07-16T03:00:00.000Z"),
  senior("yellow-active", "Mr Tan Ah Hock", "yellow", "2026-07-15T03:00:00.000Z"),
];

const yellowPriorityZero = queueItem({ seniorId: "yellow-active", priority: 0 });
const redPriorityTen = queueItem({ seniorId: "red-active", priority: 10, riskLevel: "red" });
const redEscalated = queueItem({ seniorId: "red-active", priority: 0, status: "escalated", riskLevel: "red" });
const yellowPending = queueItem({ seniorId: "yellow-active", priority: 10 });

describe("care workspace presentation", () => {
  it("orders active work by queue priority before policy risk", () => {
    const view = buildSeniorCoverage(seniors, [yellowPriorityZero, redPriorityTen]);
    expect(view.map((item) => item.senior.id)).toEqual([
      "yellow-active",
      "red-active",
      "yellow-monitoring",
      "green-stable",
    ]);
  });

  it("uses explicit urgency independent of color", () => {
    const view = buildSeniorCoverage(seniors, [redEscalated, yellowPending]);
    expect(view.find((item) => item.senior.id === "red-active")?.urgency).toBe("urgent");
    expect(view.find((item) => item.senior.id === "yellow-active")?.urgency).toBe("today");
    expect(view.find((item) => item.senior.id === "yellow-monitoring")?.urgency).toBe("monitoring");
    expect(view.find((item) => item.senior.id === "green-stable")?.urgency).toBe("stable");
  });

  it("maps only fictional demo names to local portraits", () => {
    expect(portraitForSenior("Mr Tan Ah Hock")).toBe("/seniors/mr-tan-ah-hock.webp");
    expect(portraitForSenior("Mdm Lim Siew Lan")).toBe("/seniors/mdm-lim-siew-lan.webp");
    expect(portraitForSenior("Mdm Siti Fatimah Binte Rahman")).toBe("/seniors/mdm-siti-fatimah.webp");
    expect(portraitForSenior("New Senior")).toBeNull();
  });

  it("creates bounded fallback content without changing source text", () => {
    const reason = "A long source reason that must remain unchanged outside this display helper";
    const compact = compactCoverageReason(reason, 32);
    expect(compact).toHaveLength(32);
    expect(compact.endsWith("...")).toBe(true);
    expect(reason).toContain("must remain unchanged");
    expect(initialsForSenior("Mdm Lim Siew Lan")).toBe("LS");
    expect(initialsForSenior(" ")).toBe("TK");
  });

  it("does not treat a resolved item as active work", () => {
    const resolved = queueItem({ seniorId: "red-active", priority: 0, status: "resolved", riskLevel: "red" });
    const view = buildSeniorCoverage(seniors, [resolved]);
    expect(view.find((item) => item.senior.id === "red-active")).toMatchObject({
      urgency: "monitoring",
      activeItem: null,
    });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
npm test -- src/components/dashboard/careWorkspacePresentation.test.ts
```

Expected: FAIL because the presentation module does not exist.

- [ ] **Step 3: Implement the pure presentation module**

Use a closed portrait map and no server imports:

```ts
import type { FollowUpQueueItem, RiskLevel, SeniorListItem } from "@/lib/types";

export type CareUrgency = "urgent" | "today" | "monitoring" | "stable";

export interface SeniorCoverageView {
  senior: SeniorListItem;
  position: number;
  urgency: CareUrgency;
  reason: string | null;
  portraitSrc: string | null;
  initials: string;
  activeItem: FollowUpQueueItem | null;
}

const portraits: Record<string, string> = {
  "mr tan ah hock": "/seniors/mr-tan-ah-hock.webp",
  "mdm lim siew lan": "/seniors/mdm-lim-siew-lan.webp",
  "mdm siti fatimah binte rahman": "/seniors/mdm-siti-fatimah.webp",
};

const riskOrder: Record<RiskLevel, number> = { red: 0, yellow: 1, green: 2 };

export function compactCoverageReason(value: string, max = 48): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

export function portraitForSenior(name: string): string | null {
  return portraits[name.trim().toLowerCase()] ?? null;
}

export function initialsForSenior(name: string): string {
  const ignored = new Set(["mr", "mdm", "mrs", "ms", "dr"]);
  const words = name.trim().split(/\s+/).filter((word) => word && !ignored.has(word.toLowerCase()));
  if (words.length === 0) return "TK";
  const candidates = words.length === 1 ? words : [words[0], words.at(-1)!];
  return candidates.map((word) => word[0]?.toUpperCase() ?? "").join("").slice(0, 2) || "TK";
}

function activeItemForSenior(queue: FollowUpQueueItem[], seniorId: string) {
  return queue
    .filter((item) => item.seniorId === seniorId && item.status !== "resolved")
    .sort((a, b) => a.priority - b.priority || b.lastUpdatedAt.localeCompare(a.lastUpdatedAt))[0] ?? null;
}

function urgencyFor(senior: SeniorListItem, item: FollowUpQueueItem | null): CareUrgency {
  if (item && (senior.riskLevel === "red" || item.status === "escalated")) return "urgent";
  if (item) return "today";
  return senior.riskLevel === "green" ? "stable" : "monitoring";
}

export function buildSeniorCoverage(
  seniors: SeniorListItem[],
  queue: FollowUpQueueItem[]
): SeniorCoverageView[] {
  return seniors
    .map((senior) => ({ senior, activeItem: activeItemForSenior(queue, senior.id) }))
    .sort((a, b) => {
      if (Boolean(a.activeItem) !== Boolean(b.activeItem)) return a.activeItem ? -1 : 1;
      const priority = (a.activeItem?.priority ?? Number.POSITIVE_INFINITY) -
        (b.activeItem?.priority ?? Number.POSITIVE_INFINITY);
      if (priority !== 0) return priority;
      const risk = riskOrder[a.senior.riskLevel] - riskOrder[b.senior.riskLevel];
      if (risk !== 0) return risk;
      const activity = new Date(b.senior.lastCheckIn ?? 0).getTime() -
        new Date(a.senior.lastCheckIn ?? 0).getTime();
      return activity || a.senior.name.localeCompare(b.senior.name, "en-SG");
    })
    .map(({ senior, activeItem }, index) => ({
      senior,
      activeItem,
      position: index + 1,
      urgency: urgencyFor(senior, activeItem),
      reason: activeItem ? compactCoverageReason(activeItem.headline) : null,
      portraitSrc: portraitForSenior(senior.name),
      initials: initialsForSenior(senior.name),
    }));
}
```

- [ ] **Step 4: Run focused tests and typecheck**

```bash
npm test -- src/components/dashboard/careWorkspacePresentation.test.ts
npm run typecheck
```

Expected: presentation tests PASS and TypeScript exits `0`.

- [ ] **Step 5: Commit the presentation model**

```bash
git add src/components/dashboard/careWorkspacePresentation.ts src/components/dashboard/careWorkspacePresentation.test.ts
git commit -m "feat: rank senior care coverage"
```

---

### Task 2: Fictional Portrait Assets And Stable Fallback

**Files:**
- Create: `public/seniors/mr-tan-ah-hock.webp`
- Create: `public/seniors/mdm-lim-siew-lan.webp`
- Create: `public/seniors/mdm-siti-fatimah.webp`
- Create: `src/components/dashboard/SeniorAvatar.tsx`
- Create: `src/components/dashboard/SeniorAvatar.test.ts`

- [ ] **Step 1: Generate three separate fictional portrait assets**

Use the `imagegen` skill. Generate separate square bitmap portraits, not a
montage. Each prompt must state that the subject is fictional, Singaporean,
aged 70-85, respectfully dressed, naturally lit, facing camera, with a simple
light neutral background, no text, no logo, no medical setting, no stereotype,
and no resemblance request for a real person.

Differentiate the fictional profiles consistently with the demo context:

- Mr Tan Ah Hock: Chinese Singaporean man, late 70s, neat short grey hair, collared casual shirt.
- Mdm Lim Siew Lan: Chinese Singaporean woman, early 70s, short grey hair, modest patterned blouse.
- Mdm Siti Fatimah Binte Rahman: Malay Singaporean woman, early 80s, modest pastel tudung and blouse.

Inspect each image, crop square if necessary, and convert to WebP at a practical
dashboard resolution between 384 and 640 pixels. Do not retain generator
metadata containing prompts or account identifiers in public assets.

- [ ] **Step 2: Write the failing avatar behavior test**

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeniorAvatar, shouldShowAvatarFallback } from "./SeniorAvatar";

describe("SeniorAvatar", () => {
  it("renders a fixed decorative portrait with an initials fallback", () => {
    const html = renderToStaticMarkup(createElement(SeniorAvatar, {
      name: "Mr Tan Ah Hock",
      src: "/seniors/mr-tan-ah-hock.webp",
      size: "md",
    }));
    expect(html).toContain('alt=""');
    expect(html).toContain("TH");
    expect(html).toContain("aspect-square");
  });

  it("shows initials when no source exists or image loading fails", () => {
    expect(shouldShowAvatarFallback(null, false)).toBe(true);
    expect(shouldShowAvatarFallback("/portrait.webp", false)).toBe(false);
    expect(shouldShowAvatarFallback("/portrait.webp", true)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the avatar test and confirm RED**

```bash
npm test -- src/components/dashboard/SeniorAvatar.test.ts
```

Expected: FAIL because `SeniorAvatar` does not exist.

- [ ] **Step 4: Implement the stable avatar component**

Use `next/image`, fixed dimensions, local state for failed images, empty alt
text, and initials behind the image so failure never changes dimensions.

```tsx
"use client";

import Image from "next/image";
import { useState } from "react";
import { initialsForSenior } from "./careWorkspacePresentation";

const sizes = { sm: 36, md: 48, lg: 64 } as const;

export function shouldShowAvatarFallback(src: string | null, failed: boolean) {
  return !src || failed;
}

export function SeniorAvatar(props: {
  name: string;
  src: string | null;
  size?: keyof typeof sizes;
}) {
  const [failed, setFailed] = useState(false);
  const pixels = sizes[props.size ?? "md"];
  const fallback = shouldShowAvatarFallback(props.src, failed);

  return (
    <span
      className="relative grid aspect-square shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--care-line)] bg-[var(--care-soft-purple)] font-bold text-[var(--care-plum)]"
      style={{ width: pixels, height: pixels }}
      aria-hidden="true"
    >
      <span>{initialsForSenior(props.name)}</span>
      {!fallback && props.src && (
        <Image
          alt=""
          src={props.src}
          width={pixels}
          height={pixels}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
```

- [ ] **Step 5: Verify tests and asset dimensions**

```bash
npm test -- src/components/dashboard/SeniorAvatar.test.ts src/components/dashboard/careWorkspacePresentation.test.ts
file public/seniors/*.webp
sips -g pixelWidth -g pixelHeight public/seniors/*.webp
```

Expected: tests PASS; all three files are WebP and square, 384-640px.

- [ ] **Step 6: Commit portraits and avatar behavior**

```bash
git add public/seniors src/components/dashboard/SeniorAvatar.tsx src/components/dashboard/SeniorAvatar.test.ts
git commit -m "feat: add fictional senior portraits"
```

---

### Task 3: Priority Rail And Selected Senior Header

**Files:**
- Modify: `src/components/dashboard/SeniorCoverage.tsx`
- Create: `src/components/dashboard/SeniorCoverage.test.ts`
- Modify: `src/components/dashboard/SelectedSeniorSummary.tsx`
- Modify: `src/components/dashboard/presentation.ts`

- [ ] **Step 1: Write failing server-rendered rail assertions**

Render `SeniorCoverage` with unsorted seniors and queue items. Assert the
rendered order, compact urgency wording, accessible button label, selection,
portrait fallback, and absence of verbose old copy.

```ts
const html = renderToStaticMarkup(createElement(SeniorCoverage, {
  seniors,
  queue,
  selectedSeniorId: "senior-yellow",
  disabled: false,
  onSelect: () => undefined,
}));

expect(html.indexOf("Mdm Siti")).toBeLessThan(html.indexOf("Mr Tan"));
expect(html).toContain("Urgent");
expect(html).toContain("Today");
expect(html).toContain("Stable");
expect(html).toContain('aria-pressed="true"');
expect(html).toContain("Select Mr Tan");
expect(html).not.toContain("years old");
expect(html).not.toContain("active follow-up item");
```

- [ ] **Step 2: Run the test and confirm RED**

```bash
npm test -- src/components/dashboard/SeniorCoverage.test.ts
```

Expected: FAIL because the component does not accept `queue` or render the
approved presentation.

- [ ] **Step 3: Implement the responsive priority coverage component**

Change props to accept `queue: FollowUpQueueItem[]`. Build the view through
`buildSeniorCoverage`. Render one semantic `nav` with an accessible label.
Use one horizontal `overflow-x-auto snap-x` list below `xl`, and a vertical list
at `xl`. Each button must have a stable mobile width, 44px minimum interaction
height, visible `focus-visible` outline, `aria-pressed`, rank, portrait, name,
urgency text, and one truncated reason. Use risk-based tint/edge classes from a
closed `coverageRiskStyle` map in `presentation.ts`; do not generate Tailwind
class names dynamically.

Render a `Monitoring` separator before the first item without an active queue
item. Keep the separator out when every senior has active work.

- [ ] **Step 4: Compact the selected senior summary**

Use `SeniorAvatar` with the same portrait mapping, a smaller heading, concise
age/living/address context, and three compact fields for primary caregiver,
AAC volunteer, and latest check-in. Retain every current fallback string.
Remove `rounded-2xl` and wide minimum widths; use 6-8px corners and wrapping
grid tracks.

- [ ] **Step 5: Verify focused component tests**

```bash
npm test -- \
  src/components/dashboard/careWorkspacePresentation.test.ts \
  src/components/dashboard/SeniorAvatar.test.ts \
  src/components/dashboard/SeniorCoverage.test.ts \
  src/components/dashboardViewModel.test.ts
npm run typecheck
```

Expected: all focused tests PASS; TypeScript exits `0`.

- [ ] **Step 6: Commit priority navigation and profile header**

```bash
git add src/components/dashboard/SeniorCoverage.tsx src/components/dashboard/SeniorCoverage.test.ts src/components/dashboard/SelectedSeniorSummary.tsx src/components/dashboard/presentation.ts
git commit -m "feat: add senior priority rail"
```

---

### Task 4: Recompose The Dashboard Workspace

**Files:**
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/dashboard/SeniorContextPanel.tsx`
- Modify: `src/components/dashboard/ProactiveCheckInPanel.tsx`
- Modify: `src/components/dashboard/ContactPlanPanel.tsx`

- [ ] **Step 1: Add approved visual tokens and motion rules**

Add only the tokens used across multiple components:

```css
:root {
  --care-ink: #17211d;
  --care-paper: #f4f7f5;
  --care-line: #dce3df;
  --care-green: #187652;
  --care-soft-green: #e1f3e9;
  --care-amber: #c27a20;
  --care-red: #b53a37;
  --care-plum: #705a82;
  --care-soft-purple: #f0ebf4;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

Remove the global `* { scroll-behavior: smooth; }`; it causes unrelated
workspace refreshes and anchor movement to animate.

- [ ] **Step 2: Implement the three-region workspace composition**

In `Dashboard.tsx`, pass the complete queue into `SeniorCoverage`. Replace the
hero header and stacked `max-w-7xl` list with:

```tsx
<main className="h-full overflow-y-auto bg-[var(--care-paper)] text-[var(--care-ink)]">
  <div className="mx-auto grid min-h-full w-full max-w-[1600px] gap-4 p-3 sm:p-4 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_18rem] xl:gap-5 xl:p-5">
    <aside className="min-w-0 lg:row-span-2 xl:sticky xl:top-5 xl:h-[calc(100vh-6.5rem)]">
      <SeniorCoverage
        seniors={seniors}
        queue={data.followUpQueue}
        selectedSeniorId={selectedSeniorId}
        disabled={interactionsDisabled}
        onSelect={(seniorId) => onSelectSenior?.(seniorId)}
      />
    </aside>
    <section className="min-w-0 space-y-4">
      <SelectedSeniorSummary senior={data.senior} selectedSenior={selectedSenior} />
      <PriorityCase
        items={queue}
        data={data}
        traces={traces}
        briefing={briefing}
        authToken={authToken ?? ""}
        disabled={interactionsDisabled}
        onSaved={refresh}
        onUnauthorized={unauthorized}
      />
      <DemoControls
        authToken={authToken ?? ""}
        visible={Boolean(isDemoAdmin && demoMode && authToken)}
        onRefresh={refresh}
        onUnauthorized={unauthorized}
      />
    </section>
    <aside className="min-w-0 space-y-3 lg:col-start-2 xl:col-start-3 xl:row-start-1">
      <SeniorContextPanel
        key={`senior-context:${selectedSeniorId ?? "none"}`}
        context={seniorContext}
        loading={seniorContextLoading}
        error={seniorContextError}
        isAdmin={isDemoAdmin}
        seniorId={selectedSeniorId}
        authToken={authToken ?? ""}
        onChanged={(context) => onSeniorContextChanged?.(context)}
        onUnauthorized={unauthorized}
      />
      <ProactiveCheckInPanel
        key={`proactive-check-in:${selectedSeniorId ?? "none"}`}
        overview={checkInSchedule}
        loading={checkInScheduleLoading}
        error={checkInScheduleError}
        isAdmin={isDemoAdmin}
        seniorId={selectedSeniorId}
        authToken={authToken ?? ""}
        onSaved={() => onRefreshCheckInSchedule?.()}
        onUnauthorized={unauthorized}
      />
      <ContactPlanPanel
        key={contactPlanInstanceKey(selectedSeniorId)}
        plan={contactPlan}
        loading={contactPlanLoading}
        error={contactPlanError}
        isAdmin={isDemoAdmin}
        seniorId={selectedSeniorId}
        authToken={authToken ?? ""}
        onSaved={() => onRefreshContactPlan?.()}
        onUnauthorized={unauthorized}
      />
    </aside>
  </div>
</main>
```

At widths below `lg`, normal document order must be priority strip, selected
senior, active case, and supporting sections. At `lg`, keep a reduced rail and
move support below the case. At `xl`, use all three regions. Do not add an outer
card around existing panel cards.

- [ ] **Step 3: Compact supporting panel roots**

Keep all existing data and admin controls. Change only root spacing, corner
radius, headings, and summary density:

- `SeniorContextPanel`: 8px radius, compact summary, `View context` label.
- `ProactiveCheckInPanel`: 8px radius, compact status, `Manage schedule` label.
- `ContactPlanPanel`: 8px radius, compact primary contact/method, admin controls
  remain available inside its existing expansion.

Do not change endpoints, command bodies, command ID reuse, conflict messages,
or authorization props.

- [ ] **Step 4: Run the affected panel and view-model tests**

```bash
npm test -- \
  src/components/dashboard/SeniorContextPanel.test.ts \
  src/components/dashboard/ProactiveCheckInPanel.test.ts \
  src/components/dashboard/ContactPlanPanel.test.ts \
  src/components/dashboardViewModel.test.ts
npm run typecheck
```

Expected: all tests PASS and TypeScript exits `0`.

- [ ] **Step 5: Commit workspace composition**

```bash
git add src/components/Dashboard.tsx src/app/globals.css src/components/dashboard/SeniorContextPanel.tsx src/components/dashboard/ProactiveCheckInPanel.tsx src/components/dashboard/ContactPlanPanel.tsx
git commit -m "feat: compose calm care workspace"
```

---

### Task 5: Clarify The Active Case And Plain-Language Explanation

**Files:**
- Modify: `src/components/dashboard/PriorityCase.tsx`
- Modify: `src/components/dashboard/CaseDetails.tsx`
- Modify: `src/components/dashboard/CaseDetails.test.ts`
- Modify: `src/components/dashboard/CaseUpdateForm.tsx`

- [ ] **Step 1: Write failing case-detail privacy and hierarchy tests**

Extend `CaseDetails.test.ts` to server-render a complete case. Assert that
normal staff markup contains chronological evidence, deterministic Pattern
Watch explanation, AI-generated caregiver summary, and action history, but
does not contain agent run counts, model metadata, provider output, or
`Advanced technical trace`.

```ts
expect(html).toContain("Chronological evidence");
expect(html).toContain("Why TrustKaki suggested this");
expect(html).toContain("Caregiver-recorded action history");
expect(html).not.toContain("Agent runs completed");
expect(html).not.toContain("Advanced technical trace");
expect(html).not.toMatch(/model|provider response|duration ms/i);
```

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
npm test -- src/components/dashboard/CaseDetails.test.ts
```

Expected: FAIL because normal details still render technical proof.

- [ ] **Step 3: Refine the priority case hierarchy**

In `PriorityCase.tsx`:

- remove the `traces` prop after `CaseDetails` no longer consumes technical proof;
- remove the duplicate large senior name because the profile header owns identity;
- make the case headline the primary heading;
- label the main explanation `Why now`;
- label the action surface `Recommended next step`;
- put `Update case` before the secondary evidence command;
- retain status, assigned caregiver, last response, related patterns, and the
  non-diagnostic risk explanation;
- use the approved 8px surfaces and existing risk edge/tint;
- keep every `CaseUpdateForm` prop and `key` unchanged.

- [ ] **Step 4: Remove raw proof from normal case details**

Remove the `traces` prop, `systemProof` call, metrics details, and advanced trace
placeholder from `CaseDetails`. Rename the plain-language explanation surface
to `Why TrustKaki suggested this` and style AI-generated briefing content with
the pale lavender surface and muted plum accent. Keep persisted senior messages,
Pattern Watch evidence, known context, and action history.

- [ ] **Step 5: Make the case form compact without changing commands**

Change layout-only classes so the form fits the main column at 390px and 1024px:

- 8px outer radius;
- one column by default, two columns at `md`, three only at `xl` when space allows;
- 44px minimum interactive control height;
- visible focus rings;
- no changes to command ID reuse, request bodies, validation, status handling,
  stale conflict refresh, emergency copy, or `tel:995` behavior.

- [ ] **Step 6: Run all case semantics tests**

```bash
npm test -- \
  src/components/dashboard/CaseDetails.test.ts \
  src/components/dashboard/CaseUpdateForm.test.ts \
  src/components/dashboardViewModel.test.ts
npm run typecheck
```

Expected: tests PASS and TypeScript exits `0`.

- [ ] **Step 7: Commit case hierarchy changes**

```bash
git add src/components/dashboard/PriorityCase.tsx src/components/dashboard/CaseDetails.tsx src/components/dashboard/CaseDetails.test.ts src/components/dashboard/CaseUpdateForm.tsx
git commit -m "feat: focus caregiver case actions"
```

---

### Task 6: Keep Raw Agent Traces Demo-Only

**Files:**
- Modify: `src/components/dashboardViewModel.ts`
- Modify: `src/components/dashboardViewModel.test.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/NavBar.tsx`
- Modify: `src/components/AgentTracePanel.tsx`

- [ ] **Step 1: Update the failing surface-boundary test**

Change the existing `appShellSurface` assertions so a non-admin never receives
chat, reasoning, or demo controls, while an authenticated demo admin who enables
demo mode receives all three.

```ts
expect(appShellSurface({ isDemoAdmin: false, demoMode: true })).toEqual({
  showChatSimulator: false,
  showReasoningRail: false,
  showDemoControls: false,
  proofPlacement: "plain_language_case",
});

expect(appShellSurface({ isDemoAdmin: true, demoMode: true })).toEqual({
  showChatSimulator: true,
  showReasoningRail: true,
  showDemoControls: true,
  proofPlacement: "demo_only",
});
```

- [ ] **Step 2: Run the view-model test and confirm RED**

```bash
npm test -- src/components/dashboardViewModel.test.ts
```

Expected: FAIL because chat and reasoning are currently always false.

- [ ] **Step 3: Implement the closed demo surface decision**

```ts
export function appShellSurface(args: { isDemoAdmin: boolean; demoMode: boolean }) {
  const enabled = args.isDemoAdmin && args.demoMode;
  return {
    showChatSimulator: enabled,
    showReasoningRail: enabled,
    showDemoControls: enabled,
    proofPlacement: enabled ? "demo_only" as const : "plain_language_case" as const,
  };
}
```

- [ ] **Step 4: Mount chat and traces only behind the derived surface**

In `page.tsx`, add local `reasoningVisible` state. Use
`surface.showChatSimulator` for `ChatSimulation` and
`surface.showReasoningRail` for `AgentTracePanel`; do not independently inspect
the user role in JSX. Keep the panel hidden below `md` to protect the mobile care
workflow. Reset `reasoningVisible` when demo mode closes.

The demo rail should stack the chat simulator above a collapsed trace panel and
must pass the already-sanitized `liveTraces`. Normal staff markup must not mount
`AgentTracePanel` at all.

- [ ] **Step 5: Apply restrained plum demo styling**

In `NavBar`, replace emoji-only brand/risk affordances with text that has an
accessible name and restrained plum brand detail. The demo toggle uses muted
plum only when enabled. Preserve `Sign out`, current props, and role-derived
visibility.

In `AgentTracePanel`, use the approved plum/lavender shell, keep Geist Mono for
technical metadata, add `type="button"`, `aria-expanded`, and visible focus.
Preserve caregiver-safe formatting from `agentTraceViewModel`; do not render raw
inputs or outputs.

- [ ] **Step 6: Verify demo boundary and trace sanitization**

```bash
npm test -- \
  src/components/dashboardViewModel.test.ts \
  src/components/agentTraceViewModel.test.ts \
  src/app/api/deployment-hardening.test.ts
npm run typecheck
```

Expected: tests PASS; normal surface remains fail-closed; deployment hardening
still accepts the trace component.

- [ ] **Step 7: Commit demo-only reasoning**

```bash
git add src/components/dashboardViewModel.ts src/components/dashboardViewModel.test.ts src/app/page.tsx src/components/NavBar.tsx src/components/AgentTracePanel.tsx
git commit -m "feat: confine technical traces to demo mode"
```

---

### Task 7: Responsive, Accessibility, And Visual Verification

**Files:**
- Modify only files identified by focused visual or accessibility defects
- Create: `docs/superpowers/verification/2026-07-18-gate-7-care-workspace.md`
- Modify: `docs/TrustKaki_BUILD_ROADMAP.md`

- [ ] **Step 1: Run the complete focused Gate 7 suite**

```bash
npm test -- \
  src/components/dashboard/careWorkspacePresentation.test.ts \
  src/components/dashboard/SeniorAvatar.test.ts \
  src/components/dashboard/SeniorCoverage.test.ts \
  src/components/dashboard/CaseDetails.test.ts \
  src/components/dashboard/CaseUpdateForm.test.ts \
  src/components/dashboard/SeniorContextPanel.test.ts \
  src/components/dashboard/ProactiveCheckInPanel.test.ts \
  src/components/dashboard/ContactPlanPanel.test.ts \
  src/components/dashboardViewModel.test.ts \
  src/components/agentTraceViewModel.test.ts
```

Expected: all focused tests PASS with no non-live skip attributable to Gate 7.

- [ ] **Step 2: Start the local development server**

Use an available port. Load `.env.local` without printing it. If port 3000 is
available:

```bash
npm run dev -- -p 3000
```

Keep the process running and report the local URL.

- [ ] **Step 3: Verify the authenticated workspace in the browser**

Use the configured private demo account through the browser UI; never log,
record, or commit credentials. Do not reset the demo or save a caregiver action.

At `1440x900`, `1024x768`, and `390x844`, verify:

- the page loads without a framework overlay or console error;
- ranked senior order matches queue priority and risk;
- colored edge/tint and `Urgent / Today / Monitoring / Stable` are visible;
- desktop uses three regions and mobile uses the horizontal priority strip;
- portraits load and a forced missing-image check retains initials and dimensions;
- switching seniors updates the profile and case without stale content or jump;
- `Update case` opens, all controls fit, and cancel closes it without saving;
- supporting sections expand without nested-card or overflow defects;
- normal staff mode does not mount raw traces;
- authenticated demo mode exposes chat, controls, and sanitized traces;
- tab focus is visible and follows a coherent order;
- `prefers-reduced-motion: reduce` disables nonessential transitions;
- `document.documentElement.scrollWidth === document.documentElement.clientWidth`;
- the longest senior name and action labels do not clip or overlap.

Capture screenshots for the three viewports and inspect them directly. Do not
commit screenshots containing authenticated or senior content.

- [ ] **Step 4: Fix only evidence-backed visual defects and rerun focused checks**

For each defect, add or tighten a pure/rendered regression assertion where
practical, make the smallest class or component correction, and rerun the
relevant focused test. Do not add unrelated redesign work.

- [ ] **Step 5: Run complete validation**

```bash
npm run validate
```

Expected: all non-live tests, TypeScript, ESLint, and the production build PASS.
Record exact counts and expected live-gated skips.

- [ ] **Step 6: Inspect secrets and scope**

```bash
git diff --check
git status --short
git diff --stat 799989c..HEAD
rg -n -i '(sk-[a-z0-9]|service_role|authorization: bearer|phone_number_id|telegram.*chat|whatsapp.*payload)' \
  docs/superpowers/verification/2026-07-18-gate-7-care-workspace.md \
  public/seniors src/components src/app/globals.css
```

Expected: no secret, raw phone number, Telegram identifier, WhatsApp identifier,
destination, provider payload, or credential in new UI/assets/docs. Review
matches manually because type names such as `service_role` may be legitimate
existing source references but must not be newly exposed.

- [ ] **Step 7: Write truthful verification evidence and update the roadmap**

Create the verification document with:

- implemented scope and explicit exclusions;
- commit list;
- focused and full validation commands/counts;
- desktop/tablet/mobile screenshot observations;
- portrait source statement that all subjects are fictional;
- accessibility and reduced-motion checks;
- confirmation that no live database mutation was required;
- known limitations, including static portraits for only the demo profiles;
- secret and sensitive-data review result.

Mark Gate 7 complete in the roadmap only if focused, full, and browser
verification all pass. Set Gate 8 as the next bounded step: submission deck,
demo rehearsal, final privacy/security review, deployment confirmation, and
go/no-go evidence. Do not claim user research that did not occur.

- [ ] **Step 8: Commit the verified Gate 7 baseline**

```bash
git add docs/TrustKaki_BUILD_ROADMAP.md docs/superpowers/verification/2026-07-18-gate-7-care-workspace.md
git commit -m "docs: verify gate 7 care workspace"
```

- [ ] **Step 9: Request independent audit before merge**

Ask the reviewer to inspect the complete Gate 7 diff for:

- deterministic ordering and tie-breaking;
- policy risk remaining authoritative;
- no backend/auth/persistence regression;
- demo-only raw trace visibility and safe trace formatting;
- portrait privacy, fictional labeling, missing-image fallback, and no metadata leakage;
- keyboard, color-independent status, contrast, motion, responsive overflow, and text fit;
- meaningful tests rather than class-name-only assertions;
- accurate verification evidence and absence of secrets.

Do not merge or push until the audit is approved and any findings are remediated.

---

## Final Acceptance Checklist

- [ ] Priority order is deterministic and tested.
- [ ] Queue priority semantics remain ascending, matching the repository.
- [ ] Policy risk remains persisted/server-authoritative.
- [ ] Portraits are fictional local bitmaps with stable initials fallback.
- [ ] Desktop, intermediate, and mobile layouts match the approved workspace.
- [ ] Care action commands and stale-conflict behavior are unchanged.
- [ ] Raw traces are mounted only in authenticated demo mode.
- [ ] Normal staff explanation is plain-language and excludes provider details.
- [ ] Status remains understandable without color.
- [ ] Keyboard focus, touch targets, reduced motion, overflow, and text fit pass.
- [ ] Focused tests and `npm run validate` pass.
- [ ] Verification evidence is accurate and contains no sensitive data.
- [ ] Independent audit approves the complete Gate 7 diff.
