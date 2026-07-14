"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import NavBar from "@/components/NavBar";
import ChatSimulation from "@/components/ChatSimulation";
import Dashboard from "@/components/Dashboard";
import SignInForm from "@/components/SignInForm";
import { authHeader, canShowDemoControls, publicUserRole } from "@/lib/auth/client";
import { createTrustKakiBrowserClient } from "@/lib/supabase/browser";
import { subscribeToDashboardChanges } from "@/lib/supabase/dashboardRealtime";
import {
  appShellSurface,
  chatSimulationState,
  dashboardStateEndpoint,
  dashboardSyncIntervalMs,
  optimisticDashboardForSenior,
  shouldPollDashboard,
} from "@/components/dashboardViewModel";
import type { BriefingOutput } from "@/lib/agents/contracts";
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
  const [demoMode, setDemoMode] = useState(false);
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
  const selectedSeniorIdRef = useRef<string | null>(null);
  const dashboardRequestSeq = useRef(0);
  const contactPlanRequestSeq = useRef(0);
  const authToken = session?.access_token ?? null;
  const role = publicUserRole(user);
  const isDemoAdmin = canShowDemoControls({ role });
  const surface = appShellSurface({ isDemoAdmin, demoMode });
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
    setAuthError("Please sign in again to continue.");
  }, []);

  const refreshDashboardState = useCallback((nextSeniorId?: string | null) => {
    if (!authToken) return;
    const seniorId = nextSeniorId ?? selectedSeniorIdRef.current;
    const requestId = dashboardRequestSeq.current + 1;
    dashboardRequestSeq.current = requestId;
    setDashboardError(null);
    const url = dashboardStateEndpoint(seniorId);
    void fetch(url, {
      cache: "no-store",
      headers: authHeader(authToken),
    })
      .then(async (response) => {
        if (response.status === 401) {
          handleUnauthorized();
          return null;
        }
        if (!response.ok) throw new Error("dashboard_request_failed");
        return (await response.json()) as DashboardStateResponse;
      })
      .then((state) => {
        if (requestId !== dashboardRequestSeq.current) return;
        if (!state) return;
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
      })
      .catch((error) => {
        console.error("Failed to hydrate dashboard state:", error);
        if (requestId === dashboardRequestSeq.current) {
          setDashboardError("TrustKaki could not load the caregiver dashboard. Please retry.");
        }
      });
  }, [authToken, handleUnauthorized]);

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

  const selectSenior = useCallback(
    (seniorId: string) => {
      selectedSeniorIdRef.current = seniorId;
      setLoadingSeniorId(seniorId);
      setContactPlan(null);
      setContactPlanLoading(true);
      setLiveDashboardData((current) =>
        current ? optimisticDashboardForSenior(current, seniorId) : current
      );
      refreshDashboardState(seniorId);
    },
    [refreshDashboardState]
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
    });

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setAuthError(null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authToken) return;

    const refreshIfVisible = () => {
      if (
        shouldPollDashboard({
          hasAuthToken: Boolean(authToken),
          visibilityState: document.visibilityState,
        })
      ) {
        refreshDashboardState();
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
  }, [authToken, refreshDashboardState]);

  useEffect(() => {
    if (!authToken) return;
    const subscription = subscribeToDashboardChanges({
      onChange: () => {
        refreshDashboardState();
        refreshContactPlan();
      },
    });
    return () => subscription?.unsubscribe();
  }, [authToken, refreshContactPlan, refreshDashboardState]);

  useEffect(() => {
    if (authToken && selectedSeniorId) refreshContactPlan(selectedSeniorId);
  }, [authToken, refreshContactPlan, selectedSeniorId]);

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
    setLiveDashboardData(null);
    setLiveTraces([]);
    setLiveBriefing(null);
    setContactPlan(null);
    selectedSeniorIdRef.current = null;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center text-sm text-gray-600">
        Loading TrustKaki...
      </div>
    );
  }

  if (!authToken) {
    return (
      <SignInForm onSignIn={signIn} disabled={authBusy} error={authError} />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <NavBar
        riskLevel={riskLevel}
        onSignOut={signOut}
        canShowDemoMode={isDemoAdmin}
        demoMode={demoMode}
        onDemoModeChange={setDemoMode}
      />

      <div className="flex-1 flex overflow-hidden">
        {surface.showDemoControls && (
          <div className="hidden flex-col flex-1 border-r border-gray-200 md:flex md:max-w-md">
            <ChatSimulation
              key={chatState.instanceKey}
              messages={chatMessages}
              seniorId={chatState.submissionSeniorId}
              isSeniorLoading={!chatState.canSubmit && Boolean(selectedSeniorId)}
              onComplete={refreshDashboardState}
              authToken={authToken}
              onUnauthorized={handleUnauthorized}
            />
          </div>
        )}

        <div className="flex flex-col flex-1">
          {liveDashboardData ? (
            <Dashboard
              data={liveDashboardData}
              traces={liveTraces}
              briefing={liveBriefing}
              onRefresh={refreshDashboardState}
              authToken={authToken}
              isDemoAdmin={isDemoAdmin}
              demoMode={surface.showDemoControls}
              onUnauthorized={handleUnauthorized}
              onSelectSenior={selectSenior}
              contactPlan={contactPlan}
              contactPlanLoading={contactPlanLoading}
              contactPlanError={contactPlanError}
              onRefreshContactPlan={() => refreshContactPlan(selectedSeniorId)}
            />
          ) : (
            <main className="flex h-full items-center justify-center bg-gray-50 p-6">
              <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
                <div className="text-base font-semibold text-gray-950">
                  {dashboardError ? "Dashboard unavailable" : "Loading your seniors..."}
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  {dashboardError ?? "Retrieving your authorised caregiver queue."}
                </p>
                {dashboardError && (
                  <button
                    type="button"
                    onClick={() => refreshDashboardState()}
                    className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Retry
                  </button>
                )}
              </div>
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
