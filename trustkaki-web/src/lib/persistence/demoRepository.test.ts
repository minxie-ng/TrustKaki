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
