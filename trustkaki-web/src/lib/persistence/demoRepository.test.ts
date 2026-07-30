import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("server-only", () => ({}));

const createTrustKakiUserClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createTrustKakiUserClient: createTrustKakiUserClientMock,
}));

describe("demo repository", () => {
  beforeEach(() => {
    vi.resetModules();
    createTrustKakiUserClientMock.mockReset();
  });

  it("resets demo state through one authenticated RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { senior_id: "demo-senior", status: "reset" },
      error: null,
    });
    createTrustKakiUserClientMock.mockReturnValue({ rpc });
    const { resetDemoPersistence } = await import("./demoRepository");

    const result = await resetDemoPersistence({ accessToken: "verified-token" });

    expect(rpc).toHaveBeenCalledWith("reset_trustkaki_demo");
    expect(result).toEqual({
      mode: "supabase",
      configured: true,
      persisted: true,
    });
  });

  it("fails safely when the reset RPC fails", async () => {
    createTrustKakiUserClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "Denied" } }),
    });
    const { resetDemoPersistence } = await import("./demoRepository");

    await expect(
      resetDemoPersistence({ accessToken: "verified-token" })
    ).rejects.toThrow("reset TrustKaki demo failed");
  });

  it("prepares the live demo through one authenticated transaction", async () => {
    const fixture = {
      senior_id: "00000000-0000-4000-8000-000000000001",
      check_in_id: "00000000-0000-4000-8000-000000000010",
      queue_item_id: "00000000-0000-4000-8000-000000000030",
      pattern_id: "00000000-0000-4000-8000-000000000020",
      queue_updated_at: "2026-07-30T06:00:00.000Z",
      prepared_at: "2026-07-30T06:00:00.000Z",
    };
    const rpc = vi.fn().mockResolvedValue({ data: fixture, error: null });
    createTrustKakiUserClientMock.mockReturnValue({ rpc });
    const { prepareLiveDemoPersistence } = await import("./demoRepository");

    await expect(
      prepareLiveDemoPersistence({ accessToken: "verified-token" })
    ).resolves.toMatchObject({
      fixture: {
        seniorId: fixture.senior_id,
        queueItemId: fixture.queue_item_id,
        patternId: fixture.pattern_id,
      },
      persistence: { persisted: true },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("prepare_trustkaki_live_demo");
  });

  it("binds Quick Demo senior upserts to the stable demo organisation", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/persistence/demoRepository.ts"),
      "utf8"
    );

    expect(source).toContain(
      'const DEMO_ORGANISATION_ID = "00000000-0000-4000-8000-000000000006"'
    );
    expect(source).toContain("organisation_id: DEMO_ORGANISATION_ID");
  });
});
