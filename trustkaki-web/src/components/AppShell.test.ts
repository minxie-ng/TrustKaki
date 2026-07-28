import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AppShell from "./AppShell";

describe("AppShell", () => {
  it("exposes one compact primary navigation at mobile and desktop sizes", () => {
    const html = renderToStaticMarkup(createElement(AppShell, {
      activeView: "workspace",
      isDemoAdmin: false,
      riskLevel: "green",
      onViewChange: () => undefined,
      onOpenSetup: () => undefined,
      onSignOut: () => undefined,
    }));
    const primaryNavigation = html.match(
      /<nav[^>]*aria-label="Primary"[^>]*>/
    )?.[0];

    expect(primaryNavigation).toBeDefined();
    expect(primaryNavigation).not.toContain("hidden");
    expect((html.match(/aria-label="Primary"/g) ?? [])).toHaveLength(1);
    expect((html.match(/>Care workspace</g) ?? [])).toHaveLength(1);
    expect((html.match(/>Activity</g) ?? [])).toHaveLength(1);
    expect((html.match(/>Care setup</g) ?? [])).toHaveLength(1);
  });

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

  it("shows guided demo entry only to an authorized demo administrator", () => {
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

    expect(html).toContain("Guided demo");
    expect(html).not.toContain("Demo tools");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Stable");
  });

  it("labels the active guided demo exit without adding another navigation item", () => {
    const html = renderToStaticMarkup(createElement(AppShell, {
      activeView: "workspace",
      isDemoAdmin: true,
      riskLevel: "yellow",
      demoMode: true,
      onViewChange: () => undefined,
      onOpenSetup: () => undefined,
      onDemoModeChange: () => undefined,
      onSignOut: () => undefined,
    }));

    expect(html).toContain("Exit guided demo");
    expect((html.match(/Exit guided demo/g) ?? [])).toHaveLength(1);
  });
});
