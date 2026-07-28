import { describe, expect, it } from "vitest";
import type { DashboardData, FollowUpQueueItem } from "@/lib/types";
import {
  advanceDemo,
  demoGuideComposition,
  isPrepared,
  isResolveVerified,
  isResponseRecorded,
} from "./demoGuideState";

const queueItem: FollowUpQueueItem = {
  id: "queue-1",
  seniorId: "senior-1",
  seniorName: "Mr Tan Ah Hock",
  riskLevel: "yellow",
  headline: "Follow-up suggested",
  reason: "Mobility, appetite, and routine changes across four days.",
  changeFromUsual: "Different from his usual morning routine.",
  lastResponseAt: "2026-07-10T08:00:00.000Z",
  recommendedAction: "Call today and check whether he needs meal support.",
  status: "pending",
  assignedTo: null,
  lastUpdatedAt: "2026-07-11T08:00:00.000Z",
  priority: 100,
  relatedPatterns: [],
  pattern: {
    id: "pattern-1",
    type: "combined_wellbeing_decline",
    status: "active",
    severity: "medium",
    conciseSummary: "Pattern summary",
    recommendedAction: "Call today.",
    firstObservedAt: "2026-07-07T08:00:00.000Z",
    latestObservedAt: "2026-07-10T08:00:00.000Z",
    evidence: [
      {
        id: "signal-1",
        type: "health",
        severity: "medium",
        description: "Knee discomfort",
        observedAt: "2026-07-07T08:00:00.000Z",
      },
    ],
    triggerExplanation: "Deterministic pattern trigger",
    comparison: "Changed from usual routine",
    previousActions: [],
  },
};

function dashboardData(
  overrides: Partial<DashboardData> = {}
): DashboardData {
  return {
    senior: {
      name: "Mr Tan Ah Hock",
      age: 76,
      gender: "Male",
      livingSituation: "Lives alone",
      caregiver: "Rachel",
      aacVolunteer: "Mei Ling",
      riskLevel: "yellow",
      lastCheckIn: "2026-07-10T08:00:00.000Z",
    },
    activeSessions: [],
    recentAlerts: [],
    followUpQueue: [queueItem],
    activity: [],
    ...overrides,
  };
}

describe("demo guide", () => {
  it("renders retained Activity evidence after completion without restoring workflow navigation", () => {
    expect(
      demoGuideComposition({
        activeView: "activity",
        enabled: true,
        phase: "complete",
      })
    ).toEqual({
      showWorkspace: false,
      showActivity: true,
      lockWorkspaceMutations: false,
      suppressWorkflowNavigation: true,
    });
  });

  it("locks active phases to the workspace and suppresses competing Activity", () => {
    expect(
      demoGuideComposition({
        activeView: "activity",
        enabled: true,
        phase: "respond",
      })
    ).toEqual({
      showWorkspace: true,
      showActivity: false,
      lockWorkspaceMutations: true,
      suppressWorkflowNavigation: true,
    });
  });

  it("does not advance when refresh is stale", () => {
    expect(
      advanceDemo("prepare", { commandOk: true, stateVerified: false })
    ).toEqual({
      phase: "prepare",
      error: "The demo data has not refreshed yet. Retry preparation.",
    });
  });

  it("advances exactly one phase after command and state verification", () => {
    expect(
      advanceDemo("prepare", { commandOk: true, stateVerified: true })
    ).toEqual({ phase: "review", error: null });
  });

  it("requires a pending case with persisted evidence before review", () => {
    expect(isPrepared(dashboardData())).toBe(true);
    expect(
      isPrepared(dashboardData({
        followUpQueue: [{ ...queueItem, pattern: null }],
      }))
    ).toBe(false);
  });

  it("requires the controlled outcome in retained activity", () => {
    expect(
      isResponseRecorded(
        dashboardData({
          activity: [
            {
              id: "activity-1",
              queueItemId: "queue-1",
              seniorId: "senior-1",
              actionType: "record_outcome",
              outcomeType: "needs_follow_up",
              previousStatus: "pending",
              resultingStatus: "acknowledged",
              note: "Follow-up recorded.",
              caregiver: "Rachel",
              createdAt: "2026-07-11T09:00:00.000Z",
            },
          ],
        }),
        "queue-1"
      )
    ).toBe(true);
    expect(
      isResponseRecorded(
        dashboardData({
          activity: [
            {
              id: "activity-wrong-outcome",
              queueItemId: "queue-1",
              seniorId: "senior-1",
              actionType: "record_outcome",
              outcomeType: "reached_and_okay",
              previousStatus: "pending",
              resultingStatus: "followed_up",
              note: "Reached and okay.",
              caregiver: "Rachel",
              createdAt: "2026-07-11T09:00:00.000Z",
            },
          ],
        }),
        "queue-1"
      )
    ).toBe(false);
  });

  it("requires retained resolved history before completion", () => {
    const resolvedActivity = {
      id: "activity-2",
      queueItemId: "queue-1",
      seniorId: "senior-1",
      actionType: "resolve" as const,
      outcomeType: "resolved" as const,
      previousStatus: "followed_up" as const,
      resultingStatus: "resolved" as const,
      note: "Resolved after follow-up.",
      caregiver: "Rachel",
      createdAt: "2026-07-11T09:05:00.000Z",
    };

    expect(
      isResolveVerified(
        dashboardData({ followUpQueue: [], activity: [resolvedActivity] }),
        "queue-1"
      )
    ).toBe(true);
    expect(
      isResolveVerified(
        dashboardData({ followUpQueue: [], activity: [] }),
        "queue-1"
      )
    ).toBe(false);
  });
});
