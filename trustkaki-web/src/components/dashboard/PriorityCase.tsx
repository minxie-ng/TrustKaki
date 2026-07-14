"use client";

import { useState } from "react";
import type { BriefingOutput } from "@/lib/agents/contracts";
import type { AgentTrace, DashboardData, FollowUpQueueItem } from "@/lib/types";
import { mainQueueCardFields } from "../dashboardViewModel";
import { CaseDetails } from "./CaseDetails";
import { CaseUpdateForm } from "./CaseUpdateForm";
import { formatDate, labelPattern, riskConfig, statusLabel } from "./presentation";

interface PriorityCaseProps {
  items: FollowUpQueueItem[];
  data: DashboardData;
  traces: AgentTrace[];
  briefing?: BriefingOutput | null;
  authToken: string;
  disabled: boolean;
  onSaved: () => void;
  onUnauthorized: () => void;
}

export function PriorityCase({
  items,
  data,
  traces,
  briefing,
  authToken,
  disabled,
  onSaved,
  onUnauthorized,
}: PriorityCaseProps) {
  if (items.length === 0) {
    const risk = riskConfig[data.senior.riskLevel];
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="font-semibold text-gray-900">
          {data.senior.name} does not currently require follow-up.
        </div>
        <p className="mt-1 text-sm text-gray-600">
          No active priority case is open for this selected senior.
        </p>
        {data.senior.riskLevel !== "green" && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
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

  return items.map((item) => (
    <PriorityCaseCard
      key={item.id}
      item={item}
      data={data}
      traces={traces}
      briefing={briefing}
      authToken={authToken}
      disabled={disabled}
      onSaved={onSaved}
      onUnauthorized={onUnauthorized}
    />
  ));
}

function PriorityCaseCard({
  item,
  data,
  traces,
  briefing,
  authToken,
  disabled,
  onSaved,
  onUnauthorized,
}: Omit<PriorityCaseProps, "items"> & { item: FollowUpQueueItem }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const risk = riskConfig[item.riskLevel];
  const fields = mainQueueCardFields(item);

  return (
    <section className={`rounded-2xl border border-l-4 bg-white p-6 shadow-sm ${risk.border} ${
      detailsOpen ? "border-gray-300 shadow-md" : "border-gray-200"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Priority case</div>
          <h3 className="mt-1 text-2xl font-bold text-gray-950">{fields.seniorName}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${risk.bg} ${risk.text}`}>{risk.label}</span>
            <span className="text-sm font-medium text-gray-700">{item.headline}</span>
          </div>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-700">
          {statusLabel[item.status]}
        </span>
      </div>
      <div className="mt-6 grid gap-5 text-sm md:grid-cols-2">
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
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="text-xs font-semibold text-gray-500">Suggested action</div>
        <div className="mt-1 text-base font-semibold text-gray-950">{fields.recommendedAction}</div>
      </div>
      {item.relatedPatterns.length > 0 && (
        <div className="mt-3 text-xs text-gray-600">
          <span className="font-semibold text-gray-500">Supporting patterns:</span>{" "}
          {item.relatedPatterns.map((pattern) => labelPattern(pattern.type)).join(", ")}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDetailsOpen((current) => !current)}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
        >
          {detailsOpen ? "Hide details" : "View details"}
        </button>
        <CaseUpdateForm
          item={item}
          caregiverOptions={data.assignableCaregivers ?? []}
          authToken={authToken}
          disabled={disabled}
          onSaved={onSaved}
          onUnauthorized={onUnauthorized}
        />
      </div>
      {detailsOpen && (
        <CaseDetails item={item} data={data} traces={traces} briefing={briefing} />
      )}
    </section>
  );
}
