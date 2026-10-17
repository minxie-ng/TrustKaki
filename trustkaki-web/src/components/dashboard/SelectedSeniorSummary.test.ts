import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DashboardData } from "@/lib/types";
import { SelectedSeniorSummary } from "./SelectedSeniorSummary";

const senior = {
  name: "Mr Tan Ah Hock",
  age: 76,
  gender: "Male",
  address: "Block 123 Toa Payoh Lorong 1, #08-456",
  livingSituation: "Lives alone in a HDB flat in Toa Payoh",
  caregiver: "Rachel Tan",
  caregiverRelationship: "daughter",
  aacVolunteer: "Mei Ling",
  riskLevel: "yellow",
  lastCheckIn: "2026-07-22T02:08:00.000Z",
} satisfies DashboardData["senior"];

describe("SelectedSeniorSummary", () => {
  it("shows unknown age without asserting zero years old", () => {
    const html = renderToStaticMarkup(createElement(SelectedSeniorSummary, { senior: { ...senior, age: 0 } }));
    expect(html).toContain("Age not recorded");
    expect(html).not.toContain("0 years old");
  });
  it("keeps identity and care metadata compact and unframed", () => {
    const html = renderToStaticMarkup(createElement(SelectedSeniorSummary, { senior }));

    expect(html).toContain("Mr Tan Ah Hock");
    expect(html).toContain("76 years old");
    expect(html).not.toContain("Primary caregiver");
    expect(html).not.toContain("Current risk");
    expect(html).not.toContain("Last response");
  });
});
