import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("WhatsApp client", () => {
  it("builds the outbound text request body correctly", async () => {
    const { buildWhatsAppTextRequest } = await import("./client");
    const request = buildWhatsAppTextRequest(
      {
        accessToken: "secret_token",
        phoneNumberId: "phone_123",
        graphApiVersion: "v23.0",
      },
      {
        to: "6581234567",
        text: "Please don't click that link. Ask Rachel first.",
      }
    );

    expect(request.url).toBe("https://graph.facebook.com/v23.0/phone_123/messages");
    expect(request.body).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "6581234567",
      type: "text",
      text: {
        preview_url: false,
        body: "Please don't click that link. Ask Rachel first.",
      },
    });
    expect(request.init.headers).toMatchObject({
      Authorization: "Bearer secret_token",
      "Content-Type": "application/json",
    });
  });
});
