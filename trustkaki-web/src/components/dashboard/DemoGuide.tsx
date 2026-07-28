"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { authHeader } from "@/lib/auth/client";
import type { DashboardData, FollowUpQueueItem } from "@/lib/types";
import {
  advanceDemo,
  isPrepared,
  isResolveVerified,
  isResponseRecorded,
  type DemoPhase,
} from "./demoGuideState";

interface DemoGuideProps {
  enabled: boolean;
  phase: DemoPhase;
  error: string | null;
  data: DashboardData;
  authToken: string;
  onPhaseChange: (phase: DemoPhase) => void;
  onErrorChange: (error: string | null) => void;
  onRefresh: (seniorId?: string | null) => Promise<DashboardData | null>;
  onOpenTimeline: () => void;
  onUnauthorized: () => void;
  onExit: () => void;
  children?: ReactNode;
}

const activePhases: DemoPhase[] = ["prepare", "review", "respond", "resolve"];

const phaseCopy: Record<
  "prepare" | "review" | "respond" | "resolve",
  { step: string; title: string; action: string; retry: string }
> = {
  prepare: {
    step: "Step 1 of 4",
    title: "Prepare Uncle Tan's four-day history",
    action: "Prepare history",
    retry: "Retry preparation",
  },
  review: {
    step: "Step 2 of 4",
    title: "Review today's priority case and its evidence",
    action: "Review priority case",
    retry: "Retry review",
  },
  respond: {
    step: "Step 3 of 4",
    title: "Record the fictional human follow-up",
    action: "Record human response",
    retry: "Retry recording",
  },
  resolve: {
    step: "Step 4 of 4",
    title: "Resolve the case and retain its history",
    action: "Resolve and verify",
    retry: "Retry resolution",
  },
};

const RESPONSE_NOTE =
  "Rachel spoke with Mr Tan and will check again this evening.";
const RESOLUTION_NOTE =
  "Rachel confirmed Mr Tan is safe and the follow-up is complete.";

export function DemoGuide({
  enabled,
  phase,
  error,
  data,
  authToken,
  onPhaseChange,
  onErrorChange,
  onRefresh,
  onOpenTimeline,
  onUnauthorized,
  onExit,
  children,
}: DemoGuideProps) {
  const [pending, setPending] = useState(false);
  const commandIds = useRef<Partial<Record<DemoPhase, string>>>({});
  const guidedQueueItemId = useRef<string | null>(null);
  const guidedSeniorId = useRef<string | null>(null);
  const authoritativeData = useRef(data);

  useEffect(() => {
    authoritativeData.current = data;
  }, [data]);

  if (!enabled || phase === "exited") return <>{children}</>;

  if (phase === "orientation") {
    return (
      <main className="h-full overflow-y-auto bg-[var(--care-mist)] px-4 py-10 sm:px-8">
        <section className="mx-auto max-w-3xl border-y border-[var(--care-line)] bg-white px-5 py-8 sm:px-8">
          <div className="text-xs font-bold uppercase text-[var(--care-coral-hover)]">
            Guided judge demo
          </div>
          <h1 className="font-display mt-2 text-3xl font-semibold text-[var(--care-ink)]">
            Quiet changes become clear human action
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-gray-700">
            Follow one fictional senior from a four-day pattern through a
            verified caregiver response and retained case history.
          </p>
          <div className="mt-6 text-sm font-semibold text-[var(--care-evergreen)]">
            About 90 seconds
          </div>
          <ol className="mt-5 grid gap-px border border-[var(--care-line)] bg-[var(--care-line)] sm:grid-cols-2">
            {[
              "Prepare the four-day history",
              "Review the priority case",
              "Record the human response",
              "Resolve and retain history",
            ].map((label, index) => (
              <li key={label} className="bg-white px-4 py-4 text-sm text-gray-800">
                <span className="mr-2 font-bold text-[var(--care-coral-hover)]">
                  {index + 1}.
                </span>
                {label}
              </li>
            ))}
          </ol>
          <button
            type="button"
            data-demo-primary="true"
            onClick={() => {
              onErrorChange(null);
              onPhaseChange("prepare");
            }}
            className="mt-7 min-h-11 border border-[var(--care-coral-hover)] bg-[var(--care-coral)] px-5 py-3 text-sm font-bold text-white hover:bg-[var(--care-coral-hover)]"
          >
            Start guided demo
          </button>
        </section>
      </main>
    );
  }

  if (phase === "complete") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <GuideBar
          eyebrow="Demo complete"
          progress="4 of 4 complete"
          title="The active queue is clear and the resolved case remains in Activity."
          error={null}
          pending={false}
          primaryLabel={null}
          onPrimary={() => undefined}
          onExit={onExit}
        />
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    );
  }

  const activePhase = activePhases.includes(phase)
    ? (phase as keyof typeof phaseCopy)
    : "prepare";
  const copy = phaseCopy[activePhase];

  async function runCurrentPhase() {
    if (pending) return;
    setPending(true);
    onErrorChange(null);
    try {
      if (activePhase === "prepare") {
        const response = await fetch("/api/demo/pattern-watch/quick", {
          method: "POST",
          headers: authHeader(authToken),
        });
        if (handleUnauthorized(response, onUnauthorized)) return;
        const payload = response.ok
          ? ((await response.json()) as { queue?: FollowUpQueueItem[] })
          : null;
        const preparedItem =
          payload?.queue?.find(
            (item) =>
              item.status === "pending" &&
              Boolean(item.pattern?.evidence.length)
          ) ?? null;
        guidedQueueItemId.current = preparedItem?.id ?? null;
        guidedSeniorId.current = preparedItem?.seniorId ?? null;
        const refreshed = response.ok
          ? await onRefresh(guidedSeniorId.current)
          : null;
        if (refreshed) authoritativeData.current = refreshed;
        applyTransition(
          activePhase,
          response.ok,
          Boolean(
            refreshed &&
              preparedItem &&
              preparedQueueItem(refreshed, preparedItem.id)
          )
        );
        return;
      }

      if (activePhase === "review") {
        const refreshed = await onRefresh(guidedSeniorId.current);
        if (refreshed) authoritativeData.current = refreshed;
        const verified = Boolean(
          refreshed &&
            (guidedQueueItemId.current
              ? preparedQueueItem(refreshed, guidedQueueItemId.current)
              : isPrepared(refreshed))
        );
        if (verified) onOpenTimeline();
        applyTransition(activePhase, Boolean(refreshed), verified);
        return;
      }

      const item = guidedQueueItem(
        authoritativeData.current,
        guidedQueueItemId.current
      );
      if (!item) {
        applyTransition(activePhase, false, false);
        return;
      }
      const commandId =
        commandIds.current[activePhase] ?? crypto.randomUUID();
      commandIds.current[activePhase] = commandId;
      const isResponse = activePhase === "respond";
      const response = await fetch("/api/caregiver/queue-action", {
        method: "POST",
        headers: {
          ...authHeader(authToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          queueItemId: item.id,
          commandId,
          expectedUpdatedAt: item.lastUpdatedAt,
          actionType: isResponse ? "record_outcome" : "resolve",
          outcomeType: isResponse ? "needs_follow_up" : "resolved",
          note: isResponse ? RESPONSE_NOTE : RESOLUTION_NOTE,
        }),
      });
      if (handleUnauthorized(response, onUnauthorized)) return;
      if (response.status === 409) {
        commandIds.current[activePhase] = undefined;
        const refreshed = await onRefresh(guidedSeniorId.current).catch(
          () => null
        );
        if (refreshed) authoritativeData.current = refreshed;
        onErrorChange(
          "The case changed while you were reviewing it. Retry this step with the latest state."
        );
        return;
      }
      const refreshed = response.ok
        ? await onRefresh(guidedSeniorId.current)
        : null;
      if (refreshed) authoritativeData.current = refreshed;
      const verified = Boolean(
        refreshed &&
          (isResponse
            ? isResponseRecorded(refreshed, item.id)
            : isResolveVerified(refreshed, item.id))
      );
      applyTransition(activePhase, response.ok, verified);
    } catch {
      applyTransition(activePhase, false, false);
    } finally {
      setPending(false);
    }
  }

  function applyTransition(
    current: DemoPhase,
    commandOk: boolean,
    stateVerified: boolean
  ) {
    const transition = advanceDemo(current, { commandOk, stateVerified });
    onErrorChange(transition.error);
    if (transition.phase !== current) onPhaseChange(transition.phase);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <GuideBar
        eyebrow={copy.step}
        progress={`${activePhases.indexOf(activePhase)} of 4 complete`}
        title={copy.title}
        error={error}
        pending={pending}
        primaryLabel={error ? copy.retry : copy.action}
        onPrimary={runCurrentPhase}
        onExit={onExit}
      />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function GuideBar({
  eyebrow,
  progress,
  title,
  error,
  pending,
  primaryLabel,
  onPrimary,
  onExit,
}: {
  eyebrow: string;
  progress: string;
  title: string;
  error: string | null;
  pending: boolean;
  primaryLabel: string | null;
  onPrimary: () => void;
  onExit: () => void;
}) {
  return (
    <section
      aria-label="Guided demo"
      className="shrink-0 border-b border-[var(--care-line)] bg-[var(--care-paper)] px-4 py-3"
    >
      <div className="mx-auto flex max-w-[1760px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold uppercase">
            <span className="text-[var(--care-coral-hover)]">{eyebrow}</span>
            <span className="text-gray-500">{progress}</span>
          </div>
          <div className="mt-1 text-sm font-semibold text-[var(--care-ink)]">
            {title}
          </div>
          {error && (
            <p role="alert" className="mt-1 text-sm text-[var(--status-red)]">
              {error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <button
            type="button"
            onClick={onExit}
            className="min-h-10 border-b border-[var(--care-line)] text-sm font-semibold text-gray-600 hover:text-[var(--care-ink)]"
          >
            Exit guided demo
          </button>
          {primaryLabel && (
            <button
              type="button"
              data-demo-primary="true"
              onClick={onPrimary}
              disabled={pending}
              className="min-h-11 border border-[var(--care-coral-hover)] bg-[var(--care-coral)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--care-coral-hover)] disabled:cursor-wait disabled:opacity-60"
            >
              {pending ? "Working..." : primaryLabel}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function guidedQueueItem(
  data: DashboardData,
  queueItemId: string | null
): FollowUpQueueItem | null {
  if (queueItemId) {
    return data.followUpQueue.find((item) => item.id === queueItemId) ?? null;
  }
  return (
    data.followUpQueue.find(
      (item) =>
        item.status !== "resolved" &&
        Boolean(item.pattern?.evidence.length)
    ) ?? null
  );
}

function preparedQueueItem(
  data: DashboardData,
  queueItemId: string
): boolean {
  return data.followUpQueue.some(
    (item) =>
      item.id === queueItemId &&
      item.status === "pending" &&
      Boolean(item.pattern?.evidence.length)
  );
}

function handleUnauthorized(
  response: Response,
  onUnauthorized: () => void
): boolean {
  if (response.status !== 401) return false;
  onUnauthorized();
  return true;
}
