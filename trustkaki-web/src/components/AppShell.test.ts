import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AppShell from "./AppShell";

describe("AppShell", () => {
  it("hides demo tools from a normal caregiver", () => {
    const html = renderToStaticMarkup(createElement(
      AppShell,
      {
        activeView: "workspace",
        isDemoAdmin: false,
        riskLevel: "yellow",
        onViewChange: () => undefined,
        onOpenSetup: () => undefined,
        onSignOut: () => undefined,
      },
      createElement("div", null, "Workspace")
    ));

    expect(html).toContain("Care workspace");
    expect(html).toContain("Activity");
    expect(html).toContain("Care setup");
    expect(html).not.toContain("Demo tools");
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain("Needs attention");
  });

  it("shows demo tools only to an authorized demo administrator", () => {
    const html = renderToStaticMarkup(createElement(
      AppShell,
      {
        activeView: "activity",
        isDemoAdmin: true,
        riskLevel: "green",
        demoMode: false,
        onViewChange: () => undefined,
        onOpenSetup: () => undefined,
        onDemoModeChange: () => undefined,
        onSignOut: () => undefined,
      },
      createElement("div", null, "Activity view")
    ));

    expect(html).toContain("Demo tools");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Stable");
  });
});
