import { describe, expect, it } from "vitest";
import type { AgentTrace, DashboardData, FollowUpQueueItem } from "@/lib/types";
import {
  advancedTraceDefaultOpen,
  canSubmit,
  containsSensitiveText,
  demoEndpoint,
  mainQueueCardFields,
  recentSeniorMessages,
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
    name: "Uncle Tan",
    age: 76,
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
};

describe("dashboard view model", () => {
  it("uses the real Quick Demo endpoint", () => {
    expect(demoEndpoint("quick")).toBe("/api/demo/pattern-watch/quick");
    expect(demoEndpoint("full")).toBe("/api/demo/pattern-watch");
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
