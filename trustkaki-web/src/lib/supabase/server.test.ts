import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const getSupabasePublicConfigMock = vi.fn();
const getSupabaseServerConfigMock = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));
vi.mock("./config", () => ({
  getSupabasePublicConfig: getSupabasePublicConfigMock,
  getSupabaseServerConfig: getSupabaseServerConfigMock,
}));

describe("Supabase server clients", () => {
  beforeEach(() => {
    vi.resetModules();
    createClientMock.mockReset();
    getSupabasePublicConfigMock.mockReset();
    getSupabaseServerConfigMock.mockReset();
  });

  it("creates a request-scoped user client with only public config and bearer token", async () => {
    getSupabasePublicConfigMock.mockReturnValue({
      url: "https://trustkaki.supabase.co",
      anonKey: "public-anon-key",
    });
    getSupabaseServerConfigMock.mockReturnValue({
      url: "https://trustkaki.supabase.co",
      anonKey: "public-anon-key",
      serviceRoleKey: "must-not-be-used",
    });
    const expectedClient = { rpc: vi.fn() };
    createClientMock.mockReturnValue(expectedClient);
    const { createTrustKakiUserClient } = await import("./server");

    expect(createTrustKakiUserClient("verified-token")).toBe(expectedClient);
    expect(createClientMock).toHaveBeenCalledWith(
      "https://trustkaki.supabase.co",
      "public-anon-key",
      {
        global: { headers: { Authorization: "Bearer verified-token" } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
    expect(JSON.stringify(createClientMock.mock.calls)).not.toContain(
      "must-not-be-used"
    );
  });
});
