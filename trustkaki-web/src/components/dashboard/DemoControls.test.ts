import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemoControls } from "./DemoControls";

describe("DemoControls", () => {
  it("gives judges one clear starting action", () => {
    const html = renderToStaticMarkup(createElement(DemoControls, {
      authToken: "test-token",
      visible: true,
      onRefresh: () => undefined,
      onUnauthorized: () => undefined,
    }));

    expect(html).toContain("Begin here");
    expect(html).toContain("Start guided demo");
    expect(html).not.toContain("1. Reset demo");
  });
});
