import { beforeEach, describe, expect, it, vi } from "vitest";

const recordCaregiverQueueActionMock = vi.fn();

vi.mock("@/lib/persistence/trustkakiRepository", () => ({
  recordCaregiverQueueAction: recordCaregiverQueueActionMock,
}));

describe("/api/caregiver/queue-action", () => {
  beforeEach(() => {
    recordCaregiverQueueActionMock.mockReset();
    recordCaregiverQueueActionMock.mockResolvedValue({
      mode: "supabase",
      configured: true,
      persisted: true,
    });
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
