"use client";

import { useEffect, useRef, useState } from "react";
import type { BriefingOutput } from "@/lib/agents/contracts";
import type { DashboardData, FollowUpQueueItem } from "@/lib/types";
import { mainQueueCardFields } from "../dashboardViewModel";
import { CaseDetails } from "./CaseDetails";
import { CaseUpdateForm } from "./CaseUpdateForm";
import {
  formatDate,
  labelPattern,
  riskConfig,
  riskHeadlineText,
  statusLabel,
} from "./presentation";

interface PriorityCaseProps {
  items: FollowUpQueueItem[];
  data: DashboardData;
  briefing?: BriefingOutput | null;
  authToken: string;
  disabled: boolean;
  openTimelineRequest?: number;
  onSaved: () => void;
  onUnauthorized: () => void;
}

export function PriorityCase({
  items,
  data,
  briefing,
  authToken,
  disabled,
  openTimelineRequest = 0,
  onSaved,
  onUnauthorized,
}: PriorityCaseProps) {
  if (items.length === 0) {
    const risk = riskConfig[data.senior.riskLevel];
    return (
      <div className="rounded-lg border border-[var(--care-line)] bg-white p-6 shadow-[0_8px_24px_rgba(23,33,29,0.06)]">
        <div className="font-semibold text-gray-900">
          {data.senior.name} does not currently require follow-up.
        </div>
        <p className="mt-1 text-sm text-gray-600">
          No active priority case is open for this selected senior.
        </p>
        {data.senior.riskLevel !== "green" && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${risk.bg} ${risk.text}`}>
              {risk.label} risk
            </span>
            <p>
              Closing a follow-up does not rewrite the senior&apos;s assessed risk.
              Risk changes only after a new TrustKaki reassessment.
            </p>
          </div>
        )}
      </div>
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
      openTimelineRequest={index === 0 ? openTimelineRequest : 0}
      onSaved={onSaved}
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
  openTimelineRequest = 0,
  onSaved,
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
    <section className={`overflow-hidden rounded-lg border border-l-4 bg-white p-5 shadow-[0_8px_24px_rgba(23,33,29,0.06)] ${risk.border} ${
      detailsOpen ? "border-gray-300 shadow-[0_12px_28px_rgba(23,33,29,0.09)]" : "border-[var(--care-line)]"
    }`}>
      <div className="-mx-5 -mt-5 mb-5 flex items-center justify-between border-b border-[var(--care-teal-line)] bg-[var(--care-soft-teal)] px-5 py-3.5">
        <div className="text-xs font-bold uppercase text-[var(--care-brand-strong)]">Priority case</div>
        <div className="text-xs font-semibold text-[var(--care-brand)]">Needs attention</div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xl font-extrabold text-gray-950">
            {riskHeadlineText(item.headline)}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${risk.bg} ${risk.text}`}>{risk.label}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700">
            {statusLabel[item.status]}
          </span>
          <button
            type="button"
            onClick={() => setDetailsOpen((current) => !current)}
            aria-expanded={detailsOpen}
            className="min-h-10 rounded-lg bg-[var(--care-brand-strong)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--care-brand-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--care-brand)]"
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
      <div className="mt-5 rounded-lg border border-amber-200 border-l-[3px] border-l-amber-500 bg-amber-50 p-4">
        <div className="text-xs font-bold uppercase text-amber-800">Recommended next step</div>
        <div className="mt-1 text-base font-semibold text-gray-950">{fields.recommendedAction}</div>
      </div>
      {item.relatedPatterns.length > 0 && (
        <div className="mt-3 text-xs text-gray-600">
          <span className="font-semibold text-gray-500">Supporting patterns:</span>{" "}
          {item.relatedPatterns.map((pattern) => labelPattern(pattern.type)).join(", ")}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <CaseUpdateForm
          key={`${item.id}:${item.status}`}
          item={item}
          caregiverOptions={data.assignableCaregivers ?? []}
          authToken={authToken}
          disabled={disabled}
          onSaved={onSaved}
          onUnauthorized={onUnauthorized}
        />
      </div>
      {detailsOpen && (
        <div ref={timelineRef} tabIndex={-1} className="scroll-mt-4 outline-none">
          <CaseDetails item={item} data={data} briefing={briefing} />
        </div>
      )}
    </section>
  );
}
