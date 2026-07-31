import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    );

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first: string, second: string): number {
  const luminances = [relativeLuminance(first), relativeLuminance(second)].sort(
    (left, right) => right - left
  );
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

describe("accessible visual tokens", () => {
  it("keeps care coral readable against white button and page surfaces", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const coral = css.match(/--care-coral:\s*(#[0-9a-f]{6})/i)?.[1];

    expect(coral).toBeDefined();
    expect(contrastRatio(coral!, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});
