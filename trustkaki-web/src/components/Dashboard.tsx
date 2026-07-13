"use client";

import { useMemo, useState } from "react";
import { authHeader } from "@/lib/auth/client";
import type { BriefingOutput } from "@/lib/agents/contracts";
import type {
  AgentTrace,
  ContactOutcome,
  DashboardData,
  FollowUpQueueItem,
  FollowUpStatus,
} from "@/lib/types";
import {
  canSubmit,
  demoEndpoint,
  demoProgressSteps,
  mainQueueCardFields,
  recentSeniorMessages,
  followUpQueueForSenior,
  selectedQueueItem,
  systemProof,
  type DemoMode,
  type RequestState,
} from "./dashboardViewModel";

interface DashboardProps {
  data: DashboardData;
  traces?: AgentTrace[];
  briefing?: BriefingOutput | null;
  onRefresh?: () => void;
  authToken: string | null;
  isDemoAdmin?: boolean;
  demoMode?: boolean;
  onUnauthorized?: () => void;
  onSelectSenior?: (seniorId: string) => void;
}

const riskConfig = {
  green: {
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    border: "border-l-emerald-400",
    label: "Green",
  },
  yellow: {
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    border: "border-l-yellow-400",
    label: "Yellow",
  },
  red: {
    bg: "bg-red-100",
    text: "text-red-800",
    border: "border-l-red-500",
    label: "Red",
  },
};

const statusLabel: Record<FollowUpStatus, string> = {
  pending: "Pending",
  acknowledged: "Acknowledged",
  followed_up: "Followed up",
  snoozed: "Snoozed",
  resolved: "Resolved",
};

type CaseUpdateAction = "record_outcome" | "snooze" | "resolve";

const outcomeOptions: Array<{ value: ContactOutcome; label: string }> = [
  { value: "reached_and_okay", label: "Reached and okay" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "referred_to_aac_staff", label: "Referred to AAC staff" },
  { value: "unable_to_reach", label: "Unable to reach" },
  { value: "resolved", label: "Resolved" },
];

function formatDate(ts: string | null) {
  if (!ts) return "No response yet";
  return new Date(ts).toLocaleString("en-SG", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function labelPattern(type: string) {
  return type.replaceAll("_", " ");
}

function snoozedUntilFromHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export default function Dashboard({
  data,
  traces = [],
  briefing,
  onRefresh,
  authToken,
  isDemoAdmin = false,
  demoMode = false,
  onUnauthorized,
  onSelectSenior,
}: DashboardProps) {
  const { senior, followUpQueue } = data;
  const seniors = data.seniors ?? [];
  const selectedSeniorId = data.selectedSeniorId ?? seniors[0]?.id ?? null;
  const selectedSenior = seniors.find((item) => item.id === selectedSeniorId);
  const selectedSeniorQueue = followUpQueueForSenior(followUpQueue, selectedSeniorId);
  const [manualSelectedId, setManualSelectedId] = useState<string | null>(null);
  const [caseFormItemId, setCaseFormItemId] = useState<string | null>(null);
  const [caseAction, setCaseAction] = useState<CaseUpdateAction>("record_outcome");
  const [caseOutcome, setCaseOutcome] = useState<ContactOutcome>("needs_follow_up");
  const [caseNote, setCaseNote] = useState("");
  const [snoozeHours, setSnoozeHours] = useState("4");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [demoProgress, setDemoProgress] = useState<string | null>(null);
  const [demoState, setDemoState] = useState<RequestState>("idle");
  const [actionState, setActionState] = useState<RequestState>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastDemoMode, setLastDemoMode] = useState<DemoMode>("quick");
  const selected = selectedQueueItem(selectedSeniorQueue, manualSelectedId);
  const seniorMessages = useMemo(() => recentSeniorMessages(data), [data]);
  const proof = systemProof({ data, traces, selected });

  async function postAction(
    item: FollowUpQueueItem,
    actionType: string,
    extra: Record<string, unknown> = {}
  ) {
    if (!canSubmit(busyAction)) return;
    setBusyAction(`${item.id}:${actionType}`);
    setDemoState("idle");
    setActionState("pending");
    setStatusMessage("Saving caregiver action...");
    try {
      const response = await fetch("/api/caregiver/queue-action", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader(authToken) },
        body: JSON.stringify({
          queueItemId: item.id,
          actionType,
          ...extra,
        }),
      });
      if (response.status === 401) {
        onUnauthorized?.();
        throw new Error("unauthorized");
      }
      if (!response.ok) throw new Error("caregiver_action_failed");
      setActionState("success");
      setStatusMessage(
        actionType === "resolve"
          ? "Case resolved. Active queue updated."
          : "Caregiver action recorded."
      );
      onRefresh?.();
    } catch {
      setActionState("error");
      setStatusMessage("Could not save that action. Please retry.");
    } finally {
      setBusyAction(null);
    }
  }

  function resetCaseForm() {
    setCaseAction("record_outcome");
    setCaseOutcome("needs_follow_up");
    setCaseNote("");
    setSnoozeHours("4");
  }

  async function submitCaseUpdate(item: FollowUpQueueItem) {
    const note = caseNote.trim();
    if (note.length < 10) {
      setActionState("error");
      setStatusMessage("Please add a short note so the follow-up record is clear.");
      return;
    }

    const extra: Record<string, unknown> = {
      note,
    };

    if (caseAction === "record_outcome" || caseAction === "resolve") {
      extra.outcomeType = caseOutcome;
    }

    if (caseAction === "snooze") {
      const hours = Math.max(1, Number.parseInt(snoozeHours, 10) || 4);
      extra.snoozedUntil = snoozedUntilFromHours(hours);
    }

    await postAction(item, caseAction, extra);
    setCaseFormItemId(null);
    resetCaseForm();
  }

  async function runPatternDemo(mode: DemoMode) {
    if (!canSubmit(busyAction)) return;
    const busyKey = mode === "quick" ? "demo:quick" : "demo:full";
    setLastDemoMode(mode);
    setBusyAction(busyKey);
    setActionState("idle");
    setDemoState("pending");
    setStatusMessage(null);
    setDemoProgress(demoProgressSteps[0]);
    const timers = demoProgressSteps.slice(1, -1).map((step, index) =>
      window.setTimeout(() => setDemoProgress(step), 500 + index * 900)
    );
    try {
      const response = await fetch(demoEndpoint(mode), {
        method: "POST",
        headers: authHeader(authToken),
      });
      if (response.status === 401) {
        onUnauthorized?.();
        throw new Error("unauthorized");
      }
      if (!response.ok) throw new Error("demo_failed");
      setDemoProgress("Ready");
      setDemoState("success");
      setStatusMessage(
        mode === "quick"
          ? "Quick Demo ready. Open the case and follow the action steps."
          : "Full Agent Replay complete."
      );
      onRefresh?.();
    } catch {
      setDemoState("error");
      setDemoProgress(null);
      setStatusMessage("Demo could not run. Please retry.");
    } finally {
      timers.forEach((timer) => window.clearTimeout(timer));
      setBusyAction(null);
      window.setTimeout(() => {
        setDemoProgress(null);
      }, 1800);
    }
  }

  async function resetDemo() {
    if (!canSubmit(busyAction)) return;
    const confirmed = window.confirm(
      "Reset demo data? This clears active demo queue items and restores Uncle Tan to the starting state."
    );
    if (!confirmed) return;
    setBusyAction("demo:reset");
    setActionState("idle");
    setDemoState("pending");
    setStatusMessage("Resetting demo data...");
    try {
      const response = await fetch("/api/demo/reset", {
        method: "POST",
        headers: authHeader(authToken),
      });
      if (response.status === 401) {
        onUnauthorized?.();
        throw new Error("unauthorized");
      }
      if (!response.ok) throw new Error("reset_failed");
      setDemoState("success");
      setStatusMessage("Demo reset. Run Quick Demo to rebuild the case.");
      setManualSelectedId(null);
      onRefresh?.();
    } catch {
      setDemoState("error");
      setStatusMessage("Demo reset failed. Please retry.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <main className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-5 py-5 shrink-0">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Today&apos;s follow-up queue
            </div>
            <h2 className="mt-1 font-bold text-3xl text-gray-950 tracking-tight">
              Who needs human attention?
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Prioritised by risk, pattern changes, response gaps, and unresolved follow-up.
            </p>
          </div>
          {demoProgress && isDemoAdmin && demoMode && (
            <div className="text-xs text-gray-500">{demoProgress}</div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        {seniors.length > 1 && (
          <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-950">Seniors covered</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Select a senior to review their current follow-up context.
                </p>
              </div>
              <div className="text-xs text-gray-500">
                {seniors.length} seniors
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {seniors.map((item) => {
                const risk = riskConfig[item.riskLevel];
                const selectedSenior = item.id === selectedSeniorId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectSenior?.(item.id)}
                    disabled={busyAction !== null}
                    aria-pressed={selectedSenior}
                    className={`text-left border rounded-xl p-4 transition disabled:opacity-50 hover:border-emerald-400 hover:shadow-sm ${
                      selectedSenior ? "border-emerald-500 bg-emerald-50 shadow-sm" : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-base font-bold text-gray-950">{item.name}</div>
                      <span className={`text-[11px] font-semibold px-2 py-1 rounded ${risk.bg} ${risk.text}`}>
                        {risk.label}
                      </span>
                    </div>
                    {selectedSenior && (
                      <div className="mt-2 text-[11px] font-semibold text-emerald-700">
                        Selected
                      </div>
                    )}
                    <div className="mt-2 text-xs text-gray-600">
                      {item.followUpCount === 0
                        ? "No active follow-up"
                        : `${item.followUpCount} active follow-up item${item.followUpCount === 1 ? "" : "s"}`}
                    </div>
                    <div className="mt-1 text-xs text-gray-600">
                      {[item.gender, item.age ? `${item.age} years old` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {item.primaryCaregiver ?? "No primary caregiver"} ·{" "}
                      {formatDate(item.lastCheckIn)}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="border border-gray-200 bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Selected senior
              </div>
              <h3 className="mt-1 text-2xl font-bold text-gray-950">
                {senior.name}
              </h3>
              <div className="mt-2 text-sm text-gray-700">
                {[senior.gender, `${senior.age} years old`, senior.livingSituation]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div className="mt-1 text-sm text-gray-700">
                {senior.address ?? selectedSenior?.address ?? "Address not recorded"}
              </div>
            </div>
            <div className="grid gap-3 text-sm text-gray-700 sm:grid-cols-2 md:min-w-96">
              <div className="rounded-xl bg-gray-50 p-3">
                <div className="text-xs font-semibold text-gray-500">
                  Primary caregiver
                </div>
                <div className="mt-1 font-semibold text-gray-900">{selectedSenior?.primaryCaregiver ?? senior.caregiver}</div>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <div className="text-xs font-semibold text-gray-500">
                  AAC volunteer
                </div>
                <div className="mt-1 font-semibold text-gray-900">{selectedSenior?.aacVolunteer ?? senior.aacVolunteer}</div>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <div className="text-xs font-semibold text-gray-500">
                  Current risk
                </div>
                <div className="mt-1 font-semibold text-gray-900">{riskConfig[senior.riskLevel].label}</div>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <div className="text-xs font-semibold text-gray-500">
                  Last response
                </div>
                <div className="mt-1 font-semibold text-gray-900">{formatDate(senior.lastCheckIn)}</div>
              </div>
            </div>
          </div>
        </section>

        {isDemoAdmin && demoMode && (
        <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Judge View
              </div>
              <h3 className="mt-1 text-xl font-bold text-gray-950">
                One-minute TrustKaki demo flow
              </h3>
              <ol className="mt-3 grid gap-1.5 text-sm text-gray-700 sm:grid-cols-2">
                <li>1. Reset demo</li>
                <li>2. Run Quick Demo</li>
                <li>3. Review four-day senior timeline</li>
                <li>4. Open the consolidated priority case</li>
                <li>5. Open details</li>
                <li>6. Record outcome</li>
                <li>7. Resolve case</li>
                <li>8. Confirm active queue clears</li>
              </ol>
            </div>
            <div className="flex flex-col gap-2 lg:min-w-64">
              <button
                onClick={() => runPatternDemo("quick")}
                disabled={busyAction !== null}
                className="text-sm font-semibold bg-gray-900 text-white px-4 py-3 rounded-lg disabled:opacity-50"
              >
                Start Quick Demo
              </button>
              <button
                onClick={resetDemo}
                disabled={busyAction !== null}
                className="text-sm font-semibold border border-gray-300 px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Reset demo
              </button>
              <details className="text-xs text-gray-600">
                <summary className="cursor-pointer font-semibold">
                  Technical validation
                </summary>
                <button
                  onClick={() => runPatternDemo("full")}
                  disabled={busyAction !== null}
                  className="mt-2 w-full text-sm font-semibold border border-gray-300 px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  Run Full Agent Replay
                </button>
              </details>
              {demoState === "error" && (
                <button
                  onClick={() => runPatternDemo(lastDemoMode)}
                  disabled={busyAction !== null}
                  className="text-sm font-semibold border border-red-200 text-red-700 px-4 py-2 rounded-md disabled:opacity-50"
                >
                  Retry demo
                </button>
              )}
            </div>
          </div>
          {statusMessage && (
            <div
              className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                demoState === "error" || actionState === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-gray-200 bg-gray-50 text-gray-700"
              }`}
            >
              {statusMessage}
            </div>
          )}
        </section>
        )}

        {selectedSeniorQueue.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <div className="font-semibold text-gray-900">
              {senior.name} does not currently require follow-up.
            </div>
            <p className="text-sm text-gray-600 mt-1">
              No active priority case is open for this selected senior.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {isDemoAdmin && demoMode && (
              <>
              <button
                onClick={resetDemo}
                disabled={busyAction !== null}
                className="text-xs font-semibold border px-3 py-2 rounded-md disabled:opacity-50"
              >
                Reset demo
              </button>
              <button
                onClick={() => runPatternDemo("quick")}
                disabled={busyAction !== null}
                className="text-xs font-semibold bg-gray-900 text-white px-3 py-2 rounded-md disabled:opacity-50"
              >
                Run Quick Demo
              </button>
              </>
              )}
            </div>
          </div>
        ) : (
          selectedSeniorQueue.map((item) => {
            const risk = riskConfig[item.riskLevel];
            const selectedCard = item.id === selected?.id;
            const fields = mainQueueCardFields(item);
            return (
              <div
                key={item.id}
                className={`bg-white border border-l-4 rounded-2xl p-6 shadow-sm ${
                  risk.border
                } ${
                  selectedCard ? "border-gray-300 shadow-md" : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Priority case
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gray-950">{fields.seniorName}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${risk.bg} ${risk.text}`}>
                        {risk.label}
                      </span>
                      <span className="text-sm font-medium text-gray-700">{item.headline}</span>
                    </div>
                  </div>
                  <span className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full">
                    {statusLabel[item.status]}
                  </span>
                </div>

                <div className="grid md:grid-cols-2 gap-5 mt-6 text-sm">
                  <div>
                    <div className="text-xs font-semibold text-gray-500">Why</div>
                    <div className="mt-1 text-lg font-bold leading-snug text-gray-950">{fields.reason}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-500">Change</div>
                    <div className="mt-1 text-gray-800">{fields.changeFromUsual}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-500">Last response</div>
                    <div className="text-gray-900">{formatDate(fields.lastResponseAt)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-500">Assigned</div>
                    <div className="text-gray-900">{fields.assignedTo ?? "Unassigned"}</div>
                  </div>
                </div>

                <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="text-xs font-semibold text-gray-500">Suggested action</div>
                  <div className="mt-1 text-base font-semibold text-gray-950">{fields.recommendedAction}</div>
                </div>

                {item.relatedPatterns.length > 1 && (
                  <div className="mt-3 text-xs text-gray-600">
                    <span className="font-semibold text-gray-500">
                      Supporting patterns:
                    </span>{" "}
                    {item.relatedPatterns.map((pattern) => labelPattern(pattern.type)).join(", ")}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    onClick={() => setManualSelectedId(selectedCard ? null : item.id)}
                    className="text-sm font-semibold bg-gray-900 text-white px-4 py-2 rounded-lg"
                  >
                    {selectedCard ? "Hide details" : "View details"}
                  </button>
                  <button
                    onClick={() => setCaseFormItemId(caseFormItemId === item.id ? null : item.id)}
                    className="text-sm font-semibold border border-gray-300 px-4 py-2 rounded-lg"
                    disabled={busyAction !== null}
                  >
                    {caseFormItemId === item.id ? "Close update" : "Update case"}
                  </button>
                </div>

                {caseFormItemId === item.id && (
                  <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-sm font-bold text-gray-950">Case update report</div>
                    <p className="mt-1 text-xs text-gray-600">
                      Record what happened before the queue changes. Snooze and resolve
                      require a reason so the staff decision is auditable.
                    </p>

                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <label className="text-xs font-semibold text-gray-600">
                        Action
                        <select
                          value={caseAction}
                          onChange={(event) => setCaseAction(event.target.value as CaseUpdateAction)}
                          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                          disabled={busyAction !== null}
                        >
                          <option value="record_outcome">Record outcome</option>
                          <option value="snooze">Snooze with reason</option>
                          <option value="resolve">Resolve case</option>
                        </select>
                      </label>

                      {(caseAction === "record_outcome" || caseAction === "resolve") && (
                        <label className="text-xs font-semibold text-gray-600">
                          Outcome
                          <select
                            value={caseOutcome}
                            onChange={(event) => setCaseOutcome(event.target.value as ContactOutcome)}
                            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                            disabled={busyAction !== null}
                          >
                            {outcomeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {caseAction === "snooze" && (
                        <label className="text-xs font-semibold text-gray-600">
                          Snooze for
                          <select
                            value={snoozeHours}
                            onChange={(event) => setSnoozeHours(event.target.value)}
                            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                            disabled={busyAction !== null}
                          >
                            <option value="2">2 hours</option>
                            <option value="4">4 hours</option>
                            <option value="24">Tomorrow</option>
                          </select>
                        </label>
                      )}
                    </div>

                    <label className="mt-3 block text-xs font-semibold text-gray-600">
                      Short note
                      <textarea
                        value={caseNote}
                        onChange={(event) => setCaseNote(event.target.value)}
                        rows={3}
                        placeholder={
                          caseAction === "snooze"
                            ? "Example: Handling a red-risk case first. Mei Ling will call after lunch."
                            : "Example: Rachel spoke to him. He ate lunch and agrees to a check-in tomorrow."
                        }
                        className="mt-1 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                        disabled={busyAction !== null}
                      />
                    </label>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => submitCaseUpdate(item)}
                        disabled={busyAction !== null}
                        className="text-sm font-semibold bg-gray-900 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                      >
                        Save update
                      </button>
                      <button
                        onClick={() => {
                          setCaseFormItemId(null);
                          resetCaseForm();
                        }}
                        disabled={busyAction !== null}
                        className="text-sm font-semibold border border-gray-300 px-4 py-2 rounded-lg disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {selectedCard && selected?.pattern && (
                  <div className="mt-5 border-t border-gray-200 pt-5">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-lg font-bold text-gray-950">
                          Chronological evidence timeline
                        </h3>
                        <div className="mt-2 space-y-2">
                          {selected.pattern.evidence.map((evidence) => (
                            <div key={evidence.id} className="text-xs border border-gray-200 rounded-lg bg-white p-3">
                              <div className="font-semibold text-gray-800">
                                {formatDate(evidence.observedAt)} · {evidence.type}
                              </div>
                              <div className="text-gray-700 mt-1">{evidence.description}</div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4">
                          <h3 className="text-lg font-bold text-gray-950">
                            Relevant senior messages
                          </h3>
                          <div className="mt-2 space-y-2">
                            {seniorMessages.length === 0 ? (
                              <div className="text-sm text-gray-600">
                                No persisted senior messages in this view yet.
                              </div>
                            ) : (
                              seniorMessages.map((message) => (
                                <div
                                  key={message.id}
                                  className="text-xs border border-gray-200 rounded-lg p-3 bg-white"
                                >
                                  <div className="font-semibold text-gray-700">
                                    {formatDate(message.timestamp)}
                                  </div>
                                  <div className="text-gray-800 mt-1">{message.text}</div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3 text-sm">
                        <div className="rounded-lg bg-white border border-gray-200 p-3">
                          <div className="text-xs font-semibold text-gray-500">
                            Supporting patterns
                          </div>
                          <div className="text-gray-900">
                            {selected.relatedPatterns
                              .map((pattern) => labelPattern(pattern.type))
                              .join(", ") || "No supporting patterns yet."}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white border border-gray-200 p-3">
                          <div className="text-xs font-semibold text-gray-500">
                            Deterministic Pattern Watch
                          </div>
                          <div className="text-gray-900">{selected.pattern.triggerExplanation}</div>
                        </div>
                        <div className="rounded-lg bg-white border border-gray-200 p-3">
                          <div className="text-xs font-semibold text-gray-500">Compared with usual</div>
                          <div className="text-gray-900">{selected.pattern.comparison}</div>
                        </div>
                        {selected.pattern.usualRoutine && selected.pattern.usualRoutine.length > 0 && (
                          <div className="rounded-lg bg-white border border-gray-200 p-3">
                            <div className="text-xs font-semibold text-gray-500">
                              Usual routine
                            </div>
                            <ul className="mt-1 space-y-1 text-gray-900">
                              {selected.pattern.usualRoutine.map((routine) => (
                                <li key={routine}>{routine}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {selected.pattern.knownContext && selected.pattern.knownContext.length > 0 && (
                          <div className="rounded-lg bg-white border border-gray-200 p-3">
                            <div className="text-xs font-semibold text-gray-500">
                              Known context
                            </div>
                            <ul className="mt-1 space-y-1 text-gray-900">
                              {selected.pattern.knownContext.map((context) => (
                                <li key={context}>{context}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {selected.pattern.memoryNotes && selected.pattern.memoryNotes.length > 0 && (
                          <div className="rounded-lg bg-white border border-gray-200 p-3">
                            <div className="text-xs font-semibold text-gray-500">
                              Helpful preference
                            </div>
                            <ul className="mt-1 space-y-1 text-gray-900">
                              {selected.pattern.memoryNotes.map((note) => (
                                <li key={note}>{note}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {briefing && (
                          <div className="rounded-lg border border-gray-200 bg-white p-3">
                            <div className="text-xs font-semibold text-gray-500">
                              AI-generated summary
                            </div>
                            <div className="mt-1 text-gray-900">{briefing.forCaregiver}</div>
                            {briefing.recommendedActions.length > 0 && (
                              <div className="mt-2 text-gray-700">
                                {briefing.recommendedActions.join(" ")}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="rounded-lg bg-white border border-gray-200 p-3">
                          <div className="text-xs font-semibold text-gray-500">
                            Caregiver-recorded action history
                          </div>
                          {selected.pattern.previousActions.length === 0 ? (
                            <div className="text-gray-600">No caregiver action recorded yet.</div>
                          ) : (
                            <div className="space-y-1">
                              {selected.pattern.previousActions.map((action) => (
                                <div key={action.id} className="text-gray-800">
                                  {formatDate(action.createdAt)} · {action.actionType}
                                  {action.note ? ` · ${action.note}` : ""}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <details className="text-xs rounded-lg border border-gray-200 bg-white p-3">
                          <summary className="cursor-pointer font-semibold text-gray-700">
                            How TrustKaki reached this recommendation
                          </summary>
                          <dl className="mt-2 grid grid-cols-2 gap-2 text-gray-600">
                            <dt>Messages persisted</dt>
                            <dd className="text-right font-semibold">{proof.messagesPersisted}</dd>
                            <dt>Signals detected</dt>
                            <dd className="text-right font-semibold">{proof.signalsDetected}</dd>
                            <dt>Active patterns</dt>
                            <dd className="text-right font-semibold">{proof.activePatterns}</dd>
                            <dt>Agent runs completed</dt>
                            <dd className="text-right font-semibold">{proof.agentRunsCompleted}</dd>
                            <dt>Caregiver action recorded</dt>
                            <dd className="text-right font-semibold">
                              {proof.caregiverActionRecorded ? "Yes" : "No"}
                            </dd>
                          </dl>
                          <div className="mt-2 text-gray-600">
                            Deterministic policy result: {proof.deterministicPolicyResult}
                          </div>
                        </details>
                        <details className="text-xs">
                          <summary className="cursor-pointer font-semibold text-gray-500">
                            Advanced technical trace
                          </summary>
                          <div className="mt-2 text-gray-600">
                            Pattern ID {selected.pattern.id}; evidence count{" "}
                            {selected.pattern.evidence.length}. Agent traces remain in the
                            technical panel.
                          </div>
                        </details>
                      </div>
                    </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        <div className="text-xs text-gray-500 px-1">
          Current profile: {senior.name}, {senior.age}. This queue is operational
          guidance only and does not provide medical diagnosis.
        </div>
        </div>
      </div>
    </main>
  );
}
