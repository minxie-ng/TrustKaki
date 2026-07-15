import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createTrustKakiServiceClientMock = vi.fn();
const createTrustKakiUserClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createTrustKakiServiceClient: createTrustKakiServiceClientMock,
  createTrustKakiUserClient: createTrustKakiUserClientMock,
}));

const scheduleRow = {
  id: "00000000-0000-4000-8000-000000000101",
  senior_id: "00000000-0000-4000-8000-000000000102",
  platform: "telegram",
  local_send_time: "09:00:00",
  timezone: "Asia/Singapore",
  active_weekdays: [1, 2, 3, 4, 5, 6, 7],
  initial_response_minutes: 120,
  retry_response_minutes: 60,
  initial_message_template: "Good morning. How are you today?",
  retry_message_template: "Just checking again. Reply when convenient.",
  enabled: true,
  paused_at: null,
  pause_reason: null,
  next_run_at: "2026-07-16T01:00:00.000Z",
  last_run_at: null,
  updated_at: "2026-07-15T01:00:00.000Z",
};

function scheduleClient(data: unknown = scheduleRow) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  return { client: { from: vi.fn(() => builder) }, builder };
}

describe("proactive check-in repository", () => {
  beforeEach(() => {
    vi.resetModules();
    createTrustKakiServiceClientMock.mockReset();
    createTrustKakiUserClientMock.mockReset();
  });

  it("reads a senior-scoped schedule through the authenticated client", async () => {
    const user = scheduleClient();
    createTrustKakiUserClientMock.mockReturnValue(user.client);
    const { readScheduleForSenior } = await import(
      "./proactiveCheckInRepository"
    );

    await expect(
      readScheduleForSenior({ accessToken: "user-token", seniorId: scheduleRow.senior_id })
    ).resolves.toMatchObject({
      id: scheduleRow.id,
      seniorId: scheduleRow.senior_id,
      platform: "telegram",
      initialResponseMinutes: 120,
      retryResponseMinutes: 60,
    });
    expect(createTrustKakiUserClientMock).toHaveBeenCalledWith("user-token");
    expect(user.builder.eq).toHaveBeenCalledWith("senior_id", scheduleRow.senior_id);
  });

  it("sends schedule changes only through the transactional admin RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        schedule_id: scheduleRow.id,
        workflow_id: null,
        duplicate: false,
      },
      error: null,
    });
    createTrustKakiUserClientMock.mockReturnValue({ rpc });
    const { saveScheduleCommand } = await import("./proactiveCheckInRepository");
    const command = {
      seniorId: scheduleRow.senior_id,
      commandId: "00000000-0000-4000-8000-000000000103",
      action: "configure" as const,
      platform: "telegram" as const,
      localSendTime: "09:00",
      timezone: "Asia/Singapore",
      activeWeekdays: [1, 2, 3, 4, 5, 6, 7],
      initialResponseMinutes: 120,
      retryResponseMinutes: 60,
      initialMessageTemplate: "Good morning. How are you today?",
      retryMessageTemplate: "Just checking again. Reply when convenient.",
      reason: null,
      now: "2026-07-15T01:00:00.000Z",
    };

    await expect(saveScheduleCommand("user-token", command)).resolves.toEqual({
      scheduleId: scheduleRow.id,
      workflowId: null,
      duplicate: false,
    });
    expect(rpc).toHaveBeenCalledWith("manage_proactive_check_in_schedule", {
      p_senior_id: command.seniorId,
      p_command_id: command.commandId,
      p_action: "configure",
      p_platform: "telegram",
      p_local_send_time: "09:00",
      p_timezone: "Asia/Singapore",
      p_active_weekdays: [1, 2, 3, 4, 5, 6, 7],
      p_initial_response_minutes: 120,
      p_retry_response_minutes: 60,
      p_initial_message_template: command.initialMessageTemplate,
      p_retry_message_template: command.retryMessageTemplate,
      p_reason: null,
      p_now: command.now,
    });
  });

  it("claims bounded due jobs without returning transport identities", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        id: "00000000-0000-4000-8000-000000000104",
        senior_id: scheduleRow.senior_id,
        schedule_id: scheduleRow.id,
        workflow_id: "00000000-0000-4000-8000-000000000105",
        stage: "initial_send",
        scheduled_for: "2026-07-15T01:00:00.000Z",
        payload: {},
        attempt_count: 1,
        claimed_by: "worker-a",
        claim_expires_at: "2026-07-15T01:05:00.000Z",
      }],
      error: null,
    });
    createTrustKakiServiceClientMock.mockReturnValue({ rpc });
    const { claimDueJobs } = await import("./proactiveCheckInRepository");

    const jobs = await claimDueJobs({
      limit: 10,
      workerId: "worker-a",
      now: "2026-07-15T01:00:00.000Z",
    });

    expect(rpc).toHaveBeenCalledWith("claim_due_proactive_check_in_jobs", {
      p_limit: 10,
      p_worker_id: "worker-a",
      p_now: "2026-07-15T01:00:00.000Z",
    });
    expect(jobs).toHaveLength(1);
    expect(JSON.stringify(jobs)).not.toMatch(/chat.?id|bot.?token|destination/i);
  });

  it("uses only database commands for completing, retrying, responding, and timeout", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: {
          job_id: "00000000-0000-4000-8000-000000000104",
          next_job_id: "00000000-0000-4000-8000-000000000106",
          duplicate: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          result: "pending_work_cancelled",
          workflow_id: "00000000-0000-4000-8000-000000000105",
          queue_item_id: null,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          result: "caregiver_case_created",
          workflow_id: "00000000-0000-4000-8000-000000000105",
          queue_item_id: "00000000-0000-4000-8000-000000000107",
          operational_risk: "yellow",
        },
        error: null,
      });
    createTrustKakiServiceClientMock.mockReturnValue({ rpc });
    const repository = await import("./proactiveCheckInRepository");

    await repository.completeJob({
      jobId: "00000000-0000-4000-8000-000000000104",
      workerId: "worker-a",
      nextStage: "initial_deadline",
      nextScheduledFor: "2026-07-15T03:00:00.000Z",
      clientMessageId: "proactive-message-1",
      now: "2026-07-15T01:00:00.000Z",
    });
    await repository.retryJob({
      jobId: "00000000-0000-4000-8000-000000000104",
      workerId: "worker-a",
      errorCategory: "provider_unavailable",
      nextEligibleAt: "2026-07-15T01:05:00.000Z",
      now: "2026-07-15T01:00:00.000Z",
    });
    await repository.recordSeniorResponse({
      seniorId: scheduleRow.senior_id,
      clientMessageId: "telegram:910000001",
      respondedAt: "2026-07-15T02:00:00.000Z",
    });
    await repository.finalizeTimeout({
      jobId: "00000000-0000-4000-8000-000000000104",
      workerId: "worker-a",
      now: "2026-07-15T04:00:00.000Z",
    });

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "advance_proactive_check_in_job",
      "retry_proactive_check_in_job",
      "record_proactive_check_in_response",
      "finalize_proactive_check_in_timeout",
    ]);
  });

  it("rejects malformed database results", async () => {
    createTrustKakiServiceClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: [{ id: "not-a-uuid" }], error: null }),
    });
    const { claimDueJobs } = await import("./proactiveCheckInRepository");

    await expect(
      claimDueJobs({ limit: 1, workerId: "worker-a", now: "2026-07-15T01:00:00.000Z" })
    ).rejects.toThrow();
  });
});
