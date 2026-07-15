import { describe, expect, it } from "vitest";
import { verifyTelegramWebhookSecret } from "./webhookAuth";

describe("Telegram webhook authentication", () => {
  it("accepts an exact secret match", () => {
    expect(
      verifyTelegramWebhookSecret({
        configuredSecret: "server_webhook_secret",
        headerValue: "server_webhook_secret",
      })
    ).toBe(true);
  });

  it.each([
    ["missing configuration", undefined, "server_webhook_secret"],
    ["missing header", "server_webhook_secret", null],
    ["wrong header", "server_webhook_secret", "wrong_secret"],
  ])("fails closed for %s", (_name, configuredSecret, headerValue) => {
    expect(
      verifyTelegramWebhookSecret({ configuredSecret, headerValue })
    ).toBe(false);
  });

  it("does not expose either secret when comparison fails", () => {
    const configuredSecret = "configured_private_value";
    const headerValue = "received_private_value";

    expect(() =>
      verifyTelegramWebhookSecret({ configuredSecret, headerValue })
    ).not.toThrow();
    expect(
      verifyTelegramWebhookSecret({ configuredSecret, headerValue })
    ).toBe(false);
  });
});
