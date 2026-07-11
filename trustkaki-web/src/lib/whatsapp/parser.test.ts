import { describe, expect, it } from "vitest";
import {
  buildMetaStatusWebhookFixture,
  buildMetaTextWebhookFixture,
  parseInboundTextMessages,
  parseWhatsAppWebhookEvents,
} from "./parser";

describe("WhatsApp webhook parser", () => {
  it("parses valid inbound text payloads", () => {
    const payload = buildMetaTextWebhookFixture({
      messageId: "wamid.test",
      from: "+65 8123 4567",
      phoneNumberId: "phone_id",
      text: "Not hungry today. Knee pain.",
      timestamp: "1783766400",
    });

    expect(parseInboundTextMessages(payload)).toEqual([
      {
        id: "wamid.test",
        from: "6581234567",
        phoneNumberId: "phone_id",
        text: "Not hungry today. Knee pain.",
        timestamp: new Date(1783766400 * 1000).toISOString(),
      },
    ]);
  });

  it("ignores unsupported events", () => {
    expect(parseInboundTextMessages({ entry: [{ changes: [{ value: {} }] }] })).toEqual([]);
  });

  it("parses status events without producing inbound text messages", () => {
    const payload = buildMetaStatusWebhookFixture({
      messageId: "wamid.outbound",
      recipientId: "+65 8123 4567",
      phoneNumberId: "phone_id",
      status: "delivered",
      timestamp: "1783766400",
    });

    expect(parseInboundTextMessages(payload)).toEqual([]);
    expect(parseWhatsAppWebhookEvents(payload)).toEqual([
      expect.objectContaining({
        eventType: "status_delivered",
        relatedWhatsAppMessageId: "wamid.outbound",
        senderPhoneE164: "6581234567",
        phoneNumberId: "phone_id",
        status: "delivered",
      }),
    ]);
  });
});
