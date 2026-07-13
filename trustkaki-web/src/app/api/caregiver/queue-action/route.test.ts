import { beforeEach, describe, expect, it, vi } from "vitest";

const recordCaregiverQueueActionMock = vi.fn();
const requireAuthenticatedCaregiverMock = vi.fn();

const auth = {
  userId: "auth-user-1",
  email: "judge@example.com",
  role: "demo_admin",
  caregiverId: "caregiver-1",
  caregiverName: "Rachel Tan",
  accessibleSeniorIds: ["senior-1"],
};
const accessToken = "verified-access-token";

vi.mock("@/lib/persistence/caregiverCaseRepository", () => ({
  recordCaregiverQueueAction: recordCaregiverQueueActionMock,
}));

vi.mock("@/lib/auth/session", () => ({
  requireAuthenticatedCaregiver: requireAuthenticatedCaregiverMock,
  authJsonError: (result: { error: string; status: number }) =>
    Response.json({ error: result.error }, { status: result.status }),
}));

describe("/api/caregiver/queue-action", () => {
  beforeEach(() => {
    vi.resetModules();
    recordCaregiverQueueActionMock.mockReset();
    requireAuthenticatedCaregiverMock.mockReset();
    requireAuthenticatedCaregiverMock.mockResolvedValue({ ok: true, auth, accessToken });
    recordCaregiverQueueActionMock.mockResolvedValue({
      actorCaregiverId: "caregiver-1",
      persistence: { mode: "supabase", configured: true, persisted: true },
    });
  });

  it("requires an authenticated caregiver", async () => {
    requireAuthenticatedCaregiverMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/caregiver/queue-action", {
        method: "POST",
        body: JSON.stringify({
          queueItemId: "queue_1",
          actionType: "resolve",
        }),
      })
    );

    expect(response.status).toBe(401);
    expect(recordCaregiverQueueActionMock).not.toHaveBeenCalled();
  });

  it("persists caregiver actions", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/caregiver/queue-action", {
        method: "POST",
        body: JSON.stringify({
          queueItemId: "queue_1",
          actionType: "record_outcome",
          outcomeType: "needs_follow_up",
          note: "Daughter will call today.",
        }),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("ok");
    expect(recordCaregiverQueueActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken,
        queueItemId: "queue_1",
        actionType: "record_outcome",
        outcomeType: "needs_follow_up",
      })
    );
  });

  it("rejects invalid caregiver actions", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/caregiver/queue-action", {
        method: "POST",
        body: JSON.stringify({
          queueItemId: "queue_1",
          actionType: "delete_everything",
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(recordCaregiverQueueActionMock).not.toHaveBeenCalled();
  });
});
