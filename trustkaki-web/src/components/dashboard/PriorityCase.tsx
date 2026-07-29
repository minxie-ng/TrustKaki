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
          className="mt-6 min-h-10 border-b border-[var(--care-coral)] text-sm font-semibold text-[var(--care-coral-hover)] hover:text-[var(--care-evergreen)]"
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
    <section className={`border-y border-l-4 bg-white py-5 pl-5 pr-1 sm:pr-5 ${risk.border}`}>
      <div className="flex items-center justify-between border-b border-[var(--care-line)] pb-3">
        <div className="text-xs font-bold uppercase text-[var(--care-evergreen)]">
          Priority case
        </div>
        <StatusIndicator tone={risk.tone} label="Needs attention" className="text-xs" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="pt-5">
          <h3 className="font-display text-2xl font-semibold text-gray-950">
            {riskHeadlineText(item.headline)}
          </h3>
          <StatusIndicator
            tone={risk.tone}
            label={`${risk.label} risk`}
            className="mt-2 font-semibold"
          />
        </div>
        <div className="flex shrink-0 items-center gap-4 pt-5">
          <StatusIndicator
            tone={statusTone[item.status]}
            label={statusLabel[item.status]}
            className="text-xs font-semibold"
          />
          <button
            type="button"
            onClick={() => setDetailsOpen((current) => !current)}
            aria-expanded={detailsOpen}
            className="min-h-10 border border-[var(--care-evergreen)] px-4 py-2 text-sm font-semibold text-[var(--care-evergreen)] hover:bg-[var(--care-mist)]"
          >
            {detailsOpen ? "Hide timeline" : "View timeline"}
          </button>
        </div>
      </div>
      <div className="mt-6 grid gap-5 text-sm md:grid-cols-2">
        <div>
          <div className="text-xs font-bold uppercase text-gray-500">Why now</div>
          <div className="mt-1 text-lg font-bold leading-snug text-gray-950">{fields.reason}</div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase text-gray-500">Change</div>
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
      <div className="mt-5 border-y border-l-[3px] border-[var(--care-line)] border-l-[var(--care-coral)] px-4 py-4">
        <div className="text-xs font-bold uppercase text-[var(--care-coral-hover)]">Recommended next step</div>
        <div className="mt-1 text-base font-semibold text-gray-950">{fields.recommendedAction}</div>
      </div>
      {item.relatedPatterns.length > 0 && (
        <div className="mt-3 text-xs text-gray-600">
          <span className="font-semibold text-gray-500">Supporting patterns:</span>{" "}
          {item.relatedPatterns.map((pattern) => labelPattern(pattern.type)).join(", ")}
        </div>
      )}
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
      {detailsOpen && (
        <div ref={timelineRef} tabIndex={-1} className="scroll-mt-4 outline-none">
          <CaseDetails item={item} data={data} briefing={briefing} />
        </div>
      )}
    </section>
  );
}
