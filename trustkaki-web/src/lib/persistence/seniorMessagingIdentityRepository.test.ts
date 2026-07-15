import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createTrustKakiServiceClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createTrustKakiServiceClient: createTrustKakiServiceClientMock,
}));

function identityClient(
  data: { senior_id?: string; external_chat_id?: string | null } | null
) {
  const filters: Array<[string, unknown]> = [];
  const notFilters: Array<[string, string, unknown]> = [];
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push([column, value]);
      return builder;
    }),
    not: vi.fn((column: string, operator: string, value: unknown) => {
      notFilters.push([column, operator, value]);
      return builder;
    }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  const from = vi.fn(() => builder);
  return { client: { from }, from, filters, notFilters };
}

describe("seniorMessagingIdentityRepository", () => {
  beforeEach(() => {
    vi.resetModules();
    createTrustKakiServiceClientMock.mockReset();
  });

  it("resolves an active verified Telegram identity to one senior", async () => {
    const service = identityClient({ senior_id: "senior-1" });
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { findSeniorIdByMessagingIdentity } = await import(
      "./seniorMessagingIdentityRepository"
    );

    await expect(
      findSeniorIdByMessagingIdentity({
        platform: "telegram",
        externalUserId: "user-123",
        externalChatId: "chat-123",
      })
    ).resolves.toBe("senior-1");

    expect(service.from).toHaveBeenCalledWith("senior_messaging_identities");
    expect(service.filters).toEqual([
      ["platform", "telegram"],
      ["external_user_id", "user-123"],
      ["external_chat_id", "chat-123"],
      ["is_active", true],
    ]);
    expect(service.notFilters).toContainEqual(["verified_at", "is", null]);
  });

  it("returns null for an unknown or inactive identity without fallback", async () => {
    const service = identityClient(null);
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { findSeniorIdByMessagingIdentity } = await import(
      "./seniorMessagingIdentityRepository"
    );

    await expect(
      findSeniorIdByMessagingIdentity({
        platform: "telegram",
        externalUserId: "unknown-user",
        externalChatId: "unknown-chat",
      })
    ).resolves.toBeNull();
  });

  it("does not query Supabase for blank external identifiers", async () => {
    const { findSeniorIdByMessagingIdentity } = await import(
      "./seniorMessagingIdentityRepository"
    );

    await expect(
      findSeniorIdByMessagingIdentity({
        platform: "telegram",
        externalUserId: "   ",
        externalChatId: "chat-123",
      })
    ).resolves.toBeNull();
    expect(createTrustKakiServiceClientMock).not.toHaveBeenCalled();
  });

  it("returns the verified active Telegram chat for an outbound senior message", async () => {
    const service = identityClient({ external_chat_id: "chat-456" });
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { findTelegramChatIdForSenior } = await import(
      "./seniorMessagingIdentityRepository"
    );

    await expect(findTelegramChatIdForSenior("senior-1")).resolves.toBe(
      "chat-456"
    );
    expect(service.filters).toEqual([
      ["senior_id", "senior-1"],
      ["platform", "telegram"],
      ["is_active", true],
    ]);
    expect(service.notFilters).toEqual([
      ["verified_at", "is", null],
      ["external_chat_id", "is", null],
    ]);
  });
});
