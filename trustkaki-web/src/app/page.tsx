"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import AppShell, { type AppView } from "@/components/AppShell";
import ChatSimulation from "@/components/ChatSimulation";
import Dashboard from "@/components/Dashboard";
import { CareActivity } from "@/components/dashboard/CareActivity";
import { DemoGuide } from "@/components/dashboard/DemoGuide";
import {
  demoGuideComposition,
  type DemoPhase,
} from "@/components/dashboard/demoGuideState";
import AgentTracePanel from "@/components/AgentTracePanel";
import OperationalState from "@/components/OperationalState";
import SignInForm from "@/components/SignInForm";
import PublicDemoWorkspace from "@/components/PublicDemoWorkspace";
import { restorePublicDemo, PUBLIC_DEMO_STORAGE_KEY } from "@/lib/publicDemoState";
import { authHeader, canShowDemoControls, publicUserRole } from "@/lib/auth/client";
import { createTrustKakiBrowserClient } from "@/lib/supabase/browser";
import { subscribeToDashboardChanges } from "@/lib/supabase/dashboardRealtime";
import {
  appShellSurface,
  chatSimulationState,
  dashboardStateEndpoint,
  dashboardSyncIntervalMs,
  fireAndForgetDashboardRefresh,
  followUpQueueForSenior,
  optimisticDashboardForSenior,
  refreshDashboardAuthoritatively,
  shouldPollDashboard,
} from "@/components/dashboardViewModel";
import type { BriefingOutput } from "@/lib/agents/contracts";
import type { ProactiveCheckInScheduleOverview } from "@/lib/checkins/contracts";
import type { SeniorContextReadModel } from "@/lib/api/schemas";
import type { AgentTrace, DashboardData, MaskedContactPlan, RiskLevel } from "@/lib/types";

interface DashboardStateResponse {
  persistence?: {
    mode: "supabase" | "local_demo";
    configured: boolean;
    persisted: boolean;
  };
  data: DashboardData;
  traces: AgentTrace[];
  briefing: BriefingOutput | null;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("green");
  const [activeView, setActiveView] = useState<AppView>("workspace");
  const [careSetupOpen, setCareSetupOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [publicDemo, setPublicDemo] = useState(false);
  const [publicDemoDocument, setPublicDemoDocument] = useState<ReturnType<typeof restorePublicDemo>>(null);
  const [demoPhase, setDemoPhase] = useState<DemoPhase>("orientation");
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoTimelineRequest, setDemoTimelineRequest] = useState(0);
  const [reasoningVisible, setReasoningVisible] = useState(false);
  const [liveDashboardData, setLiveDashboardData] =
    useState<DashboardData | null>(null);
  const [liveTraces, setLiveTraces] = useState<AgentTrace[]>([]);
  const [liveBriefing, setLiveBriefing] = useState<BriefingOutput | null>(null);
  const [loadedSeniorId, setLoadedSeniorId] = useState<string | null>(null);
  const [loadingSeniorId, setLoadingSeniorId] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [contactPlan, setContactPlan] = useState<MaskedContactPlan | null>(null);
  const [contactPlanLoading, setContactPlanLoading] = useState(false);
  const [contactPlanError, setContactPlanError] = useState<string | null>(null);
  const [checkInSchedule, setCheckInSchedule] =
    useState<ProactiveCheckInScheduleOverview | null>(null);
  const [checkInScheduleLoading, setCheckInScheduleLoading] = useState(false);
  const [checkInScheduleError, setCheckInScheduleError] = useState<string | null>(null);
  const [seniorContext, setSeniorContext] =
    useState<SeniorContextReadModel | null>(null);
  const [seniorContextLoading, setSeniorContextLoading] = useState(false);
  const [seniorContextError, setSeniorContextError] = useState<string | null>(null);
  const selectedSeniorIdRef = useRef<string | null>(null);
  const dashboardRequestSeq = useRef(0);
  const contactPlanRequestSeq = useRef(0);
  const checkInScheduleRequestSeq = useRef(0);
  const seniorContextRequestSeq = useRef(0);
  const authToken = session?.access_token ?? null;
  const role = publicUserRole(user);
  const isDemoAdmin = canShowDemoControls({ role });
  const guideActive = Boolean(
    isDemoAdmin && demoMode && demoPhase !== "exited"
  );
  const guideComposition = demoGuideComposition({
    activeView,
    enabled: guideActive,
    phase: demoPhase,
  });
  const surface = appShellSurface({ isDemoAdmin, demoMode, guideActive });
  const latestSession = liveDashboardData?.activeSessions[0];
  const chatMessages = latestSession?.messages ?? [];
  const selectedSeniorId = liveDashboardData?.selectedSeniorId ?? null;
  const chatState = chatSimulationState({
    selectedSeniorId,
    loadedSeniorId,
    isSeniorLoading: loadingSeniorId === selectedSeniorId,
  });

  const handleUnauthorized = useCallback(() => {
    const client = createTrustKakiBrowserClient();
    void client?.auth.signOut();
    setSession(null);
    setUser(null);
    setDemoMode(false);
    setDemoPhase("exited");
    setDemoError(null);
    setReasoningVisible(false);
    setAuthError("Please sign in again to continue.");
  }, []);

  const refreshDashboardState = useCallback(async (
    nextSeniorId?: string | null
  ): Promise<DashboardData | null> => {
    if (!authToken) return null;
    const requestId = dashboardRequestSeq.current + 1;
    dashboardRequestSeq.current = requestId;
    setDashboardError(null);
    try {
      const response = await fetch(
        dashboardStateEndpoint(nextSeniorId ?? selectedSeniorIdRef.current),
        {
          cache: "no-store",
          headers: authHeader(authToken),
        }
      );
      if (response.status === 401) {
        handleUnauthorized();
        return null;
      }
      if (!response.ok) throw new Error("dashboard_request_failed");
      const state = (await response.json()) as DashboardStateResponse;
      if (requestId !== dashboardRequestSeq.current) return null;
      setLiveDashboardData(state.data);
      setLiveTraces(state.traces);
      setLiveBriefing(state.briefing ?? null);
      setRiskLevel(state.data.senior.riskLevel);
      const nextSelectedSeniorId = state.data.selectedSeniorId ?? null;
      selectedSeniorIdRef.current = nextSelectedSeniorId;
      setLoadedSeniorId(nextSelectedSeniorId);
      setLoadingSeniorId((current) =>
        current === nextSelectedSeniorId ? null : current
      );
      return state.data;
    } catch (error) {
      console.error("Failed to hydrate dashboard state:", error);
      if (requestId === dashboardRequestSeq.current) {
        setDashboardError("TrustKaki could not load the caregiver dashboard. Please retry.");
      }
      throw error;
    }
  }, [authToken, handleUnauthorized]);

  const requestDashboardRefresh = useCallback((nextSeniorId?: string | null) => {
    fireAndForgetDashboardRefresh(refreshDashboardState, nextSeniorId);
  }, [refreshDashboardState]);

  const refreshDashboardForConsumer = useCallback(
    (nextSeniorId?: string | null) =>
      refreshDashboardAuthoritatively(refreshDashboardState, nextSeniorId),
    [refreshDashboardState]
  );

  const refreshContactPlan = useCallback((nextSeniorId?: string | null) => {
    if (!authToken) return;
    const seniorId = nextSeniorId ?? selectedSeniorIdRef.current;
    if (!seniorId) return;
    const requestId = contactPlanRequestSeq.current + 1;
    contactPlanRequestSeq.current = requestId;
    setContactPlanLoading(true);
    setContactPlanError(null);
    void fetch(`/api/seniors/${seniorId}/contact-plan`, {
      cache: "no-store",
      headers: authHeader(authToken),
    }).then(async (response) => {
      if (response.status === 401) {
        handleUnauthorized();
        return null;
      }
      if (!response.ok) throw new Error("contact_plan_request_failed");
      return (await response.json()) as { contactPlan: MaskedContactPlan };
    }).then((result) => {
      if (requestId !== contactPlanRequestSeq.current || !result) return;
      setContactPlan(result.contactPlan);
    }).catch(() => {
      if (requestId === contactPlanRequestSeq.current) {
        setContactPlanError("Contact plan is temporarily unavailable.");
      }
    }).finally(() => {
      if (requestId === contactPlanRequestSeq.current) setContactPlanLoading(false);
    });
  }, [authToken, handleUnauthorized]);

  const refreshCheckInSchedule = useCallback((nextSeniorId?: string | null) => {
    if (!authToken || !isDemoAdmin) return;
    const seniorId = nextSeniorId ?? selectedSeniorIdRef.current;
    if (!seniorId) return;
    const requestId = checkInScheduleRequestSeq.current + 1;
    checkInScheduleRequestSeq.current = requestId;
    setCheckInScheduleLoading(true);
    setCheckInScheduleError(null);
    void fetch(`/api/admin/seniors/${encodeURIComponent(seniorId)}/check-in-schedule`, {
      cache: "no-store",
      headers: authHeader(authToken),
    }).then(async (response) => {
      if (response.status === 401) {
        handleUnauthorized();
        return null;
      }
      if (!response.ok) throw new Error("check_in_schedule_request_failed");
      return (await response.json()) as { schedule: ProactiveCheckInScheduleOverview };
    }).then((result) => {
      if (requestId !== checkInScheduleRequestSeq.current || !result) return;
      setCheckInSchedule(result.schedule);
    }).catch(() => {
      if (requestId === checkInScheduleRequestSeq.current) {
        setCheckInScheduleError("Check-in schedule is temporarily unavailable.");
      }
    }).finally(() => {
      if (requestId === checkInScheduleRequestSeq.current) {
        setCheckInScheduleLoading(false);
      }
    });
  }, [authToken, handleUnauthorized, isDemoAdmin]);

  const refreshSeniorContext = useCallback((nextSeniorId?: string | null) => {
    if (!authToken) return;
    const seniorId = nextSeniorId ?? selectedSeniorIdRef.current;
    if (!seniorId) return;
    const requestId = seniorContextRequestSeq.current + 1;
    seniorContextRequestSeq.current = requestId;
    setSeniorContextLoading(true);
    setSeniorContextError(null);
    void fetch(`/api/seniors/${encodeURIComponent(seniorId)}/context`, {
      cache: "no-store",
      headers: authHeader(authToken),
    }).then(async (response) => {
      if (response.status === 401) {
        handleUnauthorized();
        return null;
      }
      if (!response.ok) throw new Error("senior_context_request_failed");
      return (await response.json()) as { context: SeniorContextReadModel };
    }).then((result) => {
      if (requestId !== seniorContextRequestSeq.current || !result) return;
      setSeniorContext(result.context);
    }).catch(() => {
      if (requestId === seniorContextRequestSeq.current) {
        setSeniorContextError("Known context is temporarily unavailable.");
      }
    }).finally(() => {
      if (requestId === seniorContextRequestSeq.current) {
        setSeniorContextLoading(false);
      }
    });
  }, [authToken, handleUnauthorized]);

  const selectSenior = useCallback(
    (seniorId: string) => {
      setCareSetupOpen(false);
      selectedSeniorIdRef.current = seniorId;
      setLoadingSeniorId(seniorId);
      setContactPlan(null);
      setContactPlanLoading(true);
      setCheckInSchedule(null);
      setCheckInScheduleLoading(isDemoAdmin);
      setSeniorContext(null);
      setSeniorContextLoading(true);
      setLiveDashboardData((current) =>
        current ? optimisticDashboardForSenior(current, seniorId) : current
      );
      requestDashboardRefresh(seniorId);
    },
    [isDemoAdmin, requestDashboardRefresh]
  );

  useEffect(() => {
    const client = createTrustKakiBrowserClient();
    if (!client) {
      queueMicrotask(() => {
        setAuthLoading(false);
        setAuthError("Supabase browser configuration is missing.");
      });
      return;
    }

    void client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
      if (!data.session) {
        try {
          const restored = restorePublicDemo(window.sessionStorage.getItem(PUBLIC_DEMO_STORAGE_KEY));
          if (restored) { setPublicDemoDocument(restored); setPublicDemo(true); }
        } catch { /* public demo can start clean if storage is unavailable */ }
      }
    });

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setAuthError(null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  function enterPublicDemo() {
    setPublicDemo(true);
    setPublicDemoDocument(restorePublicDemo(typeof window === "undefined" ? null : window.sessionStorage.getItem(PUBLIC_DEMO_STORAGE_KEY)));
  }

  useEffect(() => {
    if (!authToken) return;

    const refreshIfVisible = () => {
      if (
        shouldPollDashboard({
          hasAuthToken: Boolean(authToken),
          visibilityState: document.visibilityState,
        })
      ) {
        requestDashboardRefresh();
      }
    };

    const initialTimer = window.setTimeout(refreshIfVisible, 0);
    const interval = window.setInterval(
      refreshIfVisible,
      dashboardSyncIntervalMs
    );

    window.addEventListener("focus", refreshIfVisible);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [authToken, requestDashboardRefresh]);

  useEffect(() => {
    if (!authToken) return;
    const subscription = subscribeToDashboardChanges({
      onChange: () => {
        requestDashboardRefresh();
        refreshContactPlan();
        refreshCheckInSchedule();
        refreshSeniorContext();
      },
    });
    return () => subscription?.unsubscribe();
  }, [
    authToken,
    refreshCheckInSchedule,
    refreshContactPlan,
    requestDashboardRefresh,
    refreshSeniorContext,
  ]);

  useEffect(() => {
    if (authToken && selectedSeniorId) refreshContactPlan(selectedSeniorId);
  }, [authToken, refreshContactPlan, selectedSeniorId]);

  useEffect(() => {
    if (authToken && isDemoAdmin && selectedSeniorId) {
      refreshCheckInSchedule(selectedSeniorId);
    }
  }, [authToken, isDemoAdmin, refreshCheckInSchedule, selectedSeniorId]);

  useEffect(() => {
    if (authToken && selectedSeniorId) refreshSeniorContext(selectedSeniorId);
  }, [authToken, refreshSeniorContext, selectedSeniorId]);

  async function signIn(email: string, password: string) {
    const client = createTrustKakiBrowserClient();
    if (!client) {
      setAuthError("Supabase browser configuration is missing.");
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    setAuthBusy(false);
    if (error || !data.session) {
      setAuthError("Unable to sign in with those credentials.");
      return;
    }
    setSession(data.session);
    setUser(data.user);
  }

  async function signOut() {
    const client = createTrustKakiBrowserClient();
    await client?.auth.signOut();
    setSession(null);
    setUser(null);
    setDemoMode(false);
    setDemoPhase("exited");
    setDemoError(null);
    setActiveView("workspace");
    setCareSetupOpen(false);
    setReasoningVisible(false);
    setLiveDashboardData(null);
    setLiveTraces([]);
    setLiveBriefing(null);
    setContactPlan(null);
    setCheckInSchedule(null);
    setSeniorContext(null);
    selectedSeniorIdRef.current = null;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen">
        <OperationalState kind="loading" message="Loading TrustKaki..." />
      </div>
    );
  }

  if (!authToken) {
    if (publicDemo) return <PublicDemoWorkspace initialDocument={publicDemoDocument ?? undefined} onExit={() => { try { window.sessionStorage.removeItem(PUBLIC_DEMO_STORAGE_KEY); } catch {} setPublicDemo(false); setPublicDemoDocument(null); }} />;
    return (
      <SignInForm onSignIn={signIn} onExploreDemo={enterPublicDemo} disabled={authBusy} error={authError} />
    );
  }

  return (
    <AppShell
      activeView={activeView}
      isDemoAdmin={isDemoAdmin}
      riskLevel={riskLevel}
      onViewChange={(view) => {
        setCareSetupOpen(false);
        setActiveView(view);
      }}
      onOpenSetup={() => {
        setActiveView("workspace");
        setCareSetupOpen(true);
      }}
      onSignOut={signOut}
      demoMode={demoMode}
      guidedDemoPhase={guideActive ? demoPhase : undefined}
      onDemoModeChange={(enabled) => {
        setDemoMode(enabled);
        setDemoPhase(enabled ? "orientation" : "exited");
        setDemoError(null);
        setActiveView("workspace");
        setCareSetupOpen(false);
        if (!enabled) setReasoningVisible(false);
      }}
    >
      <div className="flex h-full overflow-hidden">
        {surface.showChatSimulator && (
          <div className="hidden flex-1 flex-col border-r border-[var(--care-line)] md:flex md:max-w-md">
            <div className="min-h-0 flex-1">
              <ChatSimulation
                key={chatState.instanceKey}
                messages={chatMessages}
                seniorId={chatState.submissionSeniorId}
                isSeniorLoading={!chatState.canSubmit && Boolean(selectedSeniorId)}
                onComplete={requestDashboardRefresh}
                authToken={authToken}
                onUnauthorized={handleUnauthorized}
              />
            </div>
            {surface.showReasoningRail && (
              <div className="max-h-[45%] shrink-0">
                <AgentTracePanel
                  traces={liveTraces}
                  visible={reasoningVisible}
                  onToggle={() => setReasoningVisible((current) => !current)}
                />
              </div>
            )}
          </div>
        )}

        <div className="relative min-w-0 flex-1">
          {liveDashboardData ? (
            <OperationalState
              kind={dashboardError ? "refresh-error" : "ready"}
              message={dashboardError ?? ""}
              actionLabel={dashboardError ? "Retry" : undefined}
              onAction={dashboardError ? requestDashboardRefresh : undefined}
            >
              <DemoGuide
                enabled={Boolean(isDemoAdmin && demoMode)}
                variant="live"
                phase={demoPhase}
                error={demoError}
                data={liveDashboardData}
                authToken={authToken}
                onPhaseChange={(phase) => {
                  setDemoPhase(phase);
                  if (phase === "complete") setActiveView("activity");
                }}
                onErrorChange={setDemoError}
                onDataChange={(nextData) => {
                  setLiveDashboardData(nextData);
                  setRiskLevel(nextData.senior.riskLevel);
                  const nextSeniorId = nextData.selectedSeniorId ?? null;
                  selectedSeniorIdRef.current = nextSeniorId;
                  setLoadedSeniorId(nextSeniorId);
                }}
                onRefresh={(seniorId) =>
                  refreshDashboardForConsumer(seniorId)
                }
                onOpenTimeline={() => {
                  setActiveView("workspace");
                  setDemoTimelineRequest((request) => request + 1);
                }}
                onUnauthorized={handleUnauthorized}
                onExit={() => {
                  setDemoMode(false);
                  setDemoPhase("exited");
                  setDemoError(null);
                  setActiveView("workspace");
                }}
              >
                <>
                  <div
                    className={
                      guideComposition.showWorkspace ? "h-full" : "hidden"
                    }
                  >
                    <Dashboard
                      data={liveDashboardData}
                      traces={liveTraces}
                      briefing={liveBriefing}
                      onRefresh={refreshDashboardForConsumer}
                      authToken={authToken}
                      isDemoAdmin={isDemoAdmin}
                      guideLocked={guideComposition.lockWorkspaceMutations}
                      openTimelineRequest={demoTimelineRequest}
                      onUnauthorized={handleUnauthorized}
                      onSelectSenior={selectSenior}
                      contactPlan={contactPlan}
                      contactPlanLoading={contactPlanLoading}
                      contactPlanError={contactPlanError}
                      onRefreshContactPlan={() => refreshContactPlan(selectedSeniorId)}
                      checkInSchedule={checkInSchedule}
                      checkInScheduleLoading={checkInScheduleLoading}
                      checkInScheduleError={checkInScheduleError}
                      onRefreshCheckInSchedule={() => refreshCheckInSchedule(selectedSeniorId)}
                      seniorContext={seniorContext}
                      seniorContextLoading={seniorContextLoading}
                      seniorContextError={seniorContextError}
                      onSeniorContextChanged={setSeniorContext}
                      careSetupOpen={careSetupOpen}
                      onCloseCareSetup={() => setCareSetupOpen(false)}
                      onViewActivity={() => setActiveView("activity")}
                    />
                  </div>
                  {guideComposition.showActivity && (
                    <CareActivity
                      activity={liveDashboardData.activity ?? []}
                      queue={followUpQueueForSenior(
                        liveDashboardData.followUpQueue,
                        selectedSeniorId
                      )}
                      seniorName={liveDashboardData.senior.name}
                      onReturnToWorkspace={() => setActiveView("workspace")}
                    />
                  )}
                </>
              </DemoGuide>
            </OperationalState>
          ) : dashboardError ? (
            <OperationalState
              kind="error"
              message={dashboardError}
              actionLabel="Retry"
              onAction={requestDashboardRefresh}
            />
          ) : (
            <OperationalState kind="loading" message="Loading your seniors..." />
          )}
        </div>
      </div>
    </AppShell>
  );
}
