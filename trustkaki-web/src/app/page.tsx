"use client";

import { useCallback, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import ChatSimulation from "@/components/ChatSimulation";
import Dashboard from "@/components/Dashboard";
import AgentTracePanel from "@/components/AgentTracePanel";
import { demoMessages, demoTraces, dashboardData } from "@/data/demo";
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

  const refreshDashboardState = useCallback(() => {
    void fetch("/api/dashboard/state", { cache: "no-store" })
      .then(async (response) => {
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
  }, []);

  const handleCheckinComplete = () => {
    setRiskLevel("yellow");
    refreshDashboardState();
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshDashboardState();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refreshDashboardState]);

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <NavBar activeTab={activeTab} onTabChange={setActiveTab} riskLevel={riskLevel} />

      <div className="flex-1 flex overflow-hidden">
        <div
          className={`${
            activeTab === "chat" ? "flex" : "hidden md:flex"
          } flex-col flex-1 md:max-w-md border-r border-gray-200`}
        >
          <ChatSimulation
            messages={chatMessages}
            onComplete={handleCheckinComplete}
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
