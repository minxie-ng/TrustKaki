"use client";

import { useState } from "react";
import { authHeader } from "@/lib/auth/client";
import {
  canSubmit,
  demoEndpoint,
  demoProgressSteps,
  type DemoMode,
  type RequestState,
} from "../dashboardViewModel";

interface DemoControlsProps {
  authToken: string;
  visible: boolean;
  onRefresh: () => void;
  onUnauthorized: () => void;
}

export function DemoControls({
  authToken,
  visible,
  onRefresh,
  onUnauthorized,
}: DemoControlsProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastMode, setLastMode] = useState<DemoMode>("quick");

  if (!visible) return null;

  const postDemo = (endpoint: string) => fetch(endpoint, {
    method: "POST",
    headers: authHeader(authToken),
  });

  async function runDemo(mode: DemoMode) {
    if (!canSubmit(busyAction)) return;
    setLastMode(mode);
    setBusyAction(`demo:${mode}`);
    setRequestState("pending");
    setStatusMessage(null);
    setProgress(demoProgressSteps[0]);
    const timers = demoProgressSteps.slice(1, -1).map((step, index) =>
      window.setTimeout(() => setProgress(step), 500 + index * 900)
    );
    try {
      const response = await postDemo(demoEndpoint(mode));
      if (response.status === 401) {
        onUnauthorized();
        throw new Error("unauthorized");
      }
      if (!response.ok) throw new Error("demo_failed");
      setProgress("Ready");
      setRequestState("success");
      setStatusMessage(
        mode === "quick"
          ? "Demo ready. In the Priority case below, select View timeline."
          : "Full Agent Replay complete."
      );
      onRefresh();
    } catch {
      setRequestState("error");
      setProgress(null);
      setStatusMessage("Demo could not run. Please retry.");
    } finally {
      timers.forEach((timer) => window.clearTimeout(timer));
      setBusyAction(null);
      window.setTimeout(() => setProgress(null), 1800);
    }
  }

  async function resetDemo() {
    if (!canSubmit(busyAction)) return;
    if (!window.confirm("Reset demo data? This clears active demo queue items and restores the starting state.")) {
      return;
    }
    setBusyAction("demo:reset");
    setRequestState("pending");
    setStatusMessage("Resetting demo data...");
    try {
      const response = await fetch("/api/demo/reset", {
        method: "POST",
        headers: authHeader(authToken),
      });
      if (response.status === 401) {
        onUnauthorized();
        throw new Error("unauthorized");
      }
      if (!response.ok) throw new Error("reset_failed");
      setRequestState("success");
      setStatusMessage("Demo reset. Run Quick Demo to rebuild the case.");
      onRefresh();
    } catch {
      setRequestState("error");
      setStatusMessage("Demo reset failed. Please retry.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase text-gray-500">
            Judge View
          </div>
          <h3 className="mt-1 text-xl font-bold text-gray-950">
            One-minute walkthrough
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Begin here. TrustKaki will prepare a clean case automatically.
          </p>
          <ol className="mt-4 grid gap-2 text-sm font-medium text-gray-700 sm:grid-cols-2">
            <li><span className="mr-2 text-[var(--care-brand)]">1</span>Open the priority case</li>
            <li><span className="mr-2 text-[var(--care-brand)]">2</span>Select View timeline</li>
            <li><span className="mr-2 text-[var(--care-brand)]">3</span>Review the evidence</li>
            <li><span className="mr-2 text-[var(--care-brand)]">4</span>Record and resolve</li>
          </ol>
        </div>
        <div className="flex flex-col gap-2 lg:min-w-64">
          <button
            type="button"
            onClick={() => runDemo("quick")}
            disabled={busyAction !== null}
            className="rounded-lg bg-[var(--care-brand-strong)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--care-brand-hover)] disabled:opacity-50"
          >
            Start guided demo
          </button>
          <details className="text-xs text-gray-600">
            <summary className="cursor-pointer py-1 font-semibold">Demo options</summary>
            <button
              type="button"
              onClick={resetDemo}
              disabled={busyAction !== null}
              className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Reset demo
            </button>
            <button
              type="button"
              onClick={() => runDemo("full")}
              disabled={busyAction !== null}
              className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Run Full Agent Replay
            </button>
          </details>
          {requestState === "error" && (
            <button
              type="button"
              onClick={() => runDemo(lastMode)}
              disabled={busyAction !== null}
              className="rounded-md border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
            >
              Retry demo
            </button>
          )}
        </div>
      </div>
      {progress && <div className="mt-3 text-xs font-medium text-gray-500">{progress}</div>}
      {statusMessage && (
        <div className={`mt-3 rounded-md border px-3 py-2 text-sm ${
          requestState === "error"
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-gray-200 bg-gray-50 text-gray-700"
        }`}>
          {statusMessage}
        </div>
      )}
    </section>
  );
}
