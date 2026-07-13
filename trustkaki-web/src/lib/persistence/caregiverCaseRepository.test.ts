import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createTrustKakiUserClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createTrustKakiUserClient: createTrustKakiUserClientMock,
}));

describe("caregiver case repository", () => {
  beforeEach(() => {
    vi.resetModules();
    createTrustKakiUserClientMock.mockReset();
  });

  it("executes one authenticated RPC and returns the database-derived actor", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        queue_item_id: "queue-1",
        senior_id: "senior-1",
        actor_caregiver_id: "caregiver-1",
        assigned_caregiver_id: "caregiver-2",
        previous_status: "pending",
        resulting_status: "acknowledged",
      },
      error: null,
    });
    createTrustKakiUserClientMock.mockReturnValue({ rpc });
    const { recordCaregiverQueueAction } = await import(
      "./caregiverCaseRepository"
    );

    const result = await recordCaregiverQueueAction({
      accessToken: "verified-token",
      queueItemId: "queue-1",
      actionType: "assign",
      assignedCaregiverId: "caregiver-2",
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("record_caregiver_queue_action", {
      p_queue_item_id: "queue-1",
      p_action_type: "assign",
      p_outcome_type: null,
      p_note: null,
      p_assigned_caregiver_id: "caregiver-2",
      p_snoozed_until: null,
    });
    expect(result).toMatchObject({
      actorCaregiverId: "caregiver-1",
      assignedCaregiverId: "caregiver-2",
      previousStatus: "pending",
      resultingStatus: "acknowledged",
      persistence: { persisted: true },
    });
  });

  it("does not return success metadata when the RPC fails", async () => {
    createTrustKakiUserClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Forbidden" },
      }),
    });
    const { recordCaregiverQueueAction } = await import(
      "./caregiverCaseRepository"
    );

    await expect(
      recordCaregiverQueueAction({
        accessToken: "verified-token",
        queueItemId: "queue-1",
        actionType: "resolve",
        outcomeType: "resolved",
        note: "Caregiver confirmed the case is resolved.",
      })
    ).rejects.toThrow("record caregiver queue action failed");
  });
});
