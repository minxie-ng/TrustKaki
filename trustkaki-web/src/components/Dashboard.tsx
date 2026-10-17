"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import type { BriefingOutput } from "@/lib/agents/contracts";
import type { ProactiveCheckInScheduleOverview } from "@/lib/checkins/contracts";
import type { SeniorContextReadModel } from "@/lib/api/schemas";
import type { AgentTrace, DashboardData, MaskedContactPlan } from "@/lib/types";
import {
  dashboardRefreshForVoidConsumer,
  followUpQueueForSenior,
  type DashboardRefresh,
} from "./dashboardViewModel";
import { PriorityCase } from "./dashboard/PriorityCase";
import { SelectedSeniorSummary } from "./dashboard/SelectedSeniorSummary";
import { SeniorCoverage } from "./dashboard/SeniorCoverage";
import { SeniorContextPanel } from "./dashboard/SeniorContextPanel";
import { ContextPreview } from "./dashboard/ContextPreview";
import { CareSetupDrawer } from "./dashboard/CareSetupDrawer";
import {
  mobileTabsActiveForDesktopMatch,
  mobileCareWorkspaceViews,
  nextMobileCareWorkspaceView,
  type MobileCareWorkspaceView,
} from "./dashboard/careWorkspacePresentation";

interface DashboardProps {
  data: DashboardData;
  traces?: AgentTrace[];
  briefing?: BriefingOutput | null;
  onRefresh?: DashboardRefresh;
  authToken: string | null;
  isDemoAdmin?: boolean;
  guideLocked?: boolean;
  openTimelineRequest?: number;
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
  careSetupOpen?: boolean;
  onCloseCareSetup?: () => void;
  onViewActivity?: () => void;
}

export default function Dashboard({
  data,
  briefing,
  onRefresh,
  authToken,
  isDemoAdmin = false,
  guideLocked = false,
  openTimelineRequest = 0,
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
  careSetupOpen = false,
  onCloseCareSetup,
  onViewActivity,
}: DashboardProps) {
  const [mobileView, setMobileView] =
    useState<MobileCareWorkspaceView>("queue");
  const [mobileTabsActive, setMobileTabsActive] = useState(true);
  const seniors = data.seniors ?? [];
  const selectedSeniorId = data.selectedSeniorId ?? seniors[0]?.id ?? null;
  const selectedSenior = seniors.find((senior) => senior.id === selectedSeniorId);
  const queue = followUpQueueForSenior(data.followUpQueue, selectedSeniorId);
  const refresh: DashboardRefresh = (seniorId) =>
    onRefresh?.(seniorId) ?? Promise.resolve(null);
  const refreshAfterCaseSave = dashboardRefreshForVoidConsumer(refresh);
  const refreshAfterCaseConflict = async () => {
    const refreshed = await refresh(selectedSeniorId);
    if (!refreshed) throw new Error("dashboard_conflict_refresh_failed");
  };
  const unauthorized = () => onUnauthorized?.();
  const interactionsDisabled = !authToken || guideLocked;

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const syncMobileTabs = () =>
      setMobileTabsActive(
        mobileTabsActiveForDesktopMatch(desktopQuery.matches)
      );

    syncMobileTabs();
    desktopQuery.addEventListener("change", syncMobileTabs);
    return () => desktopQuery.removeEventListener("change", syncMobileTabs);
  }, []);

  return (
    <>
      <main className="flex h-full min-h-0 flex-col overflow-y-auto bg-[var(--care-mist)] text-[var(--care-ink)] lg:overflow-hidden">
        <MobileWorkspaceTabs selected={mobileView} onSelect={setMobileView} />
        <div className="mx-auto grid min-h-0 w-full flex-1 lg:grid-cols-[240px_minmax(0,1fr)] lg:overflow-y-auto xl:grid-cols-[240px_minmax(0,1fr)_292px] xl:grid-rows-1 xl:overflow-hidden ">
        <aside
          id="care-workspace-people-panel"
          role={mobileTabsActive ? "tabpanel" : undefined}
          aria-labelledby={
            mobileTabsActive ? "care-workspace-people-tab" : undefined
          }
          className={`${mobileView === "people" ? "block" : "hidden"} min-w-0 bg-[var(--care-surface-muted)] p-3 lg:row-span-2 lg:block lg:border-r lg:border-[var(--care-line)] lg:p-4 xl:row-span-1 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain`}
        >
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
          role={mobileTabsActive ? "tabpanel" : undefined}
          aria-labelledby={
            mobileTabsActive ? "care-workspace-queue-tab" : undefined
          }
          className={`${mobileView === "queue" ? "block" : "hidden"} min-w-0 space-y-5 p-4 sm:p-6 lg:col-start-2 lg:row-start-1 lg:block xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:p-6`}
        >
          <WorkspaceLabel
            eyebrow="Your care desk"
            title="Review changes and plan your next check-in."
            actionLabel="Activity"
            onAction={onViewActivity}
          />
          <SelectedSeniorSummary senior={data.senior} selectedSenior={selectedSenior} />
          <PriorityCase
            items={queue}
            data={data}
            briefing={briefing}
            authToken={authToken ?? ""}
            disabled={interactionsDisabled}
            guideLocked={guideLocked}
            openTimelineRequest={openTimelineRequest}
            onSaved={refreshAfterCaseSave}
            onConflictRefresh={refreshAfterCaseConflict}
            onUnauthorized={unauthorized}
          />
        </section>
        <aside
          id="care-workspace-context-panel"
          role={mobileTabsActive ? "tabpanel" : undefined}
          aria-labelledby={
            mobileTabsActive ? "care-workspace-context-tab" : undefined
          }
          className={`${mobileView === "context" ? "block" : "hidden"} min-w-0 space-y-4 p-4 sm:p-5 lg:col-start-2 lg:row-start-2 lg:block lg:border-t lg:border-[var(--care-line)] xl:col-start-3 xl:row-start-1 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:border-t-0 xl:p-6`}
        >
          <ContextPreview
            key={selectedSeniorId}
            context={seniorContext}
            seniorId={selectedSeniorId}
            loading={seniorContextLoading}
            error={seniorContextError}
          >
            <SeniorContextPanel
              key={selectedSeniorId}
              context={seniorContext?.seniorId === selectedSeniorId ? seniorContext : null}
              loading={seniorContextLoading}
              error={seniorContextError}
              isAdmin={isDemoAdmin && !guideLocked}
              seniorId={selectedSeniorId}
              authToken={authToken ?? ""}
              onChanged={(context) => onSeniorContextChanged?.(context)}
              onUnauthorized={unauthorized}
              initiallyOpen
            />
          </ContextPreview>
          <h2 className="pt-2 text-sm font-semibold text-[var(--care-ink)]">Care contacts</h2>
          <dl className="divide-y divide-[var(--care-line)] border-y border-[var(--care-line)] text-sm">
            <ContextRow label="Primary caregiver" value={selectedSenior?.primaryCaregiver ?? data.senior.caregiver} />
            <ContextRow label="AAC contact" value={selectedSenior?.aacVolunteer ?? data.senior.aacVolunteer} />
          </dl>
        </aside>
        </div>
      </main>
      <CareSetupDrawer
        open={careSetupOpen && !guideLocked}
        onClose={() => onCloseCareSetup?.()}
        selectedSeniorId={selectedSeniorId}
        authToken={authToken ?? ""}
        isAdmin={isDemoAdmin}
        seniorContext={seniorContext}
        seniorContextLoading={seniorContextLoading}
        seniorContextError={seniorContextError}
        onSeniorContextChanged={(context) => onSeniorContextChanged?.(context)}
        contactPlan={contactPlan}
        contactPlanLoading={contactPlanLoading}
        contactPlanError={contactPlanError}
        onRefreshContactPlan={() => onRefreshContactPlan?.()}
        checkInSchedule={checkInSchedule}
        checkInScheduleLoading={checkInScheduleLoading}
        checkInScheduleError={checkInScheduleError}
        onRefreshCheckInSchedule={() => onRefreshCheckInSchedule?.()}
        onUnauthorized={unauthorized}
      />
    </>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-3">
      <dt className="text-sm font-semibold text-gray-600">{label}</dt>
      <dd className="text-gray-900">{value}</dd>
    </div>
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
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(view.id)}
            onKeyDown={(event) =>
              handleMobileWorkspaceTabKeyDown(event, view.id, onSelect)
            }
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

function handleMobileWorkspaceTabKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  current: MobileCareWorkspaceView,
  onSelect: (view: MobileCareWorkspaceView) => void
) {
  const next = nextMobileCareWorkspaceView(current, event.key);
  if (!next) return;

  event.preventDefault();
  onSelect(next);
  event.currentTarget.ownerDocument
    .getElementById(`care-workspace-${next}-tab`)
    ?.focus();
}

function WorkspaceLabel({
  eyebrow,
  title,
  actionLabel,
  onAction,
}: {
  eyebrow: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mb-1 flex items-center justify-between gap-3 py-2">
      <div>
        <div className="font-display text-xl font-bold text-[var(--care-brand)]">
          {eyebrow}
        </div>
        <h2 className="mt-1 text-sm text-gray-600">{title}</h2>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="min-h-11 text-sm font-semibold text-[var(--care-brand)] hover:underline"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
