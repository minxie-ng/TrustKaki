import { describe, expect, it } from "vitest";
import { parseTelegramInboundText } from "./parser";

function privateTextUpdate() {
  return {
    update_id: 910000001,
    message: {
      message_id: 73,
      date: 1784102400,
      from: {
        id: 8123456789,
        is_bot: false,
        first_name: "Ah Hock",
      },
      chat: {
        id: 8123456789,
        type: "private",
      },
      text: "Not hungry today. Knee pain.",
    },
  };
}

describe("Telegram inbound parser", () => {
  it("extracts a realistic private-chat text update", () => {
    expect(parseTelegramInboundText(privateTextUpdate())).toEqual({
      updateId: "910000001",
      messageId: "73",
      senderUserId: "8123456789",
      chatId: "8123456789",
      timestamp: new Date(1784102400 * 1000).toISOString(),
      text: "Not hungry today. Knee pain.",
    });
  });

  it.each([
    ["edited message", { update_id: 1, edited_message: privateTextUpdate().message }],
    [
      "bot sender",
      {
        ...privateTextUpdate(),
        message: { ...privateTextUpdate().message, from: { id: 1, is_bot: true } },
      },
    ],
    [
      "non-text message",
      {
        ...privateTextUpdate(),
        message: { ...privateTextUpdate().message, text: undefined, photo: [{}] },
      },
    ],
    [
      "group message",
      {
        ...privateTextUpdate(),
        message: {
          ...privateTextUpdate().message,
          chat: { id: -100123, type: "group" },
        },
      },
    ],
    [
      "channel message",
      {
        ...privateTextUpdate(),
        message: {
          ...privateTextUpdate().message,
          chat: { id: -100456, type: "channel" },
        },
      },
    ],
    ["malformed payload", { update_id: "not-a-number", message: {} }],
  ])("ignores %s safely", (_name, payload) => {
    expect(parseTelegramInboundText(payload)).toBeNull();
  });
});
