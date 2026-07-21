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
    fromMock.mockImplementation(() => ({ select: selectMock }));
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
    process.env.TELEGRAM_BOT_TOKEN = "telegram-bot-private-value";
    process.env.TELEGRAM_WEBHOOK_SECRET = "telegram-webhook-private-value";
    process.env.TELEGRAM_INTERNAL_PROCESSOR_SECRET =
      "telegram-processor-private-value";
    process.env.CRON_SECRET = "cron-private-value";
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
      telegramConfigured: true,
      telegramProcessorConfigured: true,
      schedulerConfigured: true,
      whatsappConfigured: true,
      whatsappProcessorConfigured: true,
      internalProcessorConfigured: true,
    });
    expect(fromMock).toHaveBeenCalledWith("seniors");
    expect(fromMock).toHaveBeenCalledWith("whatsapp_webhook_events");
    expect(fromMock).toHaveBeenCalledWith("telegram_webhook_events");
    expect(fromMock).toHaveBeenCalledWith("proactive_check_in_schedules");
    expect(JSON.stringify(json)).not.toContain("secret");
    expect(JSON.stringify(json)).not.toContain("+6591234567");
    expect(JSON.stringify(json)).not.toContain("telegram-bot-private-value");
    expect(JSON.stringify(json)).not.toContain("telegram-webhook-private-value");
    expect(JSON.stringify(json)).not.toContain(
      "telegram-processor-private-value"
    );
    expect(JSON.stringify(json)).not.toContain("cron-private-value");
  });

  it("keeps core status healthy when optional transports and scheduling are not configured", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    delete process.env.META_APP_SECRET;
    delete process.env.TRUSTKAKI_DEMO_SENIOR_PHONE;
    delete process.env.WHATSAPP_INTERNAL_PROCESSOR_SECRET;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_INTERNAL_PROCESSOR_SECRET;
    delete process.env.CRON_SECRET;
    const { GET } = await import("./route");

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("ok");
    expect(json.checks.telegramConfigured).toBe(false);
    expect(json.checks.telegramProcessorConfigured).toBe(false);
    expect(json.checks.schedulerConfigured).toBe(false);
    expect(json.checks.whatsappConfigured).toBe(false);
    expect(json.checks.whatsappProcessorConfigured).toBe(false);
    expect(json.checks.internalProcessorConfigured).toBe(false);
  });

  it.each(["telegram_webhook_events", "proactive_check_in_schedules"])(
    "returns degraded when required table %s is unreachable",
    async (unreachableTable) => {
      fromMock.mockImplementation((table: string) => ({
        select: vi.fn().mockResolvedValue({
          error: table === unreachableTable ? { message: "unreachable" } : null,
        }),
      }));
      const { GET } = await import("./route");

      const response = await GET();
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.status).toBe("degraded");
      expect(json.checks.database).toBe(false);
      expect(fromMock).toHaveBeenCalledWith(unreachableTable);
      expect(JSON.stringify(json)).not.toContain("unreachable");
    }
  );

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
