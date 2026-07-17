import { describe, expect, it, vi } from "vitest";
import type { MemoryApplicationTag } from "@/lib/memory/contracts";
import type { ClaimedProactiveJob } from "@/lib/persistence/proactiveCheckInRepository";
import type { TelegramOutboundClient } from "@/lib/telegram/types";
import {
  personaliseCheckIn,
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
    loadActiveContextApplicationTags: vi.fn(async () => []),
    findTelegramChatIdForSenior: vi.fn(async () => "chat-123"),
    findAcceptedOutbound: vi.fn(async () => null),
    beginSendIntent: vi.fn(async () => ({ result: "send_ready" as const })),
    markSendUncertain: vi.fn(async () => undefined),
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
  it("uses only fixed variants for supported memory tags", () => {
    const base = "Good morning. How are you feeling today?";
    const rawMemoryContent = "My private breakfast note must never be copied";

    const concise = personaliseCheckIn(base, ["concise_text"], "initial_send");
    const gentle = personaliseCheckIn(
      base,
      ["gentle_one_to_one"],
      "initial_send"
    );
    const meal = personaliseCheckIn(
      base,
      ["practical_meal_prompt"],
      "initial_send"
    );
    const untrusted = personaliseCheckIn(
      base,
      [rawMemoryContent as MemoryApplicationTag],
      "initial_send"
    );

    expect(concise.length).toBeLessThan(base.length);
    expect(gentle).toContain("No rush");
    expect(meal).toContain("Have you managed to eat today?");
    expect(untrusted).toBe(base);
    expect(untrusted).not.toContain(rawMemoryContent);
  });

  it("uses a fixed low-pressure retry variant", () => {
    expect(
      personaliseCheckIn(
        "Just checking again. Reply when convenient.",
        ["gentle_one_to_one"],
        "retry_send"
      )
    ).toBe("No rush. Just reply when convenient.");
  });

  it("loads senior tags at send time and persists the exact fixed variant", async () => {
    const fixture = setup("initial_send");
    vi.mocked(
      fixture.dependencies.loadActiveContextApplicationTags
    ).mockResolvedValue(["gentle_one_to_one", "practical_meal_prompt"]);

    await processDueProactiveJobs({
      limit: 10,
      workerId: "worker-1",
      now,
      outboundClient: fixture.outboundClient,
      dependencies: fixture.dependencies,
    });

    const text =
      "Hi, just checking in. No rush - how are you today? Have you managed to eat today?";
    expect(
      fixture.dependencies.loadActiveContextApplicationTags
    ).toHaveBeenCalledWith({ seniorId, now });
    expect(fixture.outboundClient.sendText).toHaveBeenCalledWith({
      chatId: "chat-123",
      text,
    });
    expect(fixture.dependencies.recordProviderAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({ text })
    );
  });

  it("sends one initial message, persists acceptance, then opens two-hour window", async () => {
    const fixture = setup("initial_send");
    const result = await processDueProactiveJobs({
      limit: 10,
      workerId: "worker-1",
      now,
      outboundClient: fixture.outboundClient,
      dependencies: fixture.dependencies,
    });

    const intentCall = vi.mocked(fixture.dependencies.beginSendIntent).mock
      .invocationCallOrder[0];
    const sendCall = vi.mocked(fixture.outboundClient.sendText).mock
      .invocationCallOrder[0];
    expect(intentCall).toBeLessThan(sendCall);
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
    expect(
      fixture.dependencies.loadActiveContextApplicationTags
    ).not.toHaveBeenCalled();
    expect(fixture.dependencies.recordProviderAcceptance).not.toHaveBeenCalled();
    expect(fixture.dependencies.completeJob).toHaveBeenCalledOnce();
  });

  it("falls back to the configured template when context tags are unavailable", async () => {
    const fixture = setup("initial_send");
    vi.mocked(
      fixture.dependencies.loadActiveContextApplicationTags
    ).mockRejectedValue(new Error("context unavailable"));

    const result = await processDueProactiveJobs({
      limit: 10,
      workerId: "worker-1",
      now,
      outboundClient: fixture.outboundClient,
      dependencies: fixture.dependencies,
    });

    expect(fixture.outboundClient.sendText).toHaveBeenCalledWith({
      chatId: "chat-123",
      text: "Good morning. How are you today?",
    });
    expect(result).toEqual({ claimed: 1, processed: 1, failed: 0 });
  });

  it("does not resend when an earlier send intent has an uncertain outcome", async () => {
    const fixture = setup("initial_send");
    vi.mocked(fixture.dependencies.beginSendIntent).mockResolvedValue({
      result: "reconciliation_required",
    });

    const result = await processDueProactiveJobs({
      limit: 10,
      workerId: "worker-1",
      now,
      outboundClient: fixture.outboundClient,
      dependencies: fixture.dependencies,
    });

    expect(fixture.outboundClient.sendText).not.toHaveBeenCalled();
    expect(fixture.dependencies.markSendUncertain).toHaveBeenCalledOnce();
    expect(fixture.dependencies.retryJob).not.toHaveBeenCalled();
    expect(result).toEqual({ claimed: 1, processed: 0, failed: 1 });
  });

  it("marks the attempt uncertain instead of retrying after provider I/O begins", async () => {
    const fixture = setup("initial_send");
    vi.mocked(fixture.outboundClient.sendText).mockRejectedValue(
      new Error("Telegram request outcome is unknown")
    );

    const result = await processDueProactiveJobs({
      limit: 10,
      workerId: "worker-1",
      now,
      outboundClient: fixture.outboundClient,
      dependencies: fixture.dependencies,
    });

    expect(fixture.dependencies.markSendUncertain).toHaveBeenCalledOnce();
    expect(fixture.dependencies.retryJob).not.toHaveBeenCalled();
    expect(result).toEqual({ claimed: 1, processed: 0, failed: 1 });
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

  it("does not retry a transport failure after durable send intent", async () => {
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

    expect(fixture.dependencies.markSendUncertain).toHaveBeenCalledOnce();
    expect(fixture.dependencies.retryJob).not.toHaveBeenCalled();
    expect(result).toEqual({ claimed: 1, processed: 0, failed: 1 });
  });
});
