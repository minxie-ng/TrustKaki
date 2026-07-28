import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CareActivityItem, FollowUpQueueItem } from "@/lib/types";
import { CareActivity } from "./CareActivity";

const activity: CareActivityItem = {
  id: "activity-1",
  queueItemId: "queue-1",
  seniorId: "senior-1",
  actionType: "record_outcome",
  outcomeType: "reached_and_okay",
  previousStatus: "acknowledged",
  resultingStatus: "resolved",
  note: "Rachel confirmed that Uncle Tan ate lunch.",
  caregiver: "Rachel Tan",
  createdAt: "2026-07-28T07:30:00.000Z",
};

const queueWithEvidence: FollowUpQueueItem = {
  id: "queue-1",
  seniorId: "senior-1",
  seniorName: "Uncle Tan",
  riskLevel: "yellow",
  headline: "Follow up on knee discomfort",
  reason: "Check whether the discomfort is affecting meals.",
  changeFromUsual: "Reported discomfort at today's check-in.",
  lastResponseAt: "2026-07-28T06:55:00.000Z",
  recommendedAction: "Call before lunch.",
  status: "pending",
  assignedTo: null,
  lastUpdatedAt: "2026-07-28T07:00:00.000Z",
  priority: 1,
  pattern: {
    id: "pattern-1",
    type: "mobility_and_frailty",
    status: "active",
    severity: "medium",
    conciseSummary: "Knee discomfort",
    recommendedAction: "Call before lunch.",
    firstObservedAt: "2026-07-28T06:55:00.000Z",
    latestObservedAt: "2026-07-28T06:55:00.000Z",
    evidence: [{
      id: "evidence-1",
      type: "health",
      severity: "medium",
      description: "Knee discomfort",
      observedAt: "2026-07-28T06:55:00.000Z",
      message: "Knee discomfort",
    }],
    triggerExplanation: "A new health concern was reported.",
    comparison: "No knee discomfort was reported yesterday.",
    previousActions: [],
  },
  relatedPatterns: [],
};

function renderCareActivity({
  retainedActivity,
  queue,
}: {
  retainedActivity: CareActivityItem[];
  queue: FollowUpQueueItem[];
}) {
  return renderToStaticMarkup(createElement(CareActivity, {
    activity: retainedActivity,
    queue,
    seniorName: "Uncle Tan",
    onReturnToWorkspace: vi.fn(),
  }));
}

describe("care activity", () => {
  it("keeps resolved activity visible with actor, action, outcome, and time", () => {
    const html = renderCareActivity({ retainedActivity: [activity], queue: [] });

    expect(html).toContain("Rachel Tan");
    expect(html).toContain("Recorded follow-up");
    expect(html).toContain("Resolved");
    expect(html).toContain("Reached and okay");
    expect(html).toContain('data-care-thread="true"');
    expect(html).toContain("28 Jul 2026");
  });

  it("merges active observed signals into the source-labelled chronology", () => {
    const html = renderCareActivity({
      retainedActivity: [],
      queue: [queueWithEvidence],
    });

    expect(html).toContain("Observed signal");
    expect(html).toContain("Care policy");
    expect(html).toContain("Knee discomfort");
    expect(html).toContain("Check whether the discomfort is affecting meals.");
  });

  it("sorts a combined copy without mutating activity or queue props", () => {
    const retainedActivity = [activity];
    const queue = [queueWithEvidence];

    const html = renderCareActivity({ retainedActivity, queue });

    expect(html.indexOf("Rachel Tan")).toBeLessThan(html.indexOf("Care policy"));
    expect(retainedActivity).toEqual([activity]);
    expect(queue).toEqual([queueWithEvidence]);
  });

  it("shows a useful empty state and a route back to the workspace", () => {
    const html = renderCareActivity({ retainedActivity: [], queue: [] });

    expect(html).toContain("No care activity recorded");
    expect(html).toContain("Return to care workspace");
  });
});
