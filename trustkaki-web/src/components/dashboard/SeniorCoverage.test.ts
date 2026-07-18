import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FollowUpQueueItem, SeniorListItem } from "@/lib/types";
import { SeniorCoverage } from "./SeniorCoverage";

function senior(id: string, name: string, riskLevel: SeniorListItem["riskLevel"]): SeniorListItem {
  return {
    id,
    name,
    age: 78,
    gender: "Female",
    address: null,
    livingSituation: null,
    riskLevel,
    lastCheckIn: "2026-07-18T03:00:00.000Z",
    followUpCount: 1,
    primaryCaregiver: null,
    aacVolunteer: null,
  };
}

function item(seniorId: string, riskLevel: FollowUpQueueItem["riskLevel"], status: FollowUpQueueItem["status"] = "pending"): FollowUpQueueItem {
  return {
    id: `queue-${seniorId}`,
    seniorId,
    seniorName: seniorId,
    riskLevel,
    headline: "Needs a short follow-up today",
    reason: "A longer internal reason should not expand this compact rail.",
    changeFromUsual: "Different from the usual routine.",
    lastResponseAt: "2026-07-18T01:00:00.000Z",
    recommendedAction: "Check in today.",
    status,
    assignedTo: null,
    lastUpdatedAt: "2026-07-18T02:00:00.000Z",
    priority: 1,
    pattern: null,
    relatedPatterns: [],
  };
}

describe("SeniorCoverage", () => {
  it("renders ranked, compact, accessible coverage navigation", () => {
    const html = renderToStaticMarkup(createElement(SeniorCoverage, {
      seniors: [
        senior("senior-yellow", "Mr Tan Ah Hock", "yellow"),
        senior("senior-red", "Mdm Siti Fatimah", "red"),
        senior("senior-green", "Mdm Lim Siew Lan", "green"),
      ],
      queue: [item("senior-red", "red"), item("senior-yellow", "yellow")],
      selectedSeniorId: "senior-yellow",
      disabled: false,
      onSelect: () => undefined,
    }));

    expect(html.indexOf("Mdm Siti")).toBeLessThan(html.indexOf("Mr Tan"));
    expect(html).toContain("Urgent");
    expect(html).toContain("Today");
    expect(html).toContain("Stable");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Select Mr Tan");
    expect(html).toContain("Monitoring");
    expect(html).not.toContain("years old");
    expect(html).not.toContain("active follow-up item");
  });

  it("does not render the monitoring separator when every senior has active work", () => {
    const html = renderToStaticMarkup(createElement(SeniorCoverage, {
      seniors: [senior("senior-red", "Mdm Siti Fatimah", "red")],
      queue: [item("senior-red", "red")],
      selectedSeniorId: "senior-red",
      disabled: false,
      onSelect: () => undefined,
    }));

    expect(html).not.toContain("Monitoring");
  });
});
