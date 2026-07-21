import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CaregiverActionItem } from "@/lib/types";
import type { DashboardData, FollowUpQueueItem } from "@/lib/types";
import { CaseDetails, formatCaregiverActionHistory } from "./CaseDetails";

describe("formatCaregiverActionHistory", () => {
  it("keeps the authenticated actor distinct from the assignment target", () => {
    const action: CaregiverActionItem = {
      id: "action-1",
      actionType: "assign",
      outcomeType: null,
      escalationDestination: null,
      caregiver: "Gate 1 Caregiver A",
      assignedCaregiver: "Gate 1 Caregiver B",
      note: null,
      createdAt: "2026-07-14T03:52:00.000Z",
    };

    expect(formatCaregiverActionHistory(action)).toContain(
      "assign to Gate 1 Caregiver B · by Gate 1 Caregiver A"
    );
  });
});

describe("CaseDetails staff presentation", () => {
  it("keeps care evidence and plain-language explanation without technical proof", () => {
    const item = {
      id: "queue-1",
      seniorId: "senior-1",
      seniorName: "Mdm Lim Siew Lan",
      riskLevel: "yellow",
      headline: "Appetite and mobility changed together",
      reason: "Two connected changes need follow-up.",
      changeFromUsual: "Different from the usual routine.",
      lastResponseAt: "2026-07-18T01:00:00.000Z",
      recommendedAction: "Check in today.",
      status: "pending",
      assignedTo: null,
      lastUpdatedAt: "2026-07-18T02:00:00.000Z",
      priority: 1,
      relatedPatterns: [],
      pattern: {
        id: "pattern-1",
        type: "combined_wellbeing_decline",
        status: "active",
        severity: "medium",
        conciseSummary: "Two changes appeared together.",
        recommendedAction: "Check in today.",
        firstObservedAt: "2026-07-17T01:00:00.000Z",
        latestObservedAt: "2026-07-18T01:00:00.000Z",
        evidence: [{
          id: "evidence-1",
          type: "daily_living",
          severity: "medium",
          description: "Senior skipped breakfast.",
          observedAt: "2026-07-18T01:00:00.000Z",
        }],
        triggerExplanation: "The same change appeared in two check-ins.",
        comparison: "This is different from the usual morning routine.",
        previousActions: [{
          id: "action-1",
          actionType: "assign",
          outcomeType: null,
          escalationDestination: null,
          assignedCaregiver: "Caregiver B",
          caregiver: "Caregiver A",
          note: "Please check in today.",
          createdAt: "2026-07-18T02:00:00.000Z",
        }],
        knownContext: ["Lives alone"],
        memoryNotes: ["Prefers morning calls"],
      },
    } satisfies FollowUpQueueItem;
    const data = {
      senior: {
        name: "Mdm Lim Siew Lan",
        age: 74,
        livingSituation: "Lives alone",
        caregiver: "Caregiver A",
        aacVolunteer: "Volunteer B",
        riskLevel: "yellow",
        lastCheckIn: "2026-07-18T01:00:00.000Z",
      },
      activeSessions: [{
        id: "session-1",
        startedAt: "2026-07-18T00:00:00.000Z",
        status: "completed",
        messages: [{ id: "message-1", sender: "senior", text: "I skipped breakfast.", timestamp: "2026-07-18T01:00:00.000Z" }],
        traces: [],
        riskBefore: "green",
        riskAfter: "yellow",
        summary: null,
      }],
      recentAlerts: [],
      followUpQueue: [item],
    } satisfies DashboardData;
    const html = renderToStaticMarkup(createElement(CaseDetails, {
      item,
      data,
      briefing: {
        forCaregiver: "A short check-in may clarify what changed.",
        forAACVolunteer: "Support a short morning check-in.",
        overallRisk: "yellow",
        keyConcerns: ["Breakfast and mobility changed together."],
        recommendedActions: ["Ask about breakfast and mobility."],
      },
    }));

    expect(html).toContain("Chronological evidence");
    expect(html).toContain("Medium severity");
    expect(html).toContain("Why TrustKaki suggested this");
    expect(html).toContain("Recorded actions");
    expect(html).toContain("A short check-in may clarify what changed.");
    expect(html).not.toContain("Agent runs completed");
    expect(html).not.toContain("Advanced technical trace");
    expect(html).not.toMatch(/model|provider response|duration ms/i);
  });

  it("uses one clear empty evidence state and structured action history", () => {
    const item = {
      id: "queue-empty",
      seniorId: "senior-empty",
      seniorName: "Mdm Siti Fatimah",
      riskLevel: "red",
      headline: "Follow-up required",
      reason: "A recent change needs review.",
      changeFromUsual: "Different from usual.",
      lastResponseAt: null,
      recommendedAction: "Contact the senior.",
      status: "pending",
      assignedTo: null,
      lastUpdatedAt: "2026-07-18T02:00:00.000Z",
      priority: 1,
      relatedPatterns: [],
      pattern: {
        id: "pattern-empty",
        type: "combined_wellbeing_decline",
        status: "active",
        severity: "high",
        conciseSummary: "A recent change needs review.",
        recommendedAction: "Contact the senior.",
        firstObservedAt: "2026-07-18T01:00:00.000Z",
        latestObservedAt: "2026-07-18T01:00:00.000Z",
        evidence: [],
        triggerExplanation: "Several related changes appeared together.",
        comparison: "Different from the usual response pattern.",
        previousActions: [{
          id: "action-empty",
          actionType: "snooze",
          outcomeType: null,
          escalationDestination: null,
          assignedCaregiver: null,
          caregiver: "Rachel Tan",
          note: "Covering another urgent visit.",
          createdAt: "2026-07-18T02:00:00.000Z",
        }],
        knownContext: [],
        memoryNotes: [],
      },
    } satisfies FollowUpQueueItem;
    const data = {
      senior: {
        name: "Mdm Siti Fatimah",
        age: 77,
        livingSituation: "Lives with family",
        caregiver: "Nur Aishah",
        aacVolunteer: "Mei Ling",
        riskLevel: "red",
        lastCheckIn: null,
      },
      activeSessions: [],
      recentAlerts: [],
      followUpQueue: [item],
    } satisfies DashboardData;

    const html = renderToStaticMarkup(createElement(CaseDetails, {
      item,
      data,
    }));

    expect(html).toContain("No timeline evidence yet");
    expect(html).toContain("No senior messages recorded for this case yet");
    expect(html).toContain("Recommendation basis");
    expect(html).toContain("Recorded actions");
    expect(html).toContain("Covering another urgent visit.");
  });
});
