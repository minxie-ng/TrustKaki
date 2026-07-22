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
  it("keeps identity and care metadata in separate full-width rows", () => {
    const html = renderToStaticMarkup(createElement(SelectedSeniorSummary, { senior }));

    expect(html).toContain("sm:grid-cols-4");
    expect(html).not.toContain("lg:flex-row");
    expect(html).toContain("Rachel Tan (daughter)");
  });
});
