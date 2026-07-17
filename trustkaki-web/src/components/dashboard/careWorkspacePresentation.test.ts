import { describe, expect, it } from "vitest";
import type { FollowUpQueueItem, SeniorListItem } from "@/lib/types";
import {
  buildSeniorCoverage,
  compactCoverageReason,
  initialsForSenior,
  portraitForSenior,
} from "./careWorkspacePresentation";

function senior(
  id: string,
  name: string,
  riskLevel: SeniorListItem["riskLevel"],
  lastCheckIn: string | null
): SeniorListItem {
  return {
    id,
    name,
    riskLevel,
    lastCheckIn,
    followUpCount: 0,
    primaryCaregiver: null,
    aacVolunteer: null,
  };
}

function queueItem(args: {
  seniorId: string;
  priority: number;
  status?: FollowUpQueueItem["status"];
  riskLevel?: FollowUpQueueItem["riskLevel"];
}): FollowUpQueueItem {
  return {
    id: `queue-${args.seniorId}-${args.priority}`,
    seniorId: args.seniorId,
    seniorName: args.seniorId,
    riskLevel: args.riskLevel ?? "yellow",
    headline: "Appetite and mobility changed together",
    reason: "Two connected changes need follow-up.",
    changeFromUsual: "Different from the usual routine.",
    lastResponseAt: "2026-07-18T01:00:00.000Z",
    recommendedAction: "Check in today.",
    status: args.status ?? "pending",
    assignedTo: null,
    lastUpdatedAt: "2026-07-18T02:00:00.000Z",
    priority: args.priority,
    pattern: null,
    relatedPatterns: [],
  };
}

const seniors = [
  senior("green-stable", "Mdm Lim Siew Lan", "green", "2026-07-18T03:00:00.000Z"),
  senior("yellow-monitoring", "Mr Ahmad", "yellow", "2026-07-17T03:00:00.000Z"),
  senior("red-active", "Mdm Siti Fatimah", "red", "2026-07-16T03:00:00.000Z"),
  senior("yellow-active", "Mr Tan Ah Hock", "yellow", "2026-07-15T03:00:00.000Z"),
];

const yellowPriorityZero = queueItem({ seniorId: "yellow-active", priority: 0 });
const redPriorityTen = queueItem({ seniorId: "red-active", priority: 10, riskLevel: "red" });
const redEscalated = queueItem({ seniorId: "red-active", priority: 0, status: "escalated", riskLevel: "red" });
const yellowPending = queueItem({ seniorId: "yellow-active", priority: 10 });

describe("care workspace presentation", () => {
  it("orders active work by queue priority before policy risk", () => {
    const view = buildSeniorCoverage(seniors, [yellowPriorityZero, redPriorityTen]);
    expect(view.map((item) => item.senior.id)).toEqual([
      "yellow-active",
      "red-active",
      "yellow-monitoring",
      "green-stable",
    ]);
  });

  it("uses explicit urgency independent of color", () => {
    const view = buildSeniorCoverage(seniors, [redEscalated, yellowPending]);
    expect(view.find((item) => item.senior.id === "red-active")?.urgency).toBe("urgent");
    expect(view.find((item) => item.senior.id === "yellow-active")?.urgency).toBe("today");
    expect(view.find((item) => item.senior.id === "yellow-monitoring")?.urgency).toBe("monitoring");
    expect(view.find((item) => item.senior.id === "green-stable")?.urgency).toBe("stable");
  });

  it("maps only fictional demo names to local portraits", () => {
    expect(portraitForSenior("Mr Tan Ah Hock")).toBe("/seniors/mr-tan-ah-hock.webp");
    expect(portraitForSenior("Mdm Lim Siew Lan")).toBe("/seniors/mdm-lim-siew-lan.webp");
    expect(portraitForSenior("Mdm Siti Fatimah Binte Rahman")).toBe("/seniors/mdm-siti-fatimah.webp");
    expect(portraitForSenior("New Senior")).toBeNull();
  });

  it("creates bounded fallback content without changing source text", () => {
    const reason = "A long source reason that must remain unchanged outside this display helper";
    const compact = compactCoverageReason(reason, 32);
    expect(compact).toHaveLength(32);
    expect(compact.endsWith("...")).toBe(true);
    expect(reason).toContain("must remain unchanged");
    expect(initialsForSenior("Mdm Lim Siew Lan")).toBe("LS");
    expect(initialsForSenior(" ")).toBe("TK");
  });

  it("does not treat a resolved item as active work", () => {
    const resolved = queueItem({ seniorId: "red-active", priority: 0, status: "resolved", riskLevel: "red" });
    const view = buildSeniorCoverage(seniors, [resolved]);
    expect(view.find((item) => item.senior.id === "red-active")).toMatchObject({
      urgency: "monitoring",
      activeItem: null,
    });
  });

  it("uses risk before recency and recency before the stable name tie-break", () => {
    const view = buildSeniorCoverage(
      [
        senior("yellow-new", "Zoe", "yellow", "2026-07-18T03:00:00.000Z"),
        senior("red-old", "Amy", "red", "2026-07-17T03:00:00.000Z"),
        senior("yellow-old", "Zoe", "yellow", "2026-07-17T03:00:00.000Z"),
        senior("yellow-old-name", "Ada", "yellow", "2026-07-17T03:00:00.000Z"),
      ],
      []
    );

    expect(view.map((item) => item.senior.id)).toEqual([
      "red-old",
      "yellow-new",
      "yellow-old-name",
      "yellow-old",
    ]);
  });
});
