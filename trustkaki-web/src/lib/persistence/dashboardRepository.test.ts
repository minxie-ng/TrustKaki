import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  activityItemFromRow,
  resolveQueueRiskLevel,
} from "./dashboardRepository";

describe("caregiver activity", () => {
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
});

describe("proactive caregiver queue presentation", () => {
  it("uses operational Yellow without rewriting the senior policy risk", () => {
    expect(resolveQueueRiskLevel("green", "yellow")).toBe("yellow");
    expect(resolveQueueRiskLevel("red", null)).toBe("red");
  });
});
