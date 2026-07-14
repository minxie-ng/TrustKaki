import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DataDeletionPage from "./data-deletion/page";
import PrivacyPage from "./privacy/page";

describe("public legal pages", () => {
  it("publishes a substantive privacy policy without requiring application state", () => {
    const html = renderToStaticMarkup(PrivacyPage());

    expect(html).toContain("TrustKaki Privacy Policy");
    expect(html).toContain("WhatsApp");
    expect(html).toContain("AI-assisted");
    expect(html).toContain("does not provide emergency response");
    expect(html).toContain('href="/data-deletion"');
  });

  it("publishes clear data deletion instructions", () => {
    const html = renderToStaticMarkup(DataDeletionPage());

    expect(html).toContain("Request access or deletion");
    expect(html).toContain("identity and authority");
    expect(html).toContain("participating care organisation");
    expect(html).toContain('href="/privacy"');
  });
});
