"use client";

import { useState } from "react";
import NavBar, { type TabId } from "@/components/NavBar";
import Dashboard from "@/components/Dashboard";
import ChatSimulation from "@/components/ChatSimulation";
import AgentTracePanel from "@/components/AgentTracePanel";
import { dashboardData, demoSession } from "@/data/demo";

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  return (
    <div className="min-h-screen bg-zinc-50">
      <NavBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        riskLevel={dashboardData.senior.riskLevel}
        seniorName={dashboardData.senior.name}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {activeTab === "dashboard" && <Dashboard data={dashboardData} />}

        {activeTab === "chat" && (
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <ChatSimulation messages={demoSession.messages} />
            </div>
            <div className="lg:col-span-2">
              <AgentTracePanel traces={demoSession.traces} />
            </div>
          </div>
        )}

        {activeTab === "traces" && (
          <div className="mx-auto max-w-4xl">
            <AgentTracePanel traces={demoSession.traces} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-2 text-xs text-zinc-400 sm:flex-row">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-500">TrustKaki</span>
              <span>— AI Care Companion for Singapore Seniors</span>
            </div>
            <div className="flex items-center gap-3">
              <span>Tencent Age Well Hackathon 2026</span>
              <span>·</span>
              <span>MVP Demo</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
