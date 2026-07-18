"use client";

import type { BriefingOutput } from "@/lib/agents/contracts";
import type { ProactiveCheckInScheduleOverview } from "@/lib/checkins/contracts";
import type { SeniorContextReadModel } from "@/lib/api/schemas";
import type { AgentTrace, DashboardData, MaskedContactPlan } from "@/lib/types";
import { followUpQueueForSenior } from "./dashboardViewModel";
import { DemoControls } from "./dashboard/DemoControls";
import { PriorityCase } from "./dashboard/PriorityCase";
import { SelectedSeniorSummary } from "./dashboard/SelectedSeniorSummary";
import { SeniorCoverage } from "./dashboard/SeniorCoverage";
import {
  ContactPlanPanel,
  contactPlanInstanceKey,
} from "./dashboard/ContactPlanPanel";
import { ProactiveCheckInPanel } from "./dashboard/ProactiveCheckInPanel";
import { SeniorContextPanel } from "./dashboard/SeniorContextPanel";

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
  contactPlan?: MaskedContactPlan | null;
  contactPlanLoading?: boolean;
  contactPlanError?: string | null;
  onRefreshContactPlan?: () => void;
  checkInSchedule?: ProactiveCheckInScheduleOverview | null;
  checkInScheduleLoading?: boolean;
  checkInScheduleError?: string | null;
  onRefreshCheckInSchedule?: () => void;
  seniorContext?: SeniorContextReadModel | null;
  seniorContextLoading?: boolean;
  seniorContextError?: string | null;
  onSeniorContextChanged?: (context: SeniorContextReadModel) => void;
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
  contactPlan = null,
  contactPlanLoading = false,
  contactPlanError = null,
  onRefreshContactPlan,
  checkInSchedule = null,
  checkInScheduleLoading = false,
  checkInScheduleError = null,
  onRefreshCheckInSchedule,
  seniorContext = null,
  seniorContextLoading = false,
  seniorContextError = null,
  onSeniorContextChanged,
}: DashboardProps) {
  const seniors = data.seniors ?? [];
  const selectedSeniorId = data.selectedSeniorId ?? seniors[0]?.id ?? null;
  const selectedSenior = seniors.find((senior) => senior.id === selectedSeniorId);
  const queue = followUpQueueForSenior(data.followUpQueue, selectedSeniorId);
  const refresh = () => onRefresh?.();
  const unauthorized = () => onUnauthorized?.();
  const interactionsDisabled = !authToken;

  return (
    <main className="h-full overflow-y-auto bg-[var(--care-paper)] text-[var(--care-ink)]">
      <div className="mx-auto grid min-h-full w-full max-w-[1600px] gap-4 p-3 sm:p-4 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_18rem] xl:gap-5 xl:p-5">
        <aside className="min-w-0 lg:row-span-2 xl:sticky xl:top-5 xl:h-[calc(100vh-6.5rem)]">
          <SeniorCoverage
            seniors={seniors}
            queue={data.followUpQueue}
            selectedSeniorId={selectedSeniorId}
            disabled={interactionsDisabled}
            onSelect={(seniorId) => onSelectSenior?.(seniorId)}
          />
        </aside>
        <section className="min-w-0 space-y-4">
          <SelectedSeniorSummary senior={data.senior} selectedSenior={selectedSenior} />
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
          <DemoControls
            authToken={authToken ?? ""}
            visible={Boolean(isDemoAdmin && demoMode && authToken)}
            onRefresh={refresh}
            onUnauthorized={unauthorized}
          />
        </section>
        <aside className="min-w-0 space-y-3 lg:col-start-2 xl:col-start-3 xl:row-start-1">
          <SeniorContextPanel
            key={`senior-context:${selectedSeniorId ?? "none"}`}
            context={seniorContext}
            loading={seniorContextLoading}
            error={seniorContextError}
            isAdmin={isDemoAdmin}
            seniorId={selectedSeniorId}
            authToken={authToken ?? ""}
            onChanged={(context) => onSeniorContextChanged?.(context)}
            onUnauthorized={unauthorized}
          />
          <ProactiveCheckInPanel
            key={`proactive-check-in:${selectedSeniorId ?? "none"}`}
            overview={checkInSchedule}
            loading={checkInScheduleLoading}
            error={checkInScheduleError}
            isAdmin={isDemoAdmin}
            seniorId={selectedSeniorId}
            authToken={authToken ?? ""}
            onSaved={() => onRefreshCheckInSchedule?.()}
            onUnauthorized={unauthorized}
          />
          <ContactPlanPanel
            key={contactPlanInstanceKey(selectedSeniorId)}
            plan={contactPlan}
            loading={contactPlanLoading}
            error={contactPlanError}
            isAdmin={isDemoAdmin}
            seniorId={selectedSeniorId}
            authToken={authToken ?? ""}
            onSaved={() => onRefreshContactPlan?.()}
            onUnauthorized={unauthorized}
          />
        </aside>
      </div>
    </main>
  );
}
