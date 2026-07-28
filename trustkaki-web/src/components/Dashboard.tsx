"use client";

import { useState } from "react";
import type { BriefingOutput } from "@/lib/agents/contracts";
import type { ProactiveCheckInScheduleOverview } from "@/lib/checkins/contracts";
import type { SeniorContextReadModel } from "@/lib/api/schemas";
import type { AgentTrace, DashboardData, MaskedContactPlan } from "@/lib/types";
import {
  dashboardRefreshForVoidConsumer,
  followUpQueueForSenior,
  type DashboardRefresh,
} from "./dashboardViewModel";
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
import {
  mobileCareWorkspaceViews,
  type MobileCareWorkspaceView,
} from "./dashboard/careWorkspacePresentation";

interface DashboardProps {
  data: DashboardData;
  traces?: AgentTrace[];
  briefing?: BriefingOutput | null;
  onRefresh?: DashboardRefresh;
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
  const [demoTimelineRequest, setDemoTimelineRequest] = useState(0);
  const [mobileView, setMobileView] =
    useState<MobileCareWorkspaceView>("queue");
  const seniors = data.seniors ?? [];
  const selectedSeniorId = data.selectedSeniorId ?? seniors[0]?.id ?? null;
  const selectedSenior = seniors.find((senior) => senior.id === selectedSeniorId);
  const queue = followUpQueueForSenior(data.followUpQueue, selectedSeniorId);
  const refresh: DashboardRefresh = (seniorId) =>
    onRefresh?.(seniorId) ?? Promise.resolve(null);
  const refreshAfterCaseSave = dashboardRefreshForVoidConsumer(refresh);
  const unauthorized = () => onUnauthorized?.();
  const interactionsDisabled = !authToken;

  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto bg-[var(--care-paper)] text-[var(--care-ink)] lg:overflow-hidden">
      <MobileWorkspaceTabs selected={mobileView} onSelect={setMobileView} />
      <div className="mx-auto grid min-h-0 w-full max-w-[1760px] flex-1 lg:grid-cols-[210px_minmax(0,1fr)] lg:overflow-y-auto xl:grid-cols-[210px_minmax(0,1fr)_245px] xl:grid-rows-1 xl:overflow-hidden xl:border-x xl:border-[var(--care-line)] xl:bg-white">
        <aside
          id="care-workspace-people-panel"
          role="tabpanel"
          aria-labelledby="care-workspace-people-tab"
          className={`${mobileView === "people" ? "block" : "hidden"} min-w-0 bg-[var(--care-surface-muted)] p-3 lg:row-span-2 lg:block lg:border-r lg:border-[var(--care-line)] lg:p-4 xl:row-span-1 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain`}
        >
          <WorkspaceLabel eyebrow="Coverage" title="Senior roster" />
          <SeniorCoverage
            seniors={seniors}
            queue={data.followUpQueue}
            selectedSeniorId={selectedSeniorId}
            disabled={interactionsDisabled}
            onSelect={(seniorId) => onSelectSenior?.(seniorId)}
          />
        </aside>
        <section
          id="care-workspace-queue-panel"
          role="tabpanel"
          aria-labelledby="care-workspace-queue-tab"
          className={`${mobileView === "queue" ? "block" : "hidden"} min-w-0 space-y-4 bg-white p-3 sm:p-4 lg:col-start-2 lg:row-start-1 lg:block xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:p-5`}
        >
          <WorkspaceLabel eyebrow="Today" title="Care workspace" />
          <SelectedSeniorSummary senior={data.senior} selectedSenior={selectedSenior} />
          <DemoControls
            authToken={authToken ?? ""}
            visible={Boolean(isDemoAdmin && demoMode && authToken)}
            onRefresh={refresh}
            onDemoReady={() => setDemoTimelineRequest((request) => request + 1)}
            onUnauthorized={unauthorized}
          />
          <PriorityCase
            items={queue}
            data={data}
            briefing={briefing}
            authToken={authToken ?? ""}
            disabled={interactionsDisabled}
            openTimelineRequest={demoTimelineRequest}
            onSaved={refreshAfterCaseSave}
            onUnauthorized={unauthorized}
          />
        </section>
        <aside
          id="care-workspace-context-panel"
          role="tabpanel"
          aria-labelledby="care-workspace-context-tab"
          className={`${mobileView === "context" ? "block" : "hidden"} min-w-0 space-y-3 bg-[var(--care-surface-muted)] p-3 sm:p-4 lg:col-start-2 lg:row-start-2 lg:block lg:border-t lg:border-[var(--care-line)] xl:col-start-3 xl:row-start-1 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:border-l xl:border-t-0 xl:p-5`}
        >
          <WorkspaceLabel eyebrow="Selected senior" title="Supporting care" />
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

function MobileWorkspaceTabs({
  selected,
  onSelect,
}: {
  selected: MobileCareWorkspaceView;
  onSelect: (view: MobileCareWorkspaceView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Care workspace views"
      className="grid shrink-0 grid-cols-3 border-b border-[var(--care-line)] bg-white lg:hidden"
    >
      {mobileCareWorkspaceViews.map((view) => {
        const active = selected === view.id;

        return (
          <button
            key={view.id}
            id={`care-workspace-${view.id}-tab`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`care-workspace-${view.id}-panel`}
            onClick={() => onSelect(view.id)}
            className={`min-h-11 border-b-2 px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--care-brand)] ${
              active
                ? "border-b-[var(--care-coral)] text-[var(--care-ink)]"
                : "border-b-transparent text-gray-600"
            }`}
          >
            {view.label}
          </button>
        );
      })}
    </div>
  );
}

function WorkspaceLabel({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-3 hidden border-b border-[var(--care-line)] pb-3 xl:block">
      <div className="text-[10px] font-bold uppercase text-[var(--care-brand)]">
        {eyebrow}
      </div>
      <h2 className="mt-1 text-sm font-extrabold text-[var(--care-ink)]">{title}</h2>
    </div>
  );
}
