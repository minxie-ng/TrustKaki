import { describe, expect, it } from "vitest";
import {
  proactiveCheckInPresentation,
  proactiveScheduleEndpoint,
} from "./ProactiveCheckInPanel";

describe("proactive check-in admin panel", () => {
  it("is hidden from non-admin caregivers", () => {
    expect(proactiveCheckInPresentation(null, false)).toEqual({ visible: false });
  });

  it("shows concise operational status without provider details", () => {
    const view = proactiveCheckInPresentation({
      schedule: {
        id: "schedule-1",
        seniorId: "senior-1",
        platform: "telegram",
        localSendTime: "09:00",
        timezone: "Asia/Singapore",
        activeWeekdays: [1, 2, 3, 4, 5, 6, 7],
        initialResponseMinutes: 120,
        retryResponseMinutes: 60,
        initialMessageTemplate: "Good morning. How are you today?",
        retryMessageTemplate: "Just checking again. Reply when convenient.",
        enabled: true,
        pausedAt: null,
        pauseReason: null,
        nextRunAt: "2026-07-16T01:00:00.000Z",
        lastRunAt: "2026-07-15T01:00:00.000Z",
        updatedAt: "2026-07-15T01:00:00.000Z",
      },
      state: "awaiting_initial_response",
      lastSendAt: "2026-07-15T01:00:00.000Z",
      lastFailure: null,
    }, true);

    expect(view).toMatchObject({
      visible: true,
      status: "Waiting for reply",
      canRunNow: true,
      canPause: true,
      canResume: false,
    });
    expect(JSON.stringify(view)).not.toMatch(/chat.?id|token|provider|destination/i);
  });

  it("binds requests to the selected senior", () => {
    expect(proactiveScheduleEndpoint("senior-2")).toBe(
      "/api/admin/seniors/senior-2/check-in-schedule"
    );
  });
});
