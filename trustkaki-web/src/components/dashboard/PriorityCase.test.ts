import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DashboardData, FollowUpQueueItem } from "@/lib/types";
import { PriorityCase } from "./PriorityCase";

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
  it("exposes the collapsed case-details disclosure state", () => {
    const html = renderToStaticMarkup(createElement(PriorityCase, {
      items: [item],
      data,
      authToken: "test-token",
      disabled: false,
      onSaved: () => undefined,
      onUnauthorized: () => undefined,
    }));

    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("View details");
  });
});
