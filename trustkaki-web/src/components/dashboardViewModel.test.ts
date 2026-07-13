import { describe, expect, it } from "vitest";
import type { AgentTrace, DashboardData, FollowUpQueueItem } from "@/lib/types";
import {
  advancedTraceDefaultOpen,
  appShellSurface,
  canSubmit,
  containsSensitiveText,
  dashboardStateEndpoint,
  demoEndpoint,
  followUpQueueForSenior,
  mainQueueCardFields,
  optimisticDashboardForSenior,
  recentSeniorMessages,
  selectedQueueItem,
  systemProof,
} from "./dashboardViewModel";

const queueItem: FollowUpQueueItem = {
  id: "queue-1",
  seniorId: "senior-1",
  seniorName: "Uncle Tan",
  riskLevel: "yellow",
  headline: "Yellow · Follow-up suggested",
  reason: "Mobility, appetite and routine changes across 4 days.",
  changeFromUsual:
    "Different from his usual appetite, movement, response, and AAC participation routine.",
  lastResponseAt: "2026-07-10T08:00:00.000Z",
  recommendedAction: "Call today and check whether he needs meal support.",
  status: "pending",
  assignedTo: null,
  lastUpdatedAt: "2026-07-11T08:00:00.000Z",
  priority: 100,
  relatedPatterns: [
    {
      id: "pattern-1",
      type: "combined_wellbeing_decline",
      status: "active",
      severity: "medium",
    },
  ],
  pattern: {
    id: "pattern-1",
    type: "combined_wellbeing_decline",
    status: "active",
    severity: "medium",
    conciseSummary: "Pattern summary",
    recommendedAction: "Call today.",
    firstObservedAt: "2026-07-07T08:00:00.000Z",
    latestObservedAt: "2026-07-10T08:00:00.000Z",
    evidence: [
      {
        id: "signal-1",
        type: "health",
        severity: "medium",
        description: "Knee pain",
        observedAt: "2026-07-07T08:00:00.000Z",
      },
    ],
    triggerExplanation: "Deterministic pattern trigger",
    comparison: "Changed from usual routine",
    previousActions: [],
  },
};

const dashboardData: DashboardData = {
  senior: {
    name: "Mr Tan Ah Hock",
    age: 76,
    gender: "Male",
    livingSituation: "Lives alone",
    caregiver: "Rachel",
    aacVolunteer: "Mei Ling",
    riskLevel: "yellow",
    lastCheckIn: "2026-07-10T08:00:00.000Z",
  },
  activeSessions: [
    {
      id: "check-in-1",
      startedAt: "2026-07-10T08:00:00.000Z",
      status: "active",
      riskBefore: "green",
      riskAfter: "yellow",
      summary: "Stored summary",
      traces: [],
      messages: [
        {
          id: "m1",
          sender: "senior",
          text: "Not hungry today.",
          timestamp: "2026-07-08T08:00:00.000Z",
        },
        {
          id: "m2",
          sender: "trustkaki",
          text: "I hear you.",
          timestamp: "2026-07-08T08:01:00.000Z",
        },
      ],
    },
  ],
  recentAlerts: [],
  followUpQueue: [queueItem],
  selectedSeniorId: "senior-1",
  seniors: [
    {
      id: "senior-1",
      name: "Mr Tan Ah Hock",
      age: 76,
      gender: "Male",
      address: "Block 123",
      livingSituation: "Lives alone",
      riskLevel: "yellow",
      lastCheckIn: "2026-07-10T08:00:00.000Z",
      followUpCount: 1,
      primaryCaregiver: "Rachel",
      aacVolunteer: "Mei Ling",
    },
    {
      id: "senior-2",
      name: "Mdm Lim Siew Lan",
      age: 81,
      gender: "Female",
      address: "Block 218",
      livingSituation: "Lives with son",
      riskLevel: "green",
      lastCheckIn: null,
      followUpCount: 0,
      primaryCaregiver: "Daniel Lim",
      aacVolunteer: "Mei Ling",
    },
  ],
};

describe("dashboard view model", () => {
  it("keeps caregiver and judge surfaces focused on the dashboard", () => {
    expect(appShellSurface({ isDemoAdmin: false, demoMode: false })).toMatchObject({
      showChatSimulator: false,
      showReasoningRail: false,
      showDemoControls: false,
    });
    expect(appShellSurface({ isDemoAdmin: true, demoMode: true })).toMatchObject({
      showChatSimulator: false,
      showReasoningRail: false,
      showDemoControls: true,
      proofPlacement: "collapsed_details",
    });
  });

  it("uses the real Quick Demo endpoint", () => {
    expect(demoEndpoint("quick")).toBe("/api/demo/pattern-watch/quick");
    expect(demoEndpoint("full")).toBe("/api/demo/pattern-watch");
  });

  it("builds a stable selected-senior dashboard endpoint", () => {
    expect(dashboardStateEndpoint(null)).toBe("/api/dashboard/state");
    expect(dashboardStateEndpoint("senior 2")).toBe(
      "/api/dashboard/state?seniorId=senior%202"
    );
  });

  it("exposes concise queue card fields without internal ids", () => {
    const fields = mainQueueCardFields(queueItem);

    expect(fields).toMatchObject({
      seniorName: "Uncle Tan",
      riskLevel: "yellow",
      status: "pending",
      assignedTo: null,
    });
    expect(JSON.stringify(fields)).not.toContain("pattern-1");
    expect(JSON.stringify(fields)).not.toContain("signal-1");
  });

  it("optimistically switches selected senior details before the API returns", () => {
    const next = optimisticDashboardForSenior(dashboardData, "senior-2");

    expect(next.selectedSeniorId).toBe("senior-2");
    expect(next.senior).toMatchObject({
      name: "Mdm Lim Siew Lan",
      gender: "Female",
      caregiver: "Daniel Lim",
      riskLevel: "green",
      lastCheckIn: null,
    });
  });

  it("shows only the selected senior's queue case in the detail area", () => {
    expect(followUpQueueForSenior(dashboardData.followUpQueue, "senior-1")).toHaveLength(1);
    expect(followUpQueueForSenior(dashboardData.followUpQueue, "senior-2")).toHaveLength(0);
  });

  it("allows details to stay collapsed after the caregiver hides them", () => {
    expect(selectedQueueItem(dashboardData.followUpQueue, queueItem.id)?.id).toBe(
      queueItem.id
    );
    expect(selectedQueueItem(dashboardData.followUpQueue, null)).toBeNull();
    expect(selectedQueueItem(dashboardData.followUpQueue, "missing")).toBeNull();
  });

  it("provides supporting evidence inputs for the details view", () => {
    expect(recentSeniorMessages(dashboardData)).toHaveLength(1);
    expect(systemProof({ data: dashboardData, traces: [], selected: queueItem })).toMatchObject({
      messagesPersisted: 2,
      signalsDetected: 1,
      activePatterns: 1,
    });
  });

  it("keeps advanced trace collapsed by default", () => {
    expect(advancedTraceDefaultOpen).toBe(false);
  });

  it("prevents duplicate submissions while a request is pending", () => {
    expect(canSubmit(null)).toBe(true);
    expect(canSubmit("queue-1:resolve")).toBe(false);
  });

  it("tracks caregiver action proof after an action exists", () => {
    const selected = {
      ...queueItem,
      pattern: queueItem.pattern
        ? {
            ...queueItem.pattern,
            previousActions: [
              {
                id: "action-1",
                actionType: "resolve" as const,
                outcomeType: "resolved" as const,
                note: "Resolved",
                createdAt: "2026-07-11T08:00:00.000Z",
              },
            ],
          }
        : null,
    };

    expect(systemProof({ data: dashboardData, traces: [], selected })).toMatchObject({
      caregiverActionRecorded: true,
    });
  });

  it("summarizes deterministic policy without exposing raw provider responses", () => {
    const traces: AgentTrace[] = [
      {
        id: "trace-policy",
        agentId: "policy",
        agentName: "Deterministic Policy",
        timestamp: "2026-07-11T08:00:00.000Z",
        input: "hidden",
        reasoning: "deterministic",
        output: "raw provider output should not be rendered here",
        outputSummary: "final risk yellow; briefing required; 1 alert(s)",
        tags: [],
      },
    ];

    const proof = systemProof({ data: dashboardData, traces, selected: queueItem });
    expect(proof.deterministicPolicyResult).toBe(
      "final risk yellow; briefing required; 1 alert(s)"
    );
    expect(containsSensitiveText("SUPABASE_SERVICE_ROLE_KEY=abc")).toBe(true);
    expect(containsSensitiveText(JSON.stringify(proof))).toBe(false);
  });
});
