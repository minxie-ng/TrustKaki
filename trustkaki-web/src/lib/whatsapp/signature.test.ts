import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMetaSignature } from "./signature";

describe("Meta signature verification", () => {
  it("marks signature verification pending when app secret is absent", () => {
    expect(
      verifyMetaSignature({
        rawBody: "{}",
        signatureHeader: null,
      })
    ).toBe("pending");
  });

  it("validates x-hub-signature-256", () => {
    const rawBody = JSON.stringify({ entry: [] });
    const signature = `sha256=${createHmac("sha256", "app_secret")
      .update(rawBody)
      .digest("hex")}`;

    expect(
      verifyMetaSignature({
        rawBody,
        signatureHeader: signature,
        appSecret: "app_secret",
      })
    ).toBe("valid");
    expect(
      verifyMetaSignature({
        rawBody,
        signatureHeader: "sha256=wrong",
        appSecret: "app_secret",
      })
    ).toBe("invalid");
  });
});
