import "server-only";

import type { MemoryApplicationTag } from "@/lib/memory/contracts";
import { loadActiveContextApplicationTags } from "@/lib/persistence/memoryRepository";
import {
  beginSendIntent,
  claimDueJobs,
  completeJob,
  enqueueDueSchedules,
  finalizeTimeout,
  findAcceptedOutbound,
  markSendUncertain,
  readProcessingSchedule,
  recordProviderAcceptance,
  retryJob,
  type ClaimedProactiveJob,
  type ProactiveProcessingSchedule,
} from "@/lib/persistence/proactiveCheckInRepository";
import { findTelegramChatIdForSenior } from "@/lib/persistence/seniorMessagingIdentityRepository";
import { telegramOutboundClient } from "@/lib/telegram/client";
import type { TelegramOutboundClient } from "@/lib/telegram/types";
import type { ProactiveCheckInStage } from "./contracts";
import { isWithinQuietHours, nextProactiveAction } from "./policy";

const PROCESSOR_RETRY_DELAY_MS = 5 * 60 * 1000;

class UncertainProactiveSendError extends Error {
  constructor() {
    super("Proactive send requires reconciliation");
    this.name = "UncertainProactiveSendError";
  }
}

export interface ProactiveCheckInProcessorDependencies {
  enqueueDueSchedules: typeof enqueueDueSchedules;
  claimDueJobs: typeof claimDueJobs;
  readProcessingSchedule: (scheduleId: string) => Promise<ProactiveProcessingSchedule>;
  loadActiveContextApplicationTags: typeof loadActiveContextApplicationTags;
  findTelegramChatIdForSenior: (seniorId: string) => Promise<string | null>;
  findAcceptedOutbound: typeof findAcceptedOutbound;
  beginSendIntent: typeof beginSendIntent;
  markSendUncertain: typeof markSendUncertain;
  recordProviderAcceptance: typeof recordProviderAcceptance;
  completeJob: typeof completeJob;
  retryJob: typeof retryJob;
  finalizeTimeout: typeof finalizeTimeout;
}

const defaultDependencies: ProactiveCheckInProcessorDependencies = {
  enqueueDueSchedules,
  claimDueJobs,
  readProcessingSchedule,
  loadActiveContextApplicationTags,
  findTelegramChatIdForSenior,
  findAcceptedOutbound,
  beginSendIntent,
  markSendUncertain,
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

export function personaliseCheckIn(
  baseText: string,
  tags: readonly MemoryApplicationTag[],
  stage: ProactiveCheckInStage
): string {
  const tagSet = new Set(tags);
  const retry = stage === "retry_send";
  let text = baseText.trim();
  if (tagSet.has("gentle_one_to_one")) {
    text = retry
      ? "No rush. Just reply when convenient."
      : "Hi, just checking in. No rush - how are you today?";
  } else if (tagSet.has("concise_text")) {
    text = retry ? "Please reply when convenient." : "How are you today?";
  }
  if (tagSet.has("practical_meal_prompt")) {
    text = `${text} Have you managed to eat today?`;
  }
  return text;
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
  const baseText = isInitial
    ? args.schedule.initialMessageTemplate
    : args.schedule.retryMessageTemplate;
  const messageId = clientMessageId(args.job);
  const accepted = await args.dependencies.findAcceptedOutbound(messageId);

  if (!accepted) {
    const tags = await args.dependencies
      .loadActiveContextApplicationTags({
        seniorId: args.job.senior_id,
        now: args.now,
      })
      .catch(() => [] as MemoryApplicationTag[]);
    const text = personaliseCheckIn(baseText, tags, args.job.stage);
    const chatId = await args.dependencies.findTelegramChatIdForSenior(
      args.job.senior_id
    );
    if (!chatId) throw new Error("Telegram identity is unavailable");
    const intent = await args.dependencies.beginSendIntent({
      jobId: args.job.id,
      workerId: args.job.claimed_by,
      now: args.now,
    });
    if (intent.result === "reconciliation_required") {
      await args.dependencies
        .markSendUncertain({
          jobId: args.job.id,
          workerId: args.job.claimed_by,
          errorCategory: "unresolved_send_intent",
          now: args.now,
        })
        .catch(() => undefined);
      throw new UncertainProactiveSendError();
    }

    try {
      const outbound = await args.outboundClient.sendText({ chatId, text });
      await args.dependencies.recordProviderAcceptance({
        seniorId: args.job.senior_id,
        clientMessageId: messageId,
        text,
        externalMessageId: outbound.messageId,
        acceptedAt: args.now,
      });
    } catch {
      await args.dependencies
        .markSendUncertain({
          jobId: args.job.id,
          workerId: args.job.claimed_by,
          errorCategory: "uncertain_provider_outcome",
          now: args.now,
        })
        .catch(() => undefined);
      throw new UncertainProactiveSendError();
    }
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
      if (!(error instanceof UncertainProactiveSendError)) {
        await deferJob({
          job,
          now: args.now,
          category: errorCategory(error),
          dependencies,
        }).catch(() => undefined);
      }
    }
  }

  return { claimed: jobs.length, processed, failed };
}
