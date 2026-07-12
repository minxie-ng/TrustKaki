"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import NavBar from "@/components/NavBar";
import ChatSimulation from "@/components/ChatSimulation";
import Dashboard from "@/components/Dashboard";
import AgentTracePanel from "@/components/AgentTracePanel";
import SignInForm from "@/components/SignInForm";
import { demoMessages, demoTraces, dashboardData } from "@/data/demo";
import { authHeader, canShowDemoControls, publicUserRole } from "@/lib/auth/client";
import { createTrustKakiBrowserClient } from "@/lib/supabase/browser";
import type { BriefingOutput } from "@/lib/agents/contracts";
import type { AgentTrace, DashboardData, RiskLevel } from "@/lib/types";

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
  const [activeTab, setActiveTab] = useState<"chat" | "dashboard">("chat");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("green");
  const [traceVisible, setTraceVisible] = useState(true);
  const [liveDashboardData, setLiveDashboardData] =
    useState<DashboardData>(dashboardData);
  const [liveTraces, setLiveTraces] = useState<AgentTrace[]>(demoTraces);
  const [liveBriefing, setLiveBriefing] = useState<BriefingOutput | null>(null);
  const latestSession = liveDashboardData.activeSessions[0];
  const chatMessages =
    latestSession?.messages.length > 0 ? latestSession.messages : demoMessages;
  const authToken = session?.access_token ?? null;
  const role = publicUserRole(user);
  const isDemoAdmin = canShowDemoControls({ role });

  const handleUnauthorized = useCallback(() => {
    const client = createTrustKakiBrowserClient();
    void client?.auth.signOut();
    setSession(null);
    setUser(null);
    setAuthError("Please sign in again to continue.");
  }, []);

  const refreshDashboardState = useCallback(() => {
    if (!authToken) return;
    void fetch("/api/dashboard/state", {
      cache: "no-store",
      headers: authHeader(authToken),
    })
      .then(async (response) => {
        if (response.status === 401) {
          handleUnauthorized();
          return null;
        }
        if (!response.ok) return null;
        return (await response.json()) as DashboardStateResponse;
      })
      .then((state) => {
        if (!state?.persistence?.persisted) return;
        setLiveDashboardData(state.data);
        setLiveTraces(state.traces);
        setLiveBriefing(state.briefing ?? null);
        setRiskLevel(state.data.senior.riskLevel);
      })
      .catch((error) => {
        console.error("Failed to hydrate dashboard state:", error);
      });
  }, [authToken, handleUnauthorized]);

  const handleCheckinComplete = () => {
    setRiskLevel("yellow");
    refreshDashboardState();
  };

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
    const timer = window.setTimeout(() => {
      refreshDashboardState();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [authToken, refreshDashboardState]);

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
      <div className="relative">
        <NavBar activeTab={activeTab} onTabChange={setActiveTab} riskLevel={riskLevel} />
        <button
          onClick={signOut}
          className="absolute right-3 top-3 rounded-md border border-white/30 px-3 py-1 text-xs font-semibold text-white"
        >
          Sign out
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div
          className={`${
            activeTab === "chat" ? "flex" : "hidden md:flex"
          } flex-col flex-1 md:max-w-md border-r border-gray-200`}
        >
          <ChatSimulation
            messages={chatMessages}
            onComplete={handleCheckinComplete}
            authToken={authToken}
            onUnauthorized={handleUnauthorized}
          />
        </div>

        <div
          className={`${
            activeTab === "dashboard" ? "flex" : "hidden md:flex"
          } flex-col flex-1`}
        >
          <Dashboard
            data={liveDashboardData}
            traces={liveTraces}
            briefing={liveBriefing}
            onRefresh={refreshDashboardState}
            authToken={authToken}
            isDemoAdmin={isDemoAdmin}
            onUnauthorized={handleUnauthorized}
          />
        </div>

        <div className="hidden lg:flex flex-col w-96 border-l border-gray-200">
          <AgentTracePanel
            traces={liveTraces}
            visible={traceVisible}
            onToggle={() => setTraceVisible(!traceVisible)}
          />
        </div>
      </div>

      <div className="lg:hidden">
        <AgentTracePanel
          traces={liveTraces}
          visible={traceVisible}
          onToggle={() => setTraceVisible(!traceVisible)}
        />
      </div>
    </div>
  );
}
