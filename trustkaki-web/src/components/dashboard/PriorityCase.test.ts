import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DashboardData, FollowUpQueueItem } from "@/lib/types";
import { invokeViewRecentActivity, PriorityCase } from "./PriorityCase";

const item = {
  id: "queue-1",
  seniorId: "senior-1",
  seniorName: "Mdm Lim Siew Lan",
  riskLevel: "yellow",
  headline: "Follow-up needed",
  reason: "A recent change needs review.",
  changeFromUsual: "Different from usual.",
  lastResponseAt: "2026-07-18T01:00:00.000Z",
  recommendedAction: "Check in today.",
  status: "pending",
  assignedTo: null,
  lastUpdatedAt: "2026-07-18T02:00:00.000Z",
  priority: 1,
  relatedPatterns: [],
  pattern: null,
} satisfies FollowUpQueueItem;

const data = {
  senior: {
    name: "Mdm Lim Siew Lan",
    age: 74,
    livingSituation: "Lives alone",
    caregiver: "Caregiver A",
    aacVolunteer: "Volunteer B",
    riskLevel: "yellow",
    lastCheckIn: "2026-07-18T01:00:00.000Z",
  },
  activeSessions: [],
  recentAlerts: [],
  followUpQueue: [item],
} satisfies DashboardData;

describe("PriorityCase", () => {
  it("invokes the optional recent-activity callback", () => {
    let calls = 0;

    invokeViewRecentActivity(() => {
      calls += 1;
    });
    invokeViewRecentActivity(undefined);

    expect(calls).toBe(1);
  });

  it("treats an empty queue as successful and preserves activity navigation", () => {
    const html = renderToStaticMarkup(createElement(PriorityCase, {
      items: [],
      data: { ...data, followUpQueue: [] },
      authToken: "test-token",
      disabled: false,
      onSaved: () => undefined,
      onConflictRefresh: async () => undefined,
      onUnauthorized: () => undefined,
    }));

    expect(html).toContain("No active follow-ups");
    expect(html).toContain("View recent activity");
    expect(html).toContain('data-status-dot="true"');
  });

  it("exposes the collapsed case-details disclosure state", () => {
    const html = renderToStaticMarkup(createElement(PriorityCase, {
      items: [item],
      data,
      authToken: "test-token",
      disabled: false,
      onSaved: () => undefined,
      onConflictRefresh: async () => undefined,
      onUnauthorized: () => undefined,
    }));

    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("View timeline");
    expect(html.indexOf("View timeline")).toBeLessThan(html.indexOf("Why now"));
  });

  it("opens the timeline when the guided demo requests it", () => {
    const html = renderToStaticMarkup(createElement(PriorityCase, {
      items: [item],
      data,
      authToken: "test-token",
      disabled: false,
      openTimelineRequest: 1,
      onSaved: () => undefined,
      onConflictRefresh: async () => undefined,
      onUnauthorized: () => undefined,
    }));

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Hide timeline");
  });

  it("suppresses competing case commands while the guide owns the workflow", () => {
    const html = renderToStaticMarkup(createElement(PriorityCase, {
      items: [item],
      data,
      authToken: "test-token",
      disabled: false,
      guideLocked: true,
      onSaved: () => undefined,
      onConflictRefresh: async () => undefined,
      onUnauthorized: () => undefined,
    }));

    expect(html).not.toContain("Update case");
    expect(html).not.toContain("Save update");
  });

  it("uses a flat surface with status dots instead of filled pills", () => {
    const html = renderToStaticMarkup(createElement(PriorityCase, {
      items: [item],
      data,
      authToken: "test-token",
      disabled: false,
      onSaved: () => undefined,
      onConflictRefresh: async () => undefined,
      onUnauthorized: () => undefined,
    }));

    expect(html).toContain('data-status-dot="true"');
    expect(html).toContain("font-display");
    expect(html).not.toMatch(/shadow-|rounded-lg|bg-(?:amber|yellow|red|emerald)-(?:50|100)/);
  });
});
