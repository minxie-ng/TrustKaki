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
    expect((html.match(/>Activity</g) ?? [])).toHaveLength(0);
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
    expect(html).not.toContain(">Activity<");
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

    expect(html).toContain("Live system demo");
    expect(html).not.toContain("Demo tools");
    expect(html).not.toContain('aria-current="page"');
    expect(html).toContain("Stable");
  });

  it.each(["orientation", "prepare", "complete"] as const)(
    "suppresses workflow navigation while the guided demo is %s",
    (guidedDemoPhase) => {
      const html = renderToStaticMarkup(createElement(
        AppShell,
        {
          activeView: "workspace",
          isDemoAdmin: true,
          riskLevel: "yellow",
          demoMode: true,
          guidedDemoPhase,
          onViewChange: () => undefined,
          onOpenSetup: () => undefined,
          onDemoModeChange: () => undefined,
          onSignOut: () => undefined,
        },
        createElement("div", null, "Start guided demo")
      ));

      expect(html).not.toContain('aria-label="Primary"');
      expect(html).not.toContain("Care workspace");
      expect(html).not.toContain("Activity");
      expect(html).not.toContain("Care setup");
      expect(html).not.toContain("Exit guided demo");
      expect(html).toContain("Start guided demo");
    }
  );

  it("keeps the authenticated identity shell while workflow navigation is suppressed", () => {
    const html = renderToStaticMarkup(createElement(AppShell, {
      activeView: "workspace",
      isDemoAdmin: true,
      riskLevel: "yellow",
      demoMode: true,
      guidedDemoPhase: "respond",
      onViewChange: () => undefined,
      onOpenSetup: () => undefined,
      onDemoModeChange: () => undefined,
      onSignOut: () => undefined,
    }));

    expect(html).toContain("TrustKaki");
    expect(html).toContain("Sign out");
    expect(html).not.toContain('aria-label="Primary"');
  });
});
