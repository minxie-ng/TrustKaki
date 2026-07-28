import type { DashboardData } from "@/lib/types";

export type DemoPhase =
  | "orientation"
  | "prepare"
  | "review"
  | "respond"
  | "resolve"
  | "complete"
  | "exited";

type DemoAppView = "workspace" | "activity";

export function demoGuideComposition(args: {
  activeView: DemoAppView;
  enabled: boolean;
  phase: DemoPhase;
}) {
  const suppressWorkflowNavigation =
    args.enabled && args.phase !== "exited";
  const lockWorkspaceMutations =
    args.enabled &&
    ["prepare", "review", "respond", "resolve"].includes(args.phase);

  if (args.enabled && args.phase === "orientation") {
    return {
      showWorkspace: false,
      showActivity: false,
      lockWorkspaceMutations,
      suppressWorkflowNavigation,
    };
  }

  return {
    showWorkspace:
      args.activeView === "workspace" || lockWorkspaceMutations,
    showActivity:
      args.activeView === "activity" && !lockWorkspaceMutations,
    lockWorkspaceMutations,
    suppressWorkflowNavigation,
  };
}

interface DemoVerification {
  commandOk: boolean;
  stateVerified: boolean;
}

interface DemoTransition {
  phase: DemoPhase;
  error: string | null;
}

const nextPhase: Partial<Record<DemoPhase, DemoPhase>> = {
  prepare: "review",
  review: "respond",
  respond: "resolve",
  resolve: "complete",
};

const commandErrors: Partial<Record<DemoPhase, string>> = {
  prepare: "The demo could not be prepared. Retry preparation.",
  review: "The priority case could not be loaded. Retry review.",
  respond: "The follow-up response could not be saved. Retry recording.",
  resolve: "The case could not be resolved. Retry resolution.",
};

const verificationErrors: Partial<Record<DemoPhase, string>> = {
  prepare: "The demo data has not refreshed yet. Retry preparation.",
  review: "The priority case is not ready yet. Retry review.",
  respond: "The follow-up response is not visible yet. Retry recording.",
  resolve: "The resolved case history is not visible yet. Retry resolution.",
};

export function advanceDemo(
  phase: DemoPhase,
  verification: DemoVerification
): DemoTransition {
  const target = nextPhase[phase];
  if (!target) return { phase, error: null };
  if (!verification.commandOk) {
    return {
      phase,
      error: commandErrors[phase] ?? "The guided demo could not continue. Retry.",
    };
  }
  if (!verification.stateVerified) {
    return {
      phase,
      error:
        verificationErrors[phase] ??
        "The latest saved state is not visible yet. Retry.",
    };
  }
  return { phase: target, error: null };
}

export function isPrepared(data: DashboardData): boolean {
  return data.followUpQueue.some(
    (item) =>
      item.status === "pending" &&
      Boolean(item.pattern?.evidence.length)
  );
}

export function isResponseRecorded(
  data: DashboardData,
  queueItemId: string
): boolean {
  return (
    data.activity?.some(
      (item) =>
        item.queueItemId === queueItemId &&
        item.actionType === "record_outcome" &&
        item.outcomeType === "needs_follow_up" &&
        item.resultingStatus === "acknowledged"
    ) ?? false
  );
}

export function isResolveVerified(
  data: DashboardData,
  queueItemId: string
): boolean {
  return (
    !data.followUpQueue.some((item) => item.id === queueItemId) &&
    Boolean(
      data.activity?.some(
        (item) =>
          item.queueItemId === queueItemId &&
          item.resultingStatus === "resolved"
      )
    )
  );
}
