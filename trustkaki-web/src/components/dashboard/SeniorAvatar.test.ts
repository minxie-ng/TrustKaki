import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeniorAvatar, shouldShowAvatarFallback } from "./SeniorAvatar";

describe("SeniorAvatar", () => {
  it("renders a fixed decorative portrait with an initials fallback", () => {
    const html = renderToStaticMarkup(createElement(SeniorAvatar, {
      name: "Mr Tan Ah Hock",
      src: "/seniors/mr-tan-ah-hock.webp",
      size: "md",
    }));
    expect(html).toContain('alt=""');
    expect(html).toContain("TH");
    expect(html).toContain("aspect-square");
  });

  it("shows initials when no source exists or image loading fails", () => {
    expect(shouldShowAvatarFallback(null, false)).toBe(true);
    expect(shouldShowAvatarFallback("/portrait.webp", false)).toBe(false);
    expect(shouldShowAvatarFallback("/portrait.webp", true)).toBe(true);
  });
});
