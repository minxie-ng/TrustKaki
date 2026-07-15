import { describe, expect, it, vi } from "vitest";
import type { ClaimedProactiveJob } from "@/lib/persistence/proactiveCheckInRepository";
import type { TelegramOutboundClient } from "@/lib/telegram/types";
import {
  processDueProactiveJobs,
  type ProactiveCheckInProcessorDependencies,
} from "./service";

vi.mock("server-only", () => ({}));

const seniorId = "10000000-0000-4000-8000-000000000001";
const scheduleId = "20000000-0000-4000-8000-000000000002";
const workflowId = "30000000-0000-4000-8000-000000000003";
const jobId = "40000000-0000-4000-8000-000000000004";
const now = "2026-07-15T01:00:00.000Z";

function job(stage: ClaimedProactiveJob["stage"]): ClaimedProactiveJob {
  return {
    id: jobId,
    senior_id: seniorId,
    schedule_id: scheduleId,
    workflow_id: workflowId,
    stage,
    scheduled_for: now,
    attempt_count: 1,
    claimed_by: "worker-1",
    claim_expires_at: "2026-07-15T01:05:00.000Z",
  };
}

function setup(stage: ClaimedProactiveJob["stage"]) {
  const calls: string[] = [];
  const dependencies: ProactiveCheckInProcessorDependencies = {
    enqueueDueSchedules: vi.fn(async () => 1),
    claimDueJobs: vi.fn(async () => [job(stage)]),
    readProcessingSchedule: vi.fn(async () => ({
      id: scheduleId,
      platform: "telegram" as const,
      timezone: "Asia/Singapore",
      initialResponseMinutes: 120,
      retryResponseMinutes: 60,
      initialMessageTemplate: "Good morning. How are you today?",
      retryMessageTemplate: "Just checking again. Reply when convenient.",
      paused: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    })),
    findTelegramChatIdForSenior: vi.fn(async () => "chat-123"),
    findAcceptedOutbound: vi.fn(async () => null),
    recordProviderAcceptance: vi.fn(async () => {
      calls.push("accepted");
    }),
    completeJob: vi.fn(async () => {
      calls.push("completed");
      return { job_id: jobId, next_job_id: jobId, duplicate: false };
    }),
    retryJob: vi.fn(async () => undefined),
    finalizeTimeout: vi.fn(async () => ({ result: "case_created" })),
  };
  const outboundClient: TelegramOutboundClient = {
    sendText: vi.fn(async () => {
      calls.push("sent");
      return { messageId: "telegram-message-1" };
    }),
  };
  return { dependencies, outboundClient, calls };
}

describe("proactive check-in processor", () => {
  it("sends one initial message, persists acceptance, then opens two-hour window", async () => {
    const fixture = setup("initial_send");
    const result = await processDueProactiveJobs({
      limit: 10,
      workerId: "worker-1",
      now,
      outboundClient: fixture.outboundClient,
      dependencies: fixture.dependencies,
    });

    expect(fixture.calls).toEqual(["sent", "accepted", "completed"]);
    expect(fixture.dependencies.completeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        nextStage: "initial_deadline",
        nextScheduledFor: "2026-07-15T03:00:00.000Z",
      })
    );
    expect(result).toEqual({ claimed: 1, processed: 1, failed: 0 });
  });

  it("resumes after recorded provider acceptance without sending again", async () => {
    const fixture = setup("initial_send");
    vi.mocked(fixture.dependencies.findAcceptedOutbound).mockResolvedValue({
      externalMessageId: "telegram-message-existing",
    });

    await processDueProactiveJobs({
      limit: 10,
      workerId: "worker-1",
      now,
      outboundClient: fixture.outboundClient,
      dependencies: fixture.dependencies,
    });

    expect(fixture.outboundClient.sendText).not.toHaveBeenCalled();
    expect(fixture.dependencies.recordProviderAcceptance).not.toHaveBeenCalled();
    expect(fixture.dependencies.completeJob).toHaveBeenCalledOnce();
  });

  it("moves an expired initial window to a separate retry-send job", async () => {
    const fixture = setup("initial_deadline");

    await processDueProactiveJobs({
      limit: 10,
      workerId: "worker-1",
      now,
      outboundClient: fixture.outboundClient,
      dependencies: fixture.dependencies,
    });

    expect(fixture.outboundClient.sendText).not.toHaveBeenCalled();
    expect(fixture.dependencies.completeJob).toHaveBeenCalledWith(
      expect.objectContaining({ nextStage: "retry_send", nextScheduledFor: now })
    );
  });

  it("sends one gentle retry and schedules a final one-hour deadline", async () => {
    const fixture = setup("retry_send");

    await processDueProactiveJobs({
      limit: 10,
      workerId: "worker-1",
      now,
      outboundClient: fixture.outboundClient,
      dependencies: fixture.dependencies,
    });

    expect(fixture.outboundClient.sendText).toHaveBeenCalledOnce();
    expect(fixture.dependencies.completeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        nextStage: "final_deadline",
        nextScheduledFor: "2026-07-15T02:00:00.000Z",
      })
    );
  });

  it("creates the caregiver case at final deadline without a second retry", async () => {
    const fixture = setup("final_deadline");

    await processDueProactiveJobs({
      limit: 10,
      workerId: "worker-1",
      now,
      outboundClient: fixture.outboundClient,
      dependencies: fixture.dependencies,
    });

    expect(fixture.outboundClient.sendText).not.toHaveBeenCalled();
    expect(fixture.dependencies.finalizeTimeout).toHaveBeenCalledOnce();
    expect(fixture.dependencies.completeJob).not.toHaveBeenCalled();
  });

  it("defers a send during quiet hours", async () => {
    const fixture = setup("initial_send");
    const quietTime = "2026-07-15T15:00:00.000Z";

    await processDueProactiveJobs({
      limit: 10,
      workerId: "worker-1",
      now: quietTime,
      outboundClient: fixture.outboundClient,
      dependencies: fixture.dependencies,
    });

    expect(fixture.outboundClient.sendText).not.toHaveBeenCalled();
    expect(fixture.dependencies.retryJob).toHaveBeenCalledWith(
      expect.objectContaining({ errorCategory: "quiet_hours" })
    );
  });

  it("classifies transport failure and leaves the job retryable", async () => {
    const fixture = setup("initial_send");
    vi.mocked(fixture.outboundClient.sendText).mockRejectedValue(
      new Error("Telegram send failed")
    );

    const result = await processDueProactiveJobs({
      limit: 10,
      workerId: "worker-1",
      now,
      outboundClient: fixture.outboundClient,
      dependencies: fixture.dependencies,
    });

    expect(fixture.dependencies.retryJob).toHaveBeenCalledWith(
      expect.objectContaining({ errorCategory: "telegram_transport" })
    );
    expect(result).toEqual({ claimed: 1, processed: 0, failed: 1 });
  });
});
