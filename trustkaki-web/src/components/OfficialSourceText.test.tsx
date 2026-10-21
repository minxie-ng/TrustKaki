import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OfficialSourceText from "./OfficialSourceText";
import { matchActivities } from "@/lib/agents/activityMatching";

describe("official activity source links", () => {
  it("links official sources without swallowing surrounding punctuation", () => {
    const html = renderToStaticMarkup(createElement(OfficialSourceText, { text: "Source: https://www.onepa.gov.sg/events (checked today)." }));
    expect(html).toContain('href="https://www.onepa.gov.sg/events"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("(checked today).");
  });
  it("keeps deceptive hosts, credentials and script markup inert", () => {
    const html = renderToStaticMarkup(createElement(OfficialSourceText, { text: "https://www.onepa.gov.sg.evil.test/events https://a@www.onepa.gov.sg/events <script>alert(1)</script>" }));
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});


it("renders clickable sources from an actual Mandarin catalogue reply", () => {
  const reply = matchActivities({ area: "toa_payoh", format: "any", topics: [], earliestDate: null, latestDate: null,
    maxFeeSGD: null, requiredLanguage: null, wheelchairRequired: false, constraintsComplete: true },
    { age: 76, chinese: true, now: new Date("2026-10-21T15:00:00+08:00") });
  const html = renderToStaticMarkup(createElement(OfficialSourceText, { text: reply.text }));
  expect(html.match(/<a /g)).toHaveLength(2);
  expect(html).toContain('href="https://www.carecorner.org.sg/services/active-ageing/"');
  expect(html).toContain("（页面查阅：");
});
