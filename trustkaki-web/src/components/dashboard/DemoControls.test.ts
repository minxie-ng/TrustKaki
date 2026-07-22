import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DemoControls, runGuidedDemoSequence } from "./DemoControls";

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

  it("resets stale state before building the quick demo case", async () => {
    const requests: string[] = [];
    const post = vi.fn(async (endpoint: string) => {
      requests.push(endpoint);
      return new Response(null, { status: 200 });
    });

    await runGuidedDemoSequence(post);

    expect(requests).toEqual([
      "/api/demo/reset",
      "/api/demo/pattern-watch/quick",
    ]);
  });

  it("does not build a case when reset fails", async () => {
    const post = vi.fn(async () => new Response(null, { status: 500 }));

    await expect(runGuidedDemoSequence(post)).rejects.toMatchObject({ status: 500 });
    expect(post).toHaveBeenCalledTimes(1);
  });
});
