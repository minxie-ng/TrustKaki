import { beforeEach, describe, expect, it, vi } from "vitest";

const readDashboardStateMock = vi.fn();

vi.mock("@/lib/persistence/trustkakiRepository", () => ({
  readDashboardState: readDashboardStateMock,
}));

beforeEach(() => {
  readDashboardStateMock.mockReset();
});

describe("/api/dashboard/state", () => {
  it("returns stored dashboard state for refresh hydration", async () => {
    const { GET } = await import("./route");
    readDashboardStateMock.mockResolvedValue({
      persistence: {
        mode: "supabase",
        configured: true,
        persisted: true,
      },
      data: {
        senior: {
          name: "Uncle Tan",
          age: 76,
          livingSituation: "Lives alone",
          caregiver: "Rachel Tan",
          aacVolunteer: "Mei Ling",
          riskLevel: "yellow",
          lastCheckIn: "2026-07-11T00:00:00.000Z",
        },
        activeSessions: [
          {
            id: "check_in_1",
            startedAt: "2026-07-11T00:00:00.000Z",
            status: "active",
            messages: [],
            traces: [],
            riskBefore: "green",
            riskAfter: "yellow",
            summary: "Stored summary",
          },
        ],
        recentAlerts: [],
      },
      briefing: null,
      traces: [],
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.persistence.persisted).toBe(true);
    expect(json.data.senior.riskLevel).toBe("yellow");
    expect(json.data.activeSessions[0].summary).toBe("Stored summary");
  });
});
