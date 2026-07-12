import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const selectMock = vi.fn();
const fromMock = vi.fn(() => ({ select: selectMock }));
const createTrustKakiServiceClientMock = vi.fn(() => ({ from: fromMock }));

vi.mock("@/lib/supabase/server", () => ({
  createTrustKakiServiceClient: createTrustKakiServiceClientMock,
}));

const originalEnv = { ...process.env };

describe("/api/health", () => {
  beforeEach(() => {
    vi.resetModules();
    selectMock.mockReset();
    fromMock.mockClear();
    createTrustKakiServiceClientMock.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://trustkaki.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret";
    process.env.TRUSTKAKI_LLM_API_KEY = "llm-secret";
    process.env.TRUSTKAKI_LLM_BASE_URL = "https://api.openai.com/v1";
    process.env.TRUSTKAKI_LLM_MODEL = "gpt-4o-mini";
    process.env.WHATSAPP_ACCESS_TOKEN = "whatsapp-secret";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-number-id";
    process.env.WHATSAPP_VERIFY_TOKEN = "verify-secret";
    process.env.META_APP_SECRET = "meta-secret";
    process.env.TRUSTKAKI_DEMO_SENIOR_PHONE = "+6591234567";
    process.env.WHATSAPP_INTERNAL_PROCESSOR_SECRET = "processor-secret";
    selectMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns a sanitized ok status when required config and tables are reachable", async () => {
    const { GET, runtime } = await import("./route");

    const response = await GET();
    const json = await response.json();

    expect(runtime).toBe("nodejs");
    expect(response.status).toBe(200);
    expect(json.status).toBe("ok");
    expect(json.checks).toMatchObject({
      app: true,
      supabasePublicConfigured: true,
      supabaseServiceConfigured: true,
      database: true,
      llmConfigured: true,
      whatsappConfigured: true,
      internalProcessorConfigured: true,
    });
    expect(fromMock).toHaveBeenCalledWith("seniors");
    expect(fromMock).toHaveBeenCalledWith("whatsapp_webhook_events");
    expect(JSON.stringify(json)).not.toContain("secret");
    expect(JSON.stringify(json)).not.toContain("+6591234567");
  });

  it("returns degraded without exposing Supabase errors or secret names", async () => {
    selectMock.mockResolvedValueOnce({
      error: { message: "permission denied for SUPABASE_SERVICE_ROLE_KEY" },
    });
    const { GET } = await import("./route");

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.status).toBe("degraded");
    expect(json.checks.database).toBe(false);
    expect(JSON.stringify(json)).not.toContain("permission denied");
    expect(JSON.stringify(json)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
