"use client";

import { useEffect, useRef, useState } from "react";
import type { BriefingOutput } from "@/lib/agents/contracts";
import type { DashboardData, FollowUpQueueItem } from "@/lib/types";
import { mainQueueCardFields } from "../dashboardViewModel";
import { StatusIndicator } from "../ui/StatusIndicator";
import { CaseDetails } from "./CaseDetails";
import { CaseUpdateForm } from "./CaseUpdateForm";
import { CareActivity } from "./CareActivity";
import {
  formatDate,
  labelPattern,
  riskConfig,
  riskHeadlineText,
  statusLabel,
  statusTone,
} from "./presentation";

interface PriorityCaseProps {
  items: FollowUpQueueItem[];
  data: DashboardData;
  briefing?: BriefingOutput | null;
  authToken: string;
  disabled: boolean;
  guideLocked?: boolean;
  openTimelineRequest?: number;
  onSaved: () => void;
  onConflictRefresh: () => Promise<unknown>;
  onUnauthorized: () => void;
}

export function invokeViewRecentActivity(callback?: () => void): void {
  callback?.();
}

export function PriorityCase({
  items,
  data,
  briefing,
  authToken,
  disabled,
  guideLocked = false,
  openTimelineRequest = 0,
  onSaved,
  onConflictRefresh,
  onUnauthorized,
}: PriorityCaseProps) {
  const [recentActivityOpen, setRecentActivityOpen] = useState(false);

  if (items.length === 0) {
    const risk = riskConfig[data.senior.riskLevel];
    return (
      <section className="border-y border-[var(--care-line)] bg-white py-8">
        <StatusIndicator
          tone="stable"
          label="No active follow-ups"
          className="font-semibold text-gray-950"
        />
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
          {data.senior.name} has no open follow-up cases. Completed care remains
          available in the activity record.
        </p>
        {data.senior.riskLevel !== "green" && (
          <div className="mt-5 flex items-start gap-3 border-l-2 border-[var(--status-amber)] pl-4 text-sm leading-6 text-gray-700">
            <StatusIndicator
              tone={risk.tone}
              label={`${risk.label} risk`}
              className="shrink-0 font-semibold"
            />
            <p>
              Closing a follow-up does not rewrite the senior&apos;s assessed risk.
              Risk changes only after a new TrustKaki reassessment.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setRecentActivityOpen((current) => !current)}
          className="mt-6 min-h-10 border-b border-[var(--care-coral)] text-sm font-semibold text-[var(--care-brand)] hover:text-[var(--care-evergreen)]"
        >
          {recentActivityOpen ? "Hide recent activity" : "View recent activity"}
        </button>
        {recentActivityOpen && (
          <CareActivity
            activity={data.activity ?? []}
            queue={items}
            seniorName={data.senior.name}
            inline
            onReturnToWorkspace={() => setRecentActivityOpen(false)}
          />
        )}
      </section>
    );
  }

  return items.map((item, index) => (
    <PriorityCaseCard
      key={`${item.id}:${index === 0 ? openTimelineRequest : 0}`}
      item={item}
      data={data}
      briefing={briefing}
      authToken={authToken}
      disabled={disabled}
      guideLocked={guideLocked}
      openTimelineRequest={index === 0 ? openTimelineRequest : 0}
      onSaved={onSaved}
      onConflictRefresh={onConflictRefresh}
      onUnauthorized={onUnauthorized}
    />
  ));
}

function PriorityCaseCard({
  item,
  data,
  briefing,
  authToken,
  disabled,
  guideLocked = false,
  openTimelineRequest = 0,
  onSaved,
  onConflictRefresh,
  onUnauthorized,
}: Omit<PriorityCaseProps, "items"> & { item: FollowUpQueueItem }) {
  const [detailsOpen, setDetailsOpen] = useState(openTimelineRequest > 0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const risk = riskConfig[item.riskLevel];
  const fields = mainQueueCardFields(item);

  useEffect(() => {
    if (openTimelineRequest <= 0) return;
    const frame = window.requestAnimationFrame(() => {
      timelineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      timelineRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [openTimelineRequest]);

  return (
    <section className="care-case">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-display text-[25px] leading-tight font-bold text-gray-950">
            {riskHeadlineText(item.headline)}
          </h3>
          <StatusIndicator
            tone={risk.tone}
            label={`${risk.label} risk`}
            className="mt-2 font-semibold"
          />
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <StatusIndicator
            tone={statusTone[item.status]}
            label={statusLabel[item.status]}
            className="text-sm font-semibold"
          />
          <button
            type="button"
            onClick={() => setDetailsOpen((current) => !current)}
            aria-expanded={detailsOpen}
            className="care-secondary-button text-sm"
          >
            {detailsOpen ? "Hide timeline" : "View timeline"}
          </button>
        </div>
      </div>
      <section className="mt-5" aria-label="Why this case was surfaced">
          <h4 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--care-muted)]">
            Why this case was surfaced
          </h4>
          <div className="mt-2 text-base leading-7 text-gray-800">{fields.reason}</div>
        </section>
      <section
        aria-label="Recommended human action"
        className="care-action-panel mt-5"
      >
        <h4 className="text-sm font-semibold text-[var(--care-brand)]">
          Recommended human action
        </h4>
        <div className="mt-1 text-base font-semibold text-gray-950">{fields.recommendedAction}</div>
      {!guideLocked && <div className="mt-4">
        <CaseUpdateForm
          item={item}
          caregiverOptions={data.assignableCaregivers ?? []}
          authToken={authToken}
          disabled={disabled}
          guideLocked={guideLocked}
          onSaved={onSaved}
          onConflictRefresh={onConflictRefresh}
          onUnauthorized={onUnauthorized}
        />
      </div>}
      </section>
      <div className="mt-5 grid gap-4 border-t border-[var(--care-line)] pt-4 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--care-muted)]">Change</div>
          <div className="mt-1 text-gray-800">{fields.changeFromUsual}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--care-muted)]">Last response</div>
          <div className="text-gray-900">{formatDate(fields.lastResponseAt)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--care-muted)]">Assigned</div>
          <div className="text-gray-900">{fields.assignedTo ?? "Unassigned"}</div>
        </div>
      </div>
      {item.relatedPatterns.length > 0 && (
        <div className="mt-3 text-xs text-gray-600">
          <span className="font-semibold text-gray-500">Supporting patterns:</span>{" "}
          {item.relatedPatterns.map((pattern) => labelPattern(pattern.type)).join(", ")}
        </div>
      )}
      {detailsOpen && (
        <div ref={timelineRef} tabIndex={-1} className="scroll-mt-4 outline-none">
          <CaseDetails item={item} data={data} briefing={briefing} />
        </div>
      )}
    </section>
  );
}
