import type { CaregiverActionItem, FollowUpQueueItem } from "@/lib/types";

/** A chronological record summary, never an inferred care plan. */
export function buildCaseHandover(item: FollowUpQueueItem, actions: CaregiverActionItem[]) {
  const dated = actions
    .filter((action) => Number.isFinite(Date.parse(action.createdAt)))
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
  return {
    outcome: dated.find((action) => action.actionType === "record_outcome" || action.actionType === "resolve") ?? null,
    note: dated.find((action) => Boolean(action.note?.trim())) ?? null,
    owner: item.assignedTo?.trim() || "Unassigned",
    suggestion: item.status === "resolved" ? null : item.recommendedAction.trim() || null,
    undatedActions: dated.length !== actions.length,
  };
}

export function careActionAnchor(caseId: string, actionId: string) {
  return `care-action-${encodeURIComponent(caseId)}-${encodeURIComponent(actionId)}`;
}
