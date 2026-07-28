import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusIndicator } from "./StatusIndicator";

describe("StatusIndicator", () => {
  it("renders an 8px flat dot and visible text without badge fill", () => {
    const html = renderToStaticMarkup(
      createElement(StatusIndicator, { tone: "attention", label: "Needs attention" })
    );
    expect(html).toContain("Needs attention");
    expect(html).toContain('data-status-dot="true"');
    expect(html).toContain("h-2 w-2");
    expect(html).not.toMatch(/rounded-full[^"]*(bg-.*50|px-2|px-3)/);
  });

  it.each([
    ["stable", "bg-[var(--status-green)]"],
    ["attention", "bg-[var(--status-amber)]"],
    ["urgent", "bg-[var(--status-red)]"],
    ["neutral", "bg-[var(--care-hairline)]"],
  ] as const)("renders the %s tone with a decorative dot", (tone, dotClass) => {
    const html = renderToStaticMarkup(
      createElement(StatusIndicator, { tone, label: `${tone} status` })
    );

    expect(html).toContain(`${tone} status`);
    expect(html).toContain(dotClass);
    expect(html).toContain('aria-hidden="true"');
  });
});
