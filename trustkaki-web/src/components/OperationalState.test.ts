import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OperationalState from "./OperationalState";

describe("OperationalState", () => {
  it("reserves the care workspace grid while loading", () => {
    const html = renderToStaticMarkup(createElement(OperationalState, {
      kind: "loading",
      message: "Loading your seniors...",
    }));

    expect(html).toContain("Loading your seniors...");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-workspace-grid="true"');
  });

  it("keeps the last view visible during refresh failure and offers retry", () => {
    const html = renderToStaticMarkup(createElement(OperationalState, {
      kind: "refresh-error",
      message: "Could not refresh.",
      actionLabel: "Retry",
      onAction: () => undefined,
    }, createElement("div", null, "Existing queue")));

    expect(html).toContain("Existing queue");
    expect(html).toContain("Retry");
    expect(html).toContain('role="alert"');
  });

  it("uses a bounded polite live region for success feedback", () => {
    const html = renderToStaticMarkup(createElement(OperationalState, {
      kind: "success",
      message: "Follow-up saved.",
    }, createElement("div", null, "Current case")));

    expect(html).toContain("Current case");
    expect(html).toContain("Follow-up saved.");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
  });
});
