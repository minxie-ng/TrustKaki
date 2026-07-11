import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyMetaSignature(args: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret?: string;
}): "valid" | "invalid" | "pending" {
  if (!args.appSecret) return "pending";
  if (!args.signatureHeader?.startsWith("sha256=")) return "invalid";

  const expected = `sha256=${createHmac("sha256", args.appSecret)
    .update(args.rawBody)
    .digest("hex")}`;

  const received = Buffer.from(args.signatureHeader);
  const expectedBuffer = Buffer.from(expected);
  if (received.length !== expectedBuffer.length) return "invalid";

  return timingSafeEqual(received, expectedBuffer) ? "valid" : "invalid";
}
