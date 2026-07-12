"use client";

import { useMemo, useState } from "react";
import { authHeader } from "@/lib/auth/client";
import type { BriefingOutput } from "@/lib/agents/contracts";
import type {
  AgentTrace,
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
  onUnauthorized?: () => void;
}

const riskConfig = {
  green: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Green" },
  yellow: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Yellow" },
  red: { bg: "bg-red-100", text: "text-red-800", label: "Red" },
};

const statusLabel: Record<FollowUpStatus, string> = {
  pending: "Pending",
  acknowledged: "Acknowledged",
  followed_up: "Followed up",
  snoozed: "Snoozed",
  resolved: "Resolved",
};

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

export default function Dashboard({
  data,
  traces = [],
  briefing,
  onRefresh,
  authToken,
  isDemoAdmin = false,
  onUnauthorized,
}: DashboardProps) {
  const { senior, followUpQueue } = data;
  const [selectedId, setSelectedId] = useState<string | null>(
    followUpQueue[0]?.id ?? null
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [demoProgress, setDemoProgress] = useState<string | null>(null);
  const [demoState, setDemoState] = useState<RequestState>("idle");
  const [actionState, setActionState] = useState<RequestState>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastDemoMode, setLastDemoMode] = useState<DemoMode>("quick");
  const selected = followUpQueue.find((item) => item.id === selectedId) ?? null;
  const seniorMessages = useMemo(() => recentSeniorMessages(data), [data]);
  const proof = useMemo(
    () => systemProof({ data, traces, selected }),
    [data, traces, selected]
  );

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
      setSelectedId(null);
      onRefresh?.();
    } catch {
      setDemoState("error");
      setStatusMessage("Demo reset failed. Please retry.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b px-5 py-4 shrink-0">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-bold text-xl text-gray-900">
              Who may need attention today?
            </h2>
            <p className="text-xs text-gray-500">
              Ordered by risk, active patterns, response change, and unresolved follow-up.
            </p>
          </div>
            {isDemoAdmin && (
            <div className="flex flex-col gap-2 md:items-end">
            <div className="flex flex-wrap gap-2">
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
                Quick Demo
              </button>
              <button
                onClick={() => runPatternDemo("full")}
                disabled={busyAction !== null}
                className="text-xs font-semibold border px-3 py-2 rounded-md disabled:opacity-50"
              >
                Full Agent Replay
              </button>
            </div>
            {demoProgress && (
              <div className="text-xs text-gray-500">{demoProgress}</div>
            )}
          </div>
            )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isDemoAdmin && (
        <section className="bg-white border rounded-lg p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Judge View
              </div>
              <h3 className="mt-1 font-bold text-gray-900">
                One-minute TrustKaki demo flow
              </h3>
              <ol className="mt-2 grid gap-1 text-sm text-gray-700 sm:grid-cols-2">
                <li>1. Reset demo</li>
                <li>2. Run Quick Demo</li>
                <li>3. Review four-day senior timeline</li>
                <li>4. Open the consolidated priority case</li>
                <li>5. Assign or mark follow-up</li>
                <li>6. Record outcome</li>
                <li>7. Resolve case</li>
                <li>8. Confirm active queue clears</li>
              </ol>
            </div>
            <div className="flex flex-col gap-2 lg:min-w-64">
              <button
                onClick={() => runPatternDemo("quick")}
                disabled={busyAction !== null}
                className="text-sm font-semibold bg-gray-900 text-white px-4 py-2 rounded-md disabled:opacity-50"
              >
                Start Quick Demo
              </button>
              <button
                onClick={() => runPatternDemo("full")}
                disabled={busyAction !== null}
                className="text-sm font-semibold border px-4 py-2 rounded-md disabled:opacity-50"
              >
                Run Full Agent Replay
              </button>
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

        {followUpQueue.length === 0 ? (
          <div className="bg-white border rounded-lg p-5">
            <div className="font-semibold text-gray-900">
              No seniors currently require follow-up.
            </div>
            <p className="text-sm text-gray-600 mt-1">
              The active caregiver queue is clear. You can reset or rerun the demo
              to show the full workflow again.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {isDemoAdmin && (
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
          followUpQueue.map((item) => {
            const risk = riskConfig[item.riskLevel];
            const selectedCard = item.id === selected?.id;
            const fields = mainQueueCardFields(item);
            return (
              <div
                key={item.id}
                className={`bg-white border rounded-lg p-4 ${
                  selectedCard ? "border-gray-900" : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-gray-900">{fields.seniorName}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${risk.bg} ${risk.text}`}>
                        {risk.label}
                      </span>
                      <span className="text-xs text-gray-600">{item.headline}</span>
                    </div>
                  </div>
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                    {statusLabel[item.status]}
                  </span>
                </div>

                <div className="grid md:grid-cols-2 gap-3 mt-4 text-sm">
                  <div>
                    <div className="text-xs font-semibold text-gray-500">Why</div>
                    <div className="text-gray-900">{fields.reason}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-500">Change</div>
                    <div className="text-gray-900">{fields.changeFromUsual}</div>
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

                <div className="mt-3 bg-gray-50 border rounded-md p-3">
                  <div className="text-xs font-semibold text-gray-500">Suggested action</div>
                  <div className="text-sm text-gray-900">{fields.recommendedAction}</div>
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
                    onClick={() => postAction(item, "mark_for_follow_up")}
                    className="text-xs font-semibold border px-3 py-2 rounded-md"
                    disabled={busyAction !== null}
                  >
                    Mark for follow-up
                  </button>
                  <button
                    onClick={() =>
                      postAction(item, "assign", { assignedCaregiverId: "aac_volunteer" })
                    }
                    className="text-xs font-semibold border px-3 py-2 rounded-md"
                    disabled={busyAction !== null}
                  >
                    Assign
                  </button>
                  <button
                    onClick={() =>
                      postAction(item, "record_outcome", {
                        outcomeType: "needs_follow_up",
                        note: "Needs another human check-in.",
                      })
                    }
                    className="text-xs font-semibold border px-3 py-2 rounded-md"
                    disabled={busyAction !== null}
                  >
                    Record outcome
                  </button>
                  <button
                    onClick={() => postAction(item, "resolve")}
                    className="text-xs font-semibold border px-3 py-2 rounded-md"
                    disabled={busyAction !== null}
                  >
                    Resolve
                  </button>
                  <button
                    onClick={() => setSelectedId(selectedCard ? null : item.id)}
                    className="text-xs font-semibold bg-gray-900 text-white px-3 py-2 rounded-md"
                  >
                    View details
                  </button>
                </div>

                {selectedCard && selected?.pattern && (
                  <div className="mt-4 border-t pt-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          Chronological evidence timeline
                        </h3>
                        <div className="mt-2 space-y-2">
                          {selected.pattern.evidence.map((evidence) => (
                            <div key={evidence.id} className="text-xs border rounded-md p-2">
                              <div className="font-semibold text-gray-800">
                                {formatDate(evidence.observedAt)} · {evidence.type}
                              </div>
                              <div className="text-gray-700 mt-1">{evidence.description}</div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4">
                          <h3 className="font-semibold text-gray-900">
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
                                  className="text-xs border rounded-md p-2 bg-gray-50"
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
                        <div>
                          <div className="text-xs font-semibold text-gray-500">
                            Supporting patterns
                          </div>
                          <div className="text-gray-900">
                            {selected.relatedPatterns
                              .map((pattern) => labelPattern(pattern.type))
                              .join(", ") || "No supporting patterns yet."}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-gray-500">
                            Deterministic Pattern Watch
                          </div>
                          <div className="text-gray-900">{selected.pattern.triggerExplanation}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-gray-500">Compared with usual</div>
                          <div className="text-gray-900">{selected.pattern.comparison}</div>
                        </div>
                        {selected.pattern.usualRoutine && selected.pattern.usualRoutine.length > 0 && (
                          <div>
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
                          <div>
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
                          <div>
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
                          <div className="rounded-md border bg-gray-50 p-3">
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
                        <div>
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
                        <details className="text-xs rounded-md border p-3">
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
  );
}
