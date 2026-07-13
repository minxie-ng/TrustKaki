"use client";

import type { BriefingOutput } from "@/lib/agents/contracts";
import type { AgentTrace, DashboardData } from "@/lib/types";
import { followUpQueueForSenior } from "./dashboardViewModel";
import { DemoControls } from "./dashboard/DemoControls";
import { PriorityCase } from "./dashboard/PriorityCase";
import { SelectedSeniorSummary } from "./dashboard/SelectedSeniorSummary";
import { SeniorCoverage } from "./dashboard/SeniorCoverage";

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
  const seniors = data.seniors ?? [];
  const selectedSeniorId = data.selectedSeniorId ?? seniors[0]?.id ?? null;
  const selectedSenior = seniors.find((senior) => senior.id === selectedSeniorId);
  const queue = followUpQueueForSenior(data.followUpQueue, selectedSeniorId);
  const refresh = () => onRefresh?.();
  const unauthorized = () => onUnauthorized?.();
  const interactionsDisabled = !authToken;

  return (
    <main className="flex h-full flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Today&apos;s follow-up queue
        </div>
        <h2 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
          Who needs human attention?
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Prioritised by risk, pattern changes, response gaps, and unresolved follow-up.
        </p>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
          <SeniorCoverage
            seniors={seniors}
            selectedSeniorId={selectedSeniorId}
            disabled={interactionsDisabled}
            onSelect={(seniorId) => onSelectSenior?.(seniorId)}
          />
          <SelectedSeniorSummary senior={data.senior} selectedSenior={selectedSenior} />
          <DemoControls
            authToken={authToken ?? ""}
            visible={Boolean(isDemoAdmin && demoMode && authToken)}
            onRefresh={refresh}
            onUnauthorized={unauthorized}
          />
          <PriorityCase
            items={queue}
            data={data}
            traces={traces}
            briefing={briefing}
            authToken={authToken ?? ""}
            disabled={interactionsDisabled}
            onSaved={refresh}
            onUnauthorized={unauthorized}
          />
          <div className="px-1 text-xs text-gray-500">
            Current profile: {data.senior.name}, {data.senior.age}. This queue is
            operational guidance only and does not provide medical diagnosis.
          </div>
        </div>
      </div>
    </main>
  );
}
