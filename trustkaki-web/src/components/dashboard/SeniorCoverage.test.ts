import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DashboardData, FollowUpQueueItem, SeniorListItem } from "@/lib/types";
import Dashboard from "../Dashboard";
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

function renderDashboard(): string {
  const selected = senior("senior-yellow", "Mr Tan Ah Hock", "yellow");
  const data = {
    selectedSeniorId: selected.id,
    seniors: [
      selected,
      senior("senior-green", "Mdm Lim Siew Lan", "green"),
    ],
    senior: {
      name: selected.name,
      age: selected.age ?? 78,
      gender: selected.gender,
      address: selected.address,
      livingSituation: selected.livingSituation ?? "Lives alone",
      caregiver: "Rachel Tan",
      aacVolunteer: "Mei Ling",
      riskLevel: selected.riskLevel,
      lastCheckIn: selected.lastCheckIn,
    },
    activeSessions: [],
    recentAlerts: [],
    followUpQueue: [item(selected.id, "yellow")],
  } satisfies DashboardData;

  return renderToStaticMarkup(createElement(Dashboard, {
    data,
    authToken: null,
  }));
}

describe("SeniorCoverage", () => {
  it("uses explicit mobile Queue People Context views and stable desktop regions", () => {
    const html = renderDashboard();

    expect(html).toContain('role="tablist"');
    expect(html).toContain(">Queue<");
    expect(html).toContain(">People<");
    expect(html).toContain(">Context<");
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("lg:grid-cols-[210px_minmax(0,1fr)]");
    expect(html).toContain("xl:grid-cols-[210px_minmax(0,1fr)_245px]");
    expect(html).toMatch(
      /id="care-workspace-queue-panel"[^>]*class="block [^"]*lg:block/
    );
    expect(html).toMatch(
      /id="care-workspace-people-panel"[^>]*class="hidden [^"]*lg:block/
    );
    expect(html).toMatch(
      /id="care-workspace-context-panel"[^>]*class="hidden [^"]*lg:block/
    );
    expect(html).toMatch(
      /id="care-workspace-queue-panel"[^>]*role="tabpanel"[^>]*aria-labelledby="care-workspace-queue-tab"/
    );
    expect(html).toMatch(
      /id="care-workspace-people-panel"[^>]*role="tabpanel"[^>]*aria-labelledby="care-workspace-people-tab"/
    );
    expect(html).toMatch(
      /id="care-workspace-context-panel"[^>]*role="tabpanel"[^>]*aria-labelledby="care-workspace-context-tab"/
    );
  });

  it("uses roving tabindex for the active mobile workspace tab", () => {
    const html = renderDashboard();

    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
  });

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
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('data-status-dot="true"');
    expect(html).toContain("Select Mr Tan");
    expect(html).not.toContain("ring-2");
    expect(html).not.toContain("shadow");
    expect(html).not.toContain("translate");
    expect(html).not.toContain("rounded-lg");
    expect(html).toContain("Monitoring");
    expect(html).not.toContain("years old");
    expect(html).not.toContain("active follow-up item");
  });

  it("renders useful coverage for one senior without a monitoring separator", () => {
    const html = renderToStaticMarkup(createElement(SeniorCoverage, {
      seniors: [senior("senior-red", "Mdm Siti Fatimah", "red")],
      queue: [item("senior-red", "red")],
      selectedSeniorId: "senior-red",
      disabled: false,
      onSelect: () => undefined,
    }));

    expect(html).toContain('aria-label="Senior priority coverage"');
    expect(html).toContain("Mdm Siti Fatimah");
    expect(html).toContain("Urgent");
    expect(html).toContain("1 senior");
    expect(html).toContain('data-status-dot="true"');
    expect(html).not.toContain("Monitoring");
  });
});
