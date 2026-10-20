import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DashboardData, FollowUpQueueItem } from "@/lib/types";
import { FollowUpHandover } from "./FollowUpHandover";
import { CaseDetails } from "./CaseDetails";
import { careActionAnchor } from "./caseHandover";
const item = {
  id: "queue-1", seniorId: "senior-1", status: "pending", assignedTo: "Mei Ling",
  recommendedAction: "Call to check in.",
  pattern: { previousActions: [{ id: "action-1", actionType: "record_outcome", outcomeType: "unable_to_reach", note: "<script>Not a plan</script>", caregiver: "Rachel", createdAt: "2026-10-21T09:00:00Z" }] },
} as FollowUpQueueItem;
describe("compact follow-up handover", () => {
  it("links the recorded outcome to its source and labels a suggestion separately", () => {
    const html = renderToStaticMarkup(createElement(FollowUpHandover, { item }));
    expect(html).toContain(`href="#${careActionAnchor(item.id, "action-1")}"`);
    expect(html).toContain("Assigned to Mei Ling");
    expect(html).toContain("Suggested next action · TrustKaki");
    expect(html).toContain("not a recorded commitment");
    expect(html).toContain("&lt;script&gt;Not a plan&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("does not repeat an active suggestion when case is resolved", () => {
    const html = renderToStaticMarkup(createElement(FollowUpHandover, { item: { ...item, status: "resolved" } }));
    expect(html).toContain("Case resolved.");
    expect(html).not.toContain("Call to check in.");
    expect(html).toContain("Not a plan");
  });
  it("connects summary links to the rendered care thread", () => {
    const complete = { ...item, relatedPatterns: [], pattern: { ...item.pattern!, evidence: [], previousActions: item.pattern!.previousActions } } as FollowUpQueueItem;
    const data = { selectedSeniorId: item.seniorId, activeSessions: [] } as unknown as DashboardData;
    const html = renderToStaticMarkup(createElement(CaseDetails, { item: complete, data }));
    const anchor = careActionAnchor(item.id, "action-1");
    expect(html).toContain(`href="#${anchor}"`);
    expect(html).toContain(`id="${anchor}"`);
  });
  it("suppresses details during a mismatched senior selection", () => {
    const data = { selectedSeniorId: "senior-2" } as DashboardData;
    expect(renderToStaticMarkup(createElement(CaseDetails, { item, data }))).toBe("");
  });
});
