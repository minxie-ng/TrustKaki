import type {
  AgentTrace,
  DashboardData,
  FollowUpQueueItem,
  Message,
} from "@/lib/types";

export type DemoMode = "quick" | "full";
export type RequestState = "idle" | "pending" | "success" | "error";

export const demoProgressSteps = [
  "Preparing history",
  "Detecting signals",
  "Evaluating patterns",
  "Building caregiver queue",
  "Ready",
] as const;

export const advancedTraceDefaultOpen = false;

export function appShellSurface(args: { isDemoAdmin: boolean; demoMode: boolean }) {
  return {
    showChatSimulator: false,
    showReasoningRail: false,
    showDemoControls: args.isDemoAdmin && args.demoMode,
    proofPlacement: "collapsed_details" as const,
  };
}

export function demoEndpoint(mode: DemoMode): string {
  return mode === "quick"
    ? "/api/demo/pattern-watch/quick"
    : "/api/demo/pattern-watch";
}

export function dashboardStateEndpoint(seniorId?: string | null): string {
  return seniorId
    ? `/api/dashboard/state?seniorId=${encodeURIComponent(seniorId)}`
    : "/api/dashboard/state";
}

export function canSubmit(currentRequest: string | null): boolean {
  return currentRequest === null;
}

export function concise(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function mainQueueCardFields(item: FollowUpQueueItem) {
  return {
    seniorName: item.seniorName,
    riskLevel: item.riskLevel,
    reason: concise(item.reason),
    changeFromUsual: concise(item.changeFromUsual),
    lastResponseAt: item.lastResponseAt,
    recommendedAction: item.recommendedAction,
    status: item.status,
    assignedTo: item.assignedTo,
  };
}

export function recentSeniorMessages(data: DashboardData): Message[] {
  const session = data.activeSessions[0];
  return (session?.messages ?? [])
    .filter((message) => message.sender === "senior")
    .slice(-4);
}

export function systemProof(args: {
  data: DashboardData;
  traces: AgentTrace[];
  selected: FollowUpQueueItem | null;
}) {
  const messagesPersisted = args.data.activeSessions[0]?.messages.length ?? 0;
  const signalsDetected = args.selected?.pattern?.evidence.length ?? 0;
  const activePatterns = args.selected?.relatedPatterns.length ?? 0;
  const latestPolicy = [...args.traces]
    .reverse()
    .find((trace) => trace.agentId === "policy");
  const actionCount = args.selected?.pattern?.previousActions.length ?? 0;

  return {
    messagesPersisted,
    signalsDetected,
    activePatterns,
    deterministicPolicyResult:
      latestPolicy?.outputSummary ?? "No policy result in current view",
    agentRunsCompleted: args.traces.length,
    caregiverActionRecorded: actionCount > 0,
  };
}

export function containsSensitiveText(value: string): boolean {
  return /(sk-|whatsapp_access_token|service_role|supabase_service_role_key|authorization:\s*bearer)/i.test(
    value
  );
}
