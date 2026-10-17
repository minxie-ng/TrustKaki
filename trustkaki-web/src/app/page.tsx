"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import AppShell, { type AppView } from "@/components/AppShell";
import JudgeWorkspace from "@/components/JudgeWorkspace";
import Dashboard from "@/components/Dashboard";
import { CareActivity } from "@/components/dashboard/CareActivity";
import { DemoGuide } from "@/components/dashboard/DemoGuide";
import {
  demoGuideComposition,
  type DemoPhase,
} from "@/components/dashboard/demoGuideState";
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
    isDemoAdmin && activeView !== "demo" && demoMode && demoPhase !== "exited"
  );
  const guideComposition = demoGuideComposition({
    activeView,
    enabled: guideActive,
    phase: demoPhase,
  });
  const surface = appShellSurface({ isDemoAdmin, demoMode: activeView === "demo", guideActive });
  const latestSession = liveDashboardData?.activeSessions[0];
  const chatMessages = latestSession?.messages ?? [];
  const selectedSeniorId = liveDashboardData?.selectedSeniorId ?? null;
  const chatState = chatSimulationState({
    selectedSeniorId,
    loadedSeniorId,
    isSeniorLoading: loadingSeniorId === selectedSeniorId,
  });

  const sessionTokenRef = useRef<string | null>(null);
  const sessionGenerationRef = useRef(0);
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const isCurrentSession = useCallback(() => Boolean(authToken) &&
    authToken === sessionTokenRef.current && sessionGeneration === sessionGenerationRef.current,
  [authToken, sessionGeneration]);
  const applySession = useCallback((nextSession: Session | null) => {
    const nextToken = nextSession?.access_token ?? null;
    if (nextToken !== sessionTokenRef.current) {
      // Invalidate old requests and child callbacks before exposing a different session.
      sessionGenerationRef.current++;
      setSessionGeneration(sessionGenerationRef.current);
      dashboardRequestSeq.current++;
      contactPlanRequestSeq.current++;
      checkInScheduleRequestSeq.current++;
      seniorContextRequestSeq.current++;
      selectedSeniorIdRef.current = null;
      setLiveDashboardData(null);
      setLiveTraces([]);
      setLiveBriefing(null);
      setLoadedSeniorId(null);
      setLoadingSeniorId(null);
      setDashboardError(null);
      setContactPlan(null);
      setContactPlanLoading(false);
      setContactPlanError(null);
      setCheckInSchedule(null);
      setCheckInScheduleLoading(false);
      setCheckInScheduleError(null);
      setSeniorContext(null);
      setSeniorContextLoading(false);
      setSeniorContextError(null);
      setRiskLevel("green");
      setDemoMode(false);
      setDemoPhase("exited");
      setDemoError(null);
      setActiveView("workspace");
      setCareSetupOpen(false);
      sessionTokenRef.current = nextToken;
    }
    setSession(nextSession);
    setUser(nextSession?.user ?? null);
  }, []);

  const handleUnauthorized = useCallback(() => {
    if (!isCurrentSession()) return;
    const client = createTrustKakiBrowserClient();
    void client?.auth.signOut();
    applySession(null);
    setAuthError("Please sign in again to continue.");
  }, [applySession, isCurrentSession]);

  const refreshDashboardState = useCallback(async (
    nextSeniorId?: string | null
  ): Promise<DashboardData | null> => {
    if (!authToken || !isCurrentSession()) return null;
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
      if (requestId !== dashboardRequestSeq.current) return null;
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
        setLoadingSeniorId(null);
      }
      throw error;
    }
  }, [authToken, handleUnauthorized, isCurrentSession]);

  const requestDashboardRefresh = useCallback((nextSeniorId?: string | null) => {
    fireAndForgetDashboardRefresh(refreshDashboardState, nextSeniorId);
  }, [refreshDashboardState]);

  const refreshDashboardForConsumer = useCallback(
    (nextSeniorId?: string | null) =>
      refreshDashboardAuthoritatively(refreshDashboardState, nextSeniorId),
    [refreshDashboardState]
  );

  const refreshContactPlan = useCallback((nextSeniorId?: string | null) => {
    if (!authToken || !isCurrentSession()) return;
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
      if (requestId !== contactPlanRequestSeq.current) return null;
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
  }, [authToken, handleUnauthorized, isCurrentSession]);

  const refreshCheckInSchedule = useCallback((nextSeniorId?: string | null) => {
    if (!authToken || !isDemoAdmin || !isCurrentSession()) return;
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
      if (requestId !== checkInScheduleRequestSeq.current) return null;
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
  }, [authToken, handleUnauthorized, isDemoAdmin, isCurrentSession]);

  const refreshSeniorContext = useCallback((nextSeniorId?: string | null) => {
    if (!authToken || !isCurrentSession()) return;
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
      if (requestId !== seniorContextRequestSeq.current) return null;
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
  }, [authToken, handleUnauthorized, isCurrentSession]);

  const selectSenior = useCallback(
    (seniorId: string) => {
      if (!isCurrentSession()) return;
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
    [isDemoAdmin, requestDashboardRefresh, isCurrentSession]
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

    let active = true;
    let authEventReceived = false;
    const restoreStoredPublicDemo = () => {
      try {
        const restored = restorePublicDemo(window.sessionStorage.getItem(PUBLIC_DEMO_STORAGE_KEY));
        if (restored) { setPublicDemoDocument(restored); setPublicDemo(true); }
      } catch { /* public demo can start clean if storage is unavailable */ }
    };
    void client.auth.getSession().then(({ data }) => {
      if (!active || authEventReceived) return;
      applySession(data.session);
      setAuthLoading(false);
      if (!data.session) restoreStoredPublicDemo();
    });

    const { data } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      authEventReceived = true;
      if (event === "INITIAL_SESSION" && !nextSession) restoreStoredPublicDemo();
      setAuthLoading(false);
      applySession(nextSession);
      setAuthError(null);
    });

    return () => { active = false; data.subscription.unsubscribe(); };
  }, [applySession]);

  function enterPublicDemo() {
    setPublicDemo(true);
    setPublicDemoDocument(restorePublicDemo(typeof window === "undefined" ? null : window.sessionStorage.getItem(PUBLIC_DEMO_STORAGE_KEY)));
  }

  useEffect(() => {
    if (!authToken || !isCurrentSession()) return;

    const refreshIfVisible = () => {
      if (
        shouldPollDashboard({
          hasAuthToken: Boolean(authToken),
          visibilityState: document.visibilityState,
          guideActive,
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
  }, [authToken, guideActive, requestDashboardRefresh, isCurrentSession]);

  useEffect(() => {
    if (!authToken || guideActive) return;
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
    guideActive,
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
    applySession(data.session);
  }

  async function signOut() {
    const client = createTrustKakiBrowserClient();
    applySession(null);
    await client?.auth.signOut();
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
      key={sessionGeneration}
      activeView={activeView}
      isDemoAdmin={isDemoAdmin}
      riskLevel={riskLevel}
      onViewChange={(view) => {
        setCareSetupOpen(false);
        setActiveView(view);
        if (view === "demo") setDemoMode(false);
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
      }}
    >
      <div className="flex h-full flex-col overflow-hidden">
        {surface.showChatSimulator && (
          <section aria-label="Judge workspace" className="flex min-h-0 flex-1 flex-col bg-white">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--care-line)] px-5 py-4">
              <div><h1 className="font-display text-2xl font-semibold">See how TrustKaki decides</h1><p className="mt-1 text-sm text-gray-600">Fictional messages · live model calls · actual recorded decisions</p></div>
              <label className="text-sm font-semibold">Fictional senior
                <select value={selectedSeniorId ?? ""} disabled={!liveDashboardData} onChange={(event) => selectSenior(event.target.value)} className="ml-3 min-h-11 max-w-full border border-[var(--care-line)] bg-white px-3 text-sm font-normal">
                  {(liveDashboardData?.seniors ?? []).map((senior) => <option key={senior.id} value={senior.id}>{senior.name}</option>)}
                </select>
              </label>
            </div>
            {dashboardError && <div role="alert" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--care-line)] px-5 py-3 text-sm"><p>{dashboardError}</p><button type="button" onClick={() => requestDashboardRefresh(selectedSeniorId)} className="min-h-11 font-semibold text-[var(--care-brand)] hover:underline">Retry loading senior</button></div>}
            <JudgeWorkspace key={chatState.instanceKey}
              messages={chatMessages} traces={loadedSeniorId === selectedSeniorId ? liveTraces : []}
              seniorId={chatState.submissionSeniorId}
              isSeniorLoading={!chatState.canSubmit && Boolean(selectedSeniorId)}
              onComplete={requestDashboardRefresh} authToken={authToken}
              onUnauthorized={handleUnauthorized}
            />
          </section>
        )}

        <div className={surface.showChatSimulator ? "hidden" : "relative min-h-0 min-w-0 flex-1"}>
          {liveDashboardData ? (
            <OperationalState
              kind={dashboardError ? "refresh-error" : "ready"}
              message={dashboardError ?? ""}
              actionLabel={dashboardError ? "Retry" : undefined}
              onAction={dashboardError ? requestDashboardRefresh : undefined}
            >
              <DemoGuide
                enabled={Boolean(isDemoAdmin && demoMode && activeView !== "demo")}
                variant="live"
                phase={demoPhase}
                error={demoError}
                data={liveDashboardData}
                authToken={authToken}
                onPhaseChange={(phase) => {
                  if (!isCurrentSession()) return;
                  setDemoPhase(phase);
                  if (phase === "complete") setActiveView("activity");
                }}
                onErrorChange={(error) => { if (isCurrentSession()) setDemoError(error); }}
                onDataChange={(nextData) => {
                  if (!isCurrentSession()) return;
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
                  if (!isCurrentSession()) return;
                  setActiveView("workspace");
                  setDemoTimelineRequest((request) => request + 1);
                }}
                onUnauthorized={handleUnauthorized}
                onExit={() => {
                  if (!isCurrentSession()) return;
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
                      onSeniorContextChanged={(context) => { if (isCurrentSession()) setSeniorContext(context); }}
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
