import {
  nextProactiveActionInputSchema,
  quietHoursInputSchema,
  responseDispositionInputSchema,
  type NextProactiveAction,
  type NextProactiveActionInput,
  type QuietHoursInput,
  type ResponseDisposition,
  type ResponseDispositionInput,
} from "./contracts";

function timestamp(value: string): number {
  return new Date(value).getTime();
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function localMinutes(instant: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 60 + minute;
}

export function isWithinQuietHours(rawInput: QuietHoursInput): boolean {
  const input = quietHoursInputSchema.parse(rawInput);
  if (!input.start || !input.end) return false;

  const now = localMinutes(input.now, input.timezone);
  const start = timeToMinutes(input.start);
  const end = timeToMinutes(input.end);
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

export function nextQuietHoursEnd(rawInput: QuietHoursInput): string {
  const input = quietHoursInputSchema.parse(rawInput);
  if (!isWithinQuietHours(input)) return input.now;

  // Search actual instants so timezone offset changes and skipped local times work.
  const nextMinute = Math.floor(timestamp(input.now) / 60_000) * 60_000 + 60_000;
  for (let minute = 0; minute < 48 * 60; minute += 1) {
    const candidate = new Date(nextMinute + minute * 60_000).toISOString();
    if (!isWithinQuietHours({ ...input, now: candidate })) return candidate;
  }
  throw new Error("Quiet-hour end unavailable");
}

export function nextProactiveAction(
  rawInput: NextProactiveActionInput
): NextProactiveAction {
  const input = nextProactiveActionInputSchema.parse(rawInput);
  if (input.paused) return { type: "wait", reason: "paused" };
  if (timestamp(input.now) < timestamp(input.scheduledFor)) {
    return { type: "wait", reason: "not_due" };
  }

  if (input.stage !== "final_deadline" && input.withinQuietHours) {
    return { type: "wait", reason: "quiet_hours" };
  }

  switch (input.stage) {
    case "initial_send":
      return { type: "send_initial" };
    case "initial_deadline":
    case "retry_send":
      return { type: "send_retry" };
    case "final_deadline":
      return { type: "create_case" };
  }
}

export function responseDisposition(
  rawInput: ResponseDispositionInput
): ResponseDisposition {
  const input = responseDispositionInputSchema.parse(rawInput);
  if (!input.responseWindowOpenedAt) {
    return { type: "ignore", reason: "response_window_not_open" };
  }
  if (timestamp(input.respondedAt) < timestamp(input.responseWindowOpenedAt)) {
    return { type: "ignore", reason: "before_response_window" };
  }
  if (input.workflowStatus === "escalated") {
    return { type: "annotate_late_response" };
  }
  if (
    input.workflowStatus === "responded" ||
    input.workflowStatus === "cancelled" ||
    input.workflowStatus === "failed"
  ) {
    return { type: "ignore", reason: "terminal_workflow" };
  }
  return { type: "cancel_pending" };
}
