"use client";

import { useRef, useState } from "react";
import { authHeader } from "@/lib/auth/client";
import type { NotificationCategory } from "@/lib/contacts/contracts";
import type {
  CaregiverOption,
  ContactOutcome,
  EscalationDestination,
  FollowUpQueueItem,
} from "@/lib/types";
import { canSaveCaseUpdate, canSubmit, type RequestState } from "../dashboardViewModel";

export type CaseUpdateAction =
  | "acknowledge"
  | "assign"
  | "record_outcome"
  | "snooze"
  | "escalate"
  | "resolve";

type PersistedCaseAction =
  | "mark_for_follow_up"
  | "assign"
  | "record_outcome"
  | "snooze"
  | "escalate"
  | "resolve";

export function actionTypeForCaseAction(
  action: CaseUpdateAction
): PersistedCaseAction {
  return action === "acknowledge" ? "mark_for_follow_up" : action;
}

export function canSaveCaseAction(
  action: CaseUpdateAction,
  note: string,
  assignedCaregiverId: string | null
): boolean {
  if (action === "acknowledge") return true;
  if (action === "assign") return Boolean(assignedCaregiverId);
  return canSaveCaseUpdate(note);
}

const outcomeOptions: Array<{ value: ContactOutcome; label: string }> = [
  { value: "reached_and_okay", label: "Reached and okay" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "referred_to_aac_staff", label: "Referred to AAC staff" },
  { value: "unable_to_reach", label: "Unable to reach" },
];

export function outcomeForCaseAction(
  action: CaseUpdateAction,
  selectedOutcome: ContactOutcome
): ContactOutcome | undefined {
  if (action === "resolve") return "resolved";
  if (action === "record_outcome") return selectedOutcome;
  return undefined;
}

const actionLabels: Record<CaseUpdateAction, string> = {
  acknowledge: "Acknowledge case",
  assign: "Assign caregiver",
  record_outcome: "Record follow-up",
  snooze: "Snooze for later",
  escalate: "Escalate case",
  resolve: "Close as resolved",
};

const allCaseActions = Object.keys(actionLabels) as CaseUpdateAction[];

export function availableCaseActions(
  status: FollowUpQueueItem["status"]
): CaseUpdateAction[] {
  if (status === "escalated") {
    return ["assign", "record_outcome", "escalate", "resolve"];
  }
  if (status === "followed_up") {
    return ["assign", "record_outcome", "snooze", "escalate", "resolve"];
  }
  if (status === "resolved") return [];
  return [...allCaseActions];
}

export function initialCaseAction(
  status: FollowUpQueueItem["status"]
): CaseUpdateAction {
  if (status === "escalated" || status === "followed_up") {
    return "record_outcome";
  }
  return availableCaseActions(status)[0] ?? "record_outcome";
}

const escalationOptions: Array<{
  value: EscalationDestination;
  label: string;
}> = [
  { value: "family_guardian", label: "Family or guardian" },
  { value: "aac_supervisor", label: "AAC supervisor" },
  { value: "healthcare_follow_up", label: "Healthcare follow-up" },
  { value: "emergency_guidance", label: "Emergency guidance" },
];

const notificationCategoryOptions: Array<{
  value: NotificationCategory;
  label: string;
}> = [
  { value: "wellbeing_follow_up", label: "Wellbeing follow-up" },
  { value: "health_safety", label: "Health or safety" },
  { value: "digital_safety", label: "Digital safety" },
  { value: "urgent_safety", label: "Urgent safety" },
];

export function notificationCategoryForEscalation(
  destination: EscalationDestination,
  selected: NotificationCategory
): NotificationCategory {
  return destination === "emergency_guidance" ? "urgent_safety" : selected;
}

interface CaseUpdateFormProps {
  item: FollowUpQueueItem;
  caregiverOptions: CaregiverOption[];
  authToken: string;
  disabled: boolean;
  onSaved: () => void;
  onUnauthorized: () => void;
}

export function CaseUpdateForm({
  item,
  caregiverOptions,
  authToken,
  disabled,
  onSaved,
  onUnauthorized,
}: CaseUpdateFormProps) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<CaseUpdateAction>(() =>
    initialCaseAction(item.status)
  );
  const [outcome, setOutcome] = useState<ContactOutcome>("needs_follow_up");
  const [note, setNote] = useState("");
  const [snoozeHours, setSnoozeHours] = useState("4");
  const [escalationDestination, setEscalationDestination] =
    useState<EscalationDestination>("family_guardian");
  const [notificationCategory, setNotificationCategory] =
    useState<NotificationCategory>("wellbeing_follow_up");
  const [assignedCaregiverId, setAssignedCaregiverId] = useState<string | null>(
    caregiverOptions[0]?.id ?? null
  );
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const commandIdRef = useRef<string | null>(null);

  const pending = requestState === "pending";
  const availableActions = availableCaseActions(item.status);

  function changeCommandInput(update: () => void) {
    commandIdRef.current = null;
    update();
  }

  function reset() {
    setAction(initialCaseAction(item.status));
    setOutcome("needs_follow_up");
    setNote("");
    setSnoozeHours("4");
    setEscalationDestination("family_guardian");
    setNotificationCategory("wellbeing_follow_up");
    setAssignedCaregiverId(caregiverOptions[0]?.id ?? null);
    commandIdRef.current = null;
  }

  async function submit() {
    if (!canSubmit(pending ? "pending" : null)) return;
    const cleanNote = note.trim();
    if (!canSaveCaseAction(action, cleanNote, assignedCaregiverId)) {
      setRequestState("error");
      setStatusMessage(
        action === "assign"
          ? "Select a caregiver linked to this senior."
          : "Please add a short note so the follow-up record is clear."
      );
      return;
    }

    const body: Record<string, unknown> = {
      queueItemId: item.id,
      commandId: commandIdRef.current ?? crypto.randomUUID(),
      expectedUpdatedAt: item.lastUpdatedAt,
      actionType: actionTypeForCaseAction(action),
      note: cleanNote,
    };
    commandIdRef.current = body.commandId as string;
    const submittedOutcome = outcomeForCaseAction(action, outcome);
    if (submittedOutcome) {
      body.outcomeType = submittedOutcome;
    }
    if (action === "snooze") {
      const hours = Math.max(1, Number.parseInt(snoozeHours, 10) || 4);
      body.snoozedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    }
    if (action === "escalate") {
      body.escalationDestination = escalationDestination;
      body.notificationCategory = notificationCategoryForEscalation(
        escalationDestination,
        notificationCategory
      );
    }
    if (action === "assign") {
      body.assignedCaregiverId = assignedCaregiverId;
    }

    setRequestState("pending");
    setStatusMessage("Saving caregiver action...");
    try {
      const response = await fetch("/api/caregiver/queue-action", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader(authToken) },
        body: JSON.stringify(body),
      });
      if (response.status === 401) {
        onUnauthorized();
        throw new Error("unauthorized");
      }
      if (response.status === 409) {
        setRequestState("error");
        setStatusMessage(
          "Another caregiver updated this case. The latest status is being loaded."
        );
        commandIdRef.current = null;
        onSaved();
        return;
      }
      if (!response.ok) throw new Error("caregiver_action_failed");
      const result = (await response.json()) as {
        persistence?: { persisted?: boolean };
        resultingStatus?: string | null;
      };
      if (!result.persistence?.persisted) throw new Error("caregiver_action_not_persisted");
      if (action === "resolve" && result.resultingStatus !== "resolved") {
        throw new Error("caregiver_action_not_resolved");
      }
      if (action === "escalate" && result.resultingStatus !== "escalated") {
        throw new Error("caregiver_action_not_escalated");
      }
      setRequestState("success");
      setStatusMessage(
        action === "resolve"
          ? "Case resolved. Active queue updated."
          : action === "escalate"
            ? "Escalation recorded. The case remains active."
            : "Caregiver action recorded."
      );
      onSaved();
      setOpen(false);
      reset();
    } catch {
      setRequestState("error");
      setStatusMessage("Could not save that action. Please retry.");
    }
  }

  return (
    <div className="contents">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="min-h-11 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
        disabled={disabled || pending}
      >
        {open ? "Close update" : "Update case"}
      </button>
      {!open && statusMessage && (
        <div className={`mt-3 w-full basis-full rounded-lg border px-3 py-2 text-sm ${
          requestState === "error"
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-emerald-200 bg-emerald-50 text-emerald-800"
        }`}>
          {statusMessage}
        </div>
      )}
      {open && (
        <div className="mt-4 w-full basis-full rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-sm font-bold text-gray-950">Update this case</div>
          <p className="mt-1 text-xs text-gray-600">
            Save a short human follow-up record. Snoozing or closing a case always
            needs a reason so the decision is visible later.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs font-semibold text-gray-600">
              What do you want to do?
              <select
                value={action}
                onChange={(event) =>
                  changeCommandInput(() =>
                    setAction(event.target.value as CaseUpdateAction)
                  )
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                disabled={pending}
              >
                {availableActions.map((value) => (
                  <option key={value} value={value}>{actionLabels[value]}</option>
                ))}
              </select>
            </label>
            {action === "record_outcome" && (
              <label className="text-xs font-semibold text-gray-600">
                What happened?
                <select
                  value={outcome}
                  onChange={(event) =>
                    changeCommandInput(() =>
                      setOutcome(event.target.value as ContactOutcome)
                    )
                  }
                  className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  disabled={pending}
                >
                  {outcomeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            )}
            {action === "assign" && (
              <label className="text-xs font-semibold text-gray-600">
                Assign to
                <select
                  value={assignedCaregiverId ?? ""}
                  onChange={(event) =>
                    changeCommandInput(() =>
                      setAssignedCaregiverId(event.target.value || null)
                    )
                  }
                  className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  disabled={pending}
                >
                  {caregiverOptions.length === 0 && (
                    <option value="">No linked caregiver available</option>
                  )}
                  {caregiverOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                      {option.relationship ? ` (${option.relationship})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {action === "resolve" && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                This removes the case from the active queue. The current risk level
                remains until TrustKaki reassesses new information.
              </div>
            )}
            {action === "snooze" && (
              <label className="text-xs font-semibold text-gray-600">
                Snooze for
                <select
                  value={snoozeHours}
                  onChange={(event) =>
                    changeCommandInput(() => setSnoozeHours(event.target.value))
                  }
                  className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  disabled={pending}
                >
                  <option value="2">2 hours</option>
                  <option value="4">4 hours</option>
                  <option value="24">Tomorrow</option>
                </select>
              </label>
            )}
            {action === "escalate" && (
              <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-gray-600">
                Escalate to
                <select
                  value={escalationDestination}
                  onChange={(event) =>
                    changeCommandInput(() =>
                      setEscalationDestination(
                        event.target.value as EscalationDestination
                      )
                    )
                  }
                  className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  disabled={pending}
                >
                  {escalationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-gray-600">
                Reason category
                <select
                  value={notificationCategoryForEscalation(
                    escalationDestination,
                    notificationCategory
                  )}
                  onChange={(event) => changeCommandInput(() =>
                    setNotificationCategory(event.target.value as NotificationCategory)
                  )}
                  className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  disabled={pending || escalationDestination === "emergency_guidance"}
                >
                  {notificationCategoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              </div>
            )}
          </div>
          {action === "escalate" && escalationDestination === "emergency_guidance" && (
            <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              <div className="font-semibold">Immediate danger requires a direct call.</div>
              <p className="mt-1">
                Saving this record does not contact emergency services. Call 995
                now for a medical or fire emergency in Singapore.
              </p>
              <a
                href="tel:995"
                className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-red-700 px-3 py-2 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
              >
                Call 995
              </a>
            </div>
          )}
          {action !== "acknowledge" && action !== "assign" && (
          <label className="mt-3 block text-xs font-semibold text-gray-600">
            {action === "snooze"
              ? "Why is it reasonable to delay?"
              : action === "escalate"
                ? "Why is escalation needed?"
              : action === "resolve"
                ? "Why can this be closed?"
                : "What happened and what is next?"}
            <textarea
              value={note}
              onChange={(event) =>
                changeCommandInput(() => setNote(event.target.value))
              }
              rows={3}
              placeholder={
                action === "snooze"
                  ? "Example: Handling a red-risk case first. Mei Ling will call after lunch."
                  : action === "escalate"
                    ? "Example: Unable to reach him twice. AAC supervisor should review today."
                  : "Example: Rachel spoke to him. He ate lunch and agrees to a check-in tomorrow."
              }
              className="mt-1 min-h-11 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              disabled={pending}
            />
          </label>
          )}
          <div className={`mt-1 text-xs ${canSaveCaseAction(action, note, assignedCaregiverId) ? "text-emerald-700" : "text-gray-500"}`}>
            {canSaveCaseAction(action, note, assignedCaregiverId)
              ? "Ready to save to action history."
              : action === "assign"
                ? "Select a caregiver linked to this senior."
                : "Add at least 10 characters so the record is useful later."}
          </div>
          {statusMessage && (
            <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
              requestState === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : requestState === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-gray-200 bg-white text-gray-700"
            }`}>
              {statusMessage}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={
                pending || !canSaveCaseAction(action, note, assignedCaregiverId)
              }
              className="min-h-11 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:opacity-50"
            >
              {pending ? "Saving..." : "Save update"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); reset(); }}
              disabled={pending}
              className="min-h-11 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
