import { beforeEach, describe, expect, it, vi } from "vitest";

const resetDemoPersistenceMock = vi.fn();

vi.mock("@/lib/persistence/trustkakiRepository", () => ({
  resetDemoPersistence: resetDemoPersistenceMock,
}));

describe("/api/demo/reset", () => {
  beforeEach(() => {
    resetDemoPersistenceMock.mockReset();
  });

  it("resets persisted demo state", async () => {
    resetDemoPersistenceMock.mockResolvedValue({
      mode: "supabase",
      configured: true,
      persisted: true,
    });
    const { POST } = await import("./route");

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.persistence.persisted).toBe(true);
    expect(resetDemoPersistenceMock).toHaveBeenCalledTimes(1);
  });

  it("returns a safe error when reset fails", async () => {
    resetDemoPersistenceMock.mockRejectedValue(new Error("database secret detail"));
    const { POST } = await import("./route");

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe("Failed to reset demo data");
  });
});
