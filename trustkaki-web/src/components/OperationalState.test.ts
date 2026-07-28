import {
  Children,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OperationalState from "./OperationalState";

describe("OperationalState", () => {
  it("keeps the content wrapper at the same tree position when refresh errors toggle", () => {
    const dashboard = createElement("div", { "data-dashboard-state": "retained" });
    const ready = OperationalState({
      kind: "ready",
      message: "",
      children: dashboard,
    });
    const failed = OperationalState({
      kind: "refresh-error",
      message: "Could not refresh.",
      actionLabel: "Retry",
      onAction: () => undefined,
      children: dashboard,
    });

    expect(isValidElement(ready)).toBe(true);
    expect(isValidElement(failed)).toBe(true);
    if (!isValidElement(ready) || !isValidElement(failed)) return;

    const readyTree = ready as ReactElement<{ children?: ReactNode }>;
    const failedTree = failed as ReactElement<{ children?: ReactNode }>;
    const readyChildren = Children.toArray(readyTree.props.children);
    const failedChildren = Children.toArray(failedTree.props.children);
    expect(ready.type).toBe(failed.type);
    expect(readyChildren).toHaveLength(failedChildren.length);
    expect(isValidElement(readyChildren[1])).toBe(true);
    expect(isValidElement(failedChildren[1])).toBe(true);
    if (!isValidElement(readyChildren[1]) || !isValidElement(failedChildren[1])) {
      return;
    }
    expect(readyChildren[1].type).toBe(failedChildren[1].type);
    expect(
      (readyChildren[1] as ReactElement<{ children?: ReactNode }>).props.children
    ).toBe(dashboard);
    expect(
      (failedChildren[1] as ReactElement<{ children?: ReactNode }>).props.children
    ).toBe(dashboard);
  });

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
