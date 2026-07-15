import "server-only";

import {
  claimDueJobs,
  completeJob,
  enqueueDueSchedules,
  finalizeTimeout,
  findAcceptedOutbound,
  readProcessingSchedule,
  recordProviderAcceptance,
  retryJob,
  type ClaimedProactiveJob,
  type ProactiveProcessingSchedule,
} from "@/lib/persistence/proactiveCheckInRepository";
import { findTelegramChatIdForSenior } from "@/lib/persistence/seniorMessagingIdentityRepository";
import { telegramOutboundClient } from "@/lib/telegram/client";
import type { TelegramOutboundClient } from "@/lib/telegram/types";
import { isWithinQuietHours, nextProactiveAction } from "./policy";

const PROCESSOR_RETRY_DELAY_MS = 5 * 60 * 1000;

export interface ProactiveCheckInProcessorDependencies {
  enqueueDueSchedules: typeof enqueueDueSchedules;
  claimDueJobs: typeof claimDueJobs;
  readProcessingSchedule: (scheduleId: string) => Promise<ProactiveProcessingSchedule>;
  findTelegramChatIdForSenior: (seniorId: string) => Promise<string | null>;
  findAcceptedOutbound: typeof findAcceptedOutbound;
  recordProviderAcceptance: typeof recordProviderAcceptance;
  completeJob: typeof completeJob;
  retryJob: typeof retryJob;
  finalizeTimeout: typeof finalizeTimeout;
}

const defaultDependencies: ProactiveCheckInProcessorDependencies = {
  enqueueDueSchedules,
  claimDueJobs,
  readProcessingSchedule,
  findTelegramChatIdForSenior,
  findAcceptedOutbound,
  recordProviderAcceptance,
  completeJob,
  retryJob,
  finalizeTimeout,
};

function plusMinutes(instant: string, minutes: number): string {
  return new Date(Date.parse(instant) + minutes * 60_000).toISOString();
}

function clientMessageId(job: ClaimedProactiveJob): string {
  return `proactive:${job.workflow_id}:${job.stage}`;
}

function errorCategory(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("Telegram")) {
    return "telegram_transport";
  }
  if (error instanceof Error && error.message === "Telegram identity is unavailable") {
    return "messaging_identity_missing";
  }
  return "processor_error";
}

async function deferJob(args: {
  job: ClaimedProactiveJob;
  now: string;
  category: string;
  dependencies: ProactiveCheckInProcessorDependencies;
}) {
  await args.dependencies.retryJob({
    jobId: args.job.id,
    workerId: args.job.claimed_by,
    errorCategory: args.category,
    nextEligibleAt: new Date(Date.parse(args.now) + PROCESSOR_RETRY_DELAY_MS).toISOString(),
    now: args.now,
  });
}

async function sendStage(args: {
  job: ClaimedProactiveJob;
  schedule: ProactiveProcessingSchedule;
  now: string;
  outboundClient: TelegramOutboundClient;
  dependencies: ProactiveCheckInProcessorDependencies;
}) {
  const isInitial = args.job.stage === "initial_send";
  const text = isInitial
    ? args.schedule.initialMessageTemplate
    : args.schedule.retryMessageTemplate;
  const messageId = clientMessageId(args.job);
  const accepted = await args.dependencies.findAcceptedOutbound(messageId);

  if (!accepted) {
    const chatId = await args.dependencies.findTelegramChatIdForSenior(
      args.job.senior_id
    );
    if (!chatId) throw new Error("Telegram identity is unavailable");
    const outbound = await args.outboundClient.sendText({ chatId, text });
    await args.dependencies.recordProviderAcceptance({
      seniorId: args.job.senior_id,
      clientMessageId: messageId,
      text,
      externalMessageId: outbound.messageId,
      acceptedAt: args.now,
    });
  }

  await args.dependencies.completeJob({
    jobId: args.job.id,
    workerId: args.job.claimed_by,
    nextStage: isInitial ? "initial_deadline" : "final_deadline",
    nextScheduledFor: plusMinutes(
      args.now,
      isInitial
        ? args.schedule.initialResponseMinutes
        : args.schedule.retryResponseMinutes
    ),
    clientMessageId: messageId,
    now: args.now,
  });
}

async function processJob(args: {
  job: ClaimedProactiveJob;
  now: string;
  outboundClient: TelegramOutboundClient;
  dependencies: ProactiveCheckInProcessorDependencies;
}) {
  const schedule = await args.dependencies.readProcessingSchedule(
    args.job.schedule_id
  );
  if (schedule.platform !== "telegram") {
    throw new Error("Unsupported proactive transport");
  }
  const withinQuietHours = isWithinQuietHours({
    now: args.now,
    timezone: schedule.timezone,
    start: schedule.quietHoursStart,
    end: schedule.quietHoursEnd,
  });
  const action = nextProactiveAction({
    stage: args.job.stage,
    scheduledFor: args.job.scheduled_for,
    now: args.now,
    paused: schedule.paused,
    withinQuietHours,
  });

  if (action.type === "wait") {
    await deferJob({
      job: args.job,
      now: args.now,
      category: action.reason,
      dependencies: args.dependencies,
    });
    return;
  }
  if (args.job.stage === "initial_deadline") {
    await args.dependencies.completeJob({
      jobId: args.job.id,
      workerId: args.job.claimed_by,
      nextStage: "retry_send",
      nextScheduledFor: args.now,
      clientMessageId: `proactive:${args.job.workflow_id}:retry_ready`,
      now: args.now,
    });
    return;
  }
  if (action.type === "create_case") {
    await args.dependencies.finalizeTimeout({
      jobId: args.job.id,
      workerId: args.job.claimed_by,
      now: args.now,
    });
    return;
  }
  await sendStage({ ...args, schedule });
}

export async function processDueProactiveJobs(args: {
  limit: number;
  workerId: string;
  now: string;
  outboundClient?: TelegramOutboundClient;
  dependencies?: ProactiveCheckInProcessorDependencies;
}): Promise<{ claimed: number; processed: number; failed: number }> {
  const dependencies = args.dependencies ?? defaultDependencies;
  const outboundClient = args.outboundClient ?? telegramOutboundClient;
  await dependencies.enqueueDueSchedules({ limit: args.limit, now: args.now });
  const jobs = await dependencies.claimDueJobs({
    limit: args.limit,
    workerId: args.workerId,
    now: args.now,
  });
  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await processJob({ job, now: args.now, outboundClient, dependencies });
      processed += 1;
    } catch (error) {
      failed += 1;
      await deferJob({
        job,
        now: args.now,
        category: errorCategory(error),
        dependencies,
      }).catch(() => undefined);
    }
  }

  return { claimed: jobs.length, processed, failed };
}
