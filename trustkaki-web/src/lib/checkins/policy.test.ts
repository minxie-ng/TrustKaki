import { describe, expect, it } from "vitest";
import {
  isWithinQuietHours,
  nextQuietHoursEnd,
  nextProactiveAction,
  responseDisposition,
} from "./policy";

const initialDeadline = "2026-07-15T02:00:00.000Z";
const finalDeadline = "2026-07-15T03:00:00.000Z";

describe("proactive check-in policy", () => {
  it("sends the initial check-in once its job is due", () => {
    expect(
      nextProactiveAction({
        stage: "initial_send",
        scheduledFor: "2026-07-15T00:00:00.000Z",
        now: "2026-07-15T00:00:00.000Z",
        paused: false,
        withinQuietHours: false,
      })
    ).toEqual({ type: "send_initial" });
  });

  it("waits the full two hours before allowing the single retry", () => {
    const base = {
      stage: "initial_deadline" as const,
      scheduledFor: initialDeadline,
      paused: false,
      withinQuietHours: false,
    };

    expect(
      nextProactiveAction({ ...base, now: "2026-07-15T01:59:00.000Z" })
    ).toEqual({ type: "wait", reason: "not_due" });
    expect(nextProactiveAction({ ...base, now: initialDeadline })).toEqual({
      type: "send_retry",
    });
  });

  it("waits another hour and creates a case instead of a second retry", () => {
    const base = {
      stage: "final_deadline" as const,
      scheduledFor: finalDeadline,
      paused: false,
      withinQuietHours: false,
    };

    expect(
      nextProactiveAction({ ...base, now: "2026-07-15T02:59:00.000Z" })
    ).toEqual({ type: "wait", reason: "not_due" });
    expect(nextProactiveAction({ ...base, now: finalDeadline })).toEqual({
      type: "create_case",
    });
  });

  it("blocks sends while paused or during quiet hours", () => {
    expect(
      nextProactiveAction({
        stage: "initial_send",
        scheduledFor: "2026-07-15T00:00:00.000Z",
        now: "2026-07-15T00:00:00.000Z",
        paused: true,
        withinQuietHours: false,
      })
    ).toEqual({ type: "wait", reason: "paused" });

    expect(
      nextProactiveAction({
        stage: "retry_send",
        scheduledFor: "2026-07-15T00:00:00.000Z",
        now: "2026-07-15T00:00:00.000Z",
        paused: false,
        withinQuietHours: true,
      })
    ).toEqual({ type: "wait", reason: "quiet_hours" });
  });

  it("does not let quiet hours delay a due non-response case", () => {
    expect(
      nextProactiveAction({
        stage: "final_deadline",
        scheduledFor: finalDeadline,
        now: finalDeadline,
        paused: false,
        withinQuietHours: true,
      })
    ).toEqual({ type: "create_case" });
  });

  it("recognizes daytime and overnight quiet-hour boundaries", () => {
    expect(
      isWithinQuietHours({
        now: "2026-07-15T14:30:00.000Z",
        timezone: "Asia/Singapore",
        start: "22:00",
        end: "07:00",
      })
    ).toBe(true);
    expect(
      isWithinQuietHours({
        now: "2026-07-14T23:00:00.000Z",
        timezone: "Asia/Singapore",
        start: "07:00",
        end: "12:00",
      })
    ).toBe(true);
    expect(
      isWithinQuietHours({
        now: "2026-07-14T23:00:00.000Z",
        timezone: "Asia/Singapore",
        start: null,
        end: null,
      })
    ).toBe(false);
  });

  it("cancels pending work for a timely reply and annotates a late reply", () => {
    expect(
      responseDisposition({
        workflowStatus: "awaiting_retry_response",
        responseWindowOpenedAt: "2026-07-15T00:00:00.000Z",
        respondedAt: "2026-07-15T02:30:00.000Z",
      })
    ).toEqual({ type: "cancel_pending" });
    expect(
      responseDisposition({
        workflowStatus: "escalated",
        responseWindowOpenedAt: "2026-07-15T00:00:00.000Z",
        respondedAt: "2026-07-15T03:30:00.000Z",
      })
    ).toEqual({ type: "annotate_late_response" });
  });

  it("ignores older messages and responses for terminal workflows", () => {
    expect(
      responseDisposition({
        workflowStatus: "awaiting_initial_response",
        responseWindowOpenedAt: "2026-07-15T00:00:00.000Z",
        respondedAt: "2026-07-14T23:59:59.000Z",
      })
    ).toEqual({ type: "ignore", reason: "before_response_window" });
    expect(
      responseDisposition({
        workflowStatus: "responded",
        responseWindowOpenedAt: "2026-07-15T00:00:00.000Z",
        respondedAt: "2026-07-15T01:00:00.000Z",
      })
    ).toEqual({ type: "ignore", reason: "terminal_workflow" });
  });

  it("does not match a message before the initial send is accepted", () => {
    expect(
      responseDisposition({
        workflowStatus: "pending_initial_send",
        responseWindowOpenedAt: null,
        respondedAt: "2026-07-15T00:00:00.000Z",
      })
    ).toEqual({ type: "ignore", reason: "response_window_not_open" });
  });
});

describe("quiet-hour deferral time", () => {
  it.each([
    ["2026-07-15T15:00:42.123Z", "Asia/Singapore", "22:00", "07:00", "2026-07-15T23:00:00.000Z"],
    ["2026-07-15T18:00:00.000Z", "Asia/Singapore", "22:00", "07:00", "2026-07-15T23:00:00.000Z"],
    ["2026-07-15T01:00:00.000Z", "Asia/Singapore", "08:00", "12:00", "2026-07-15T04:00:00.000Z"],
    ["2026-03-08T06:30:00.000Z", "America/New_York", "22:00", "07:00", "2026-03-08T11:00:00.000Z"],
    ["2026-11-01T05:30:00.000Z", "America/New_York", "22:00", "07:00", "2026-11-01T12:00:00.000Z"],
  ])("finds next allowed instant from %s", (now, timezone, start, end, expected) => {
    expect(nextQuietHoursEnd({ now, timezone, start, end })).toBe(expected);
  });
  it("returns current time when already outside quiet hours", () => {
    const now = "2026-07-15T01:00:00.000Z";
    expect(nextQuietHoursEnd({ now, timezone: "Asia/Singapore", start: "22:00", end: "07:00" })).toBe(now);
  });
});
