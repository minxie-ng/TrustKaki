import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PublicDemoWorkspace from "./PublicDemoWorkspace";
import SignInForm from "./SignInForm";

describe("public demo entry", () => {
  it("makes the no-login judge path explicit and explains live backend access", () => {
    const html = renderToStaticMarkup(createElement(SignInForm, {
      onSignIn: async () => undefined,
      onExploreDemo: () => undefined,
    }));

    expect(html).toContain("Recommended for reviewers");
    expect(html).toContain("Explore demo - no login");
    expect(html).toContain("Live backend access");
    expect(html).toContain("temporary judge credentials from the submitted deck");
    expect(html).toContain("After signing in, choose");
    expect(html).toContain("Live system demo");
    expect(html).toContain("Sign in to live system");
    expect(html).toContain("no messages are sent");
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
