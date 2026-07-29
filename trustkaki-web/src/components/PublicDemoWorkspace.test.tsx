import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PublicDemoWorkspace from "./PublicDemoWorkspace";
import SignInForm from "./SignInForm";

describe("public demo entry", () => {
  it("keeps sign-in primary and exposes a separate fictional demo action", () => {
    const html = renderToStaticMarkup(createElement(SignInForm, {
      onSignIn: async () => undefined,
      onExploreDemo: () => undefined,
    }));

    expect(html).toContain("Sign in");
    expect(html).toContain("Explore demo");
    expect(html).toContain("Uses fictional data. No messages are sent.");
  });

  it("labels the isolated workspace and excludes authenticated-only controls", () => {
    const html = renderToStaticMarkup(createElement(PublicDemoWorkspace, {
      onExit: () => undefined,
    }));

    expect(html).toContain("Demo data");
    expect(html).toContain("Reset demo");
    expect(html).toContain("Start guided demo");
    expect(html).not.toContain("Care setup");
    expect(html).not.toContain("Sign out");
  });
});
