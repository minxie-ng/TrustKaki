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
        queue_updated_at: "2026-07-14T02:01:00.000Z",
        command_id: "00000000-0000-4000-8000-000000000099",
        duplicate: false,
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
      commandId: "00000000-0000-4000-8000-000000000099",
      expectedUpdatedAt: "2026-07-14T02:00:00.000Z",
      actionType: "assign",
      assignedCaregiverId: "caregiver-2",
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("record_caregiver_queue_action", {
      p_queue_item_id: "queue-1",
      p_action_type: "assign",
      p_command_id: "00000000-0000-4000-8000-000000000099",
      p_expected_updated_at: "2026-07-14T02:00:00.000Z",
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
      duplicate: false,
      persistence: { persisted: true },
    });
  });

  it("uses the dedicated atomic escalation RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        queue_item_id: "queue-1",
        senior_id: "senior-1",
        actor_caregiver_id: "caregiver-1",
        assigned_caregiver_id: "caregiver-2",
        previous_status: "acknowledged",
        resulting_status: "escalated",
        queue_updated_at: "2026-07-14T02:01:00.000Z",
        command_id: "00000000-0000-4000-8000-000000000099",
        duplicate: false,
        recipient_decision: {
          result: "candidate_selected",
          selected_contact_id: "00000000-0000-4000-8000-000000000010",
          selected_method_id: "00000000-0000-4000-8000-000000000011",
          explanation: "Selected the first consented AAC contact.",
          delivered: false,
        },
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
      commandId: "00000000-0000-4000-8000-000000000099",
      expectedUpdatedAt: "2026-07-14T02:00:00.000Z",
      actionType: "escalate",
      escalationDestination: "aac_supervisor",
      notificationCategory: "wellbeing_follow_up",
      note: "Unable to reach the senior twice; supervisor review is needed today.",
    });

    expect(rpc).toHaveBeenCalledWith("escalate_caregiver_queue_case", {
      p_queue_item_id: "queue-1",
      p_command_id: "00000000-0000-4000-8000-000000000099",
      p_expected_updated_at: "2026-07-14T02:00:00.000Z",
      p_escalation_destination: "aac_supervisor",
      p_notification_category: "wellbeing_follow_up",
      p_note: "Unable to reach the senior twice; supervisor review is needed today.",
    });
    expect(result.resultingStatus).toBe("escalated");
    expect(result.recipientDecision).toMatchObject({
      result: "candidate_selected",
      delivered: false,
    });
  });

  it("rejects incomplete escalation before contacting the database", async () => {
    const rpc = vi.fn();
    createTrustKakiUserClientMock.mockReturnValue({ rpc });
    const { recordCaregiverQueueAction } = await import(
      "./caregiverCaseRepository"
    );

    await expect(
      recordCaregiverQueueAction({
        accessToken: "verified-token",
        queueItemId: "queue-1",
        commandId: "00000000-0000-4000-8000-000000000099",
        expectedUpdatedAt: "2026-07-14T02:00:00.000Z",
        actionType: "escalate",
      })
    ).rejects.toThrow("Escalation destination, category, and reason are required");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not return success metadata when the RPC fails", async () => {
    createTrustKakiUserClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Forbidden", code: "42501" },
      }),
    });
    const { recordCaregiverQueueAction } = await import(
      "./caregiverCaseRepository"
    );

    await expect(
      recordCaregiverQueueAction({
        accessToken: "verified-token",
        queueItemId: "queue-1",
        commandId: "00000000-0000-4000-8000-000000000099",
        expectedUpdatedAt: "2026-07-14T02:00:00.000Z",
        actionType: "resolve",
        outcomeType: "resolved",
        note: "Caregiver confirmed the case is resolved.",
      })
    ).rejects.toThrow("record caregiver queue action failed");
  });

  it("classifies database serialization conflicts", async () => {
    createTrustKakiUserClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Case changed", code: "PT409" },
      }),
    });
    const { CaregiverCaseConflictError, recordCaregiverQueueAction } =
      await import("./caregiverCaseRepository");

    await expect(
      recordCaregiverQueueAction({
        accessToken: "verified-token",
        queueItemId: "queue-1",
        commandId: "00000000-0000-4000-8000-000000000099",
        expectedUpdatedAt: "2026-07-14T02:00:00.000Z",
        actionType: "assign",
      })
    ).rejects.toBeInstanceOf(CaregiverCaseConflictError);
  });
});
