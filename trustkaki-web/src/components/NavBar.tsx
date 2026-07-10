"use client";

import type { RiskLevel } from "@/lib/types";

export type TabId = "dashboard" | "chat" | "traces";

interface NavBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  riskLevel: RiskLevel;
  seniorName: string;
}

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "chat", label: "Check-in Chat", icon: "💬" },
  { id: "traces", label: "Agent Traces", icon: "🔍" },
];

const riskConfig: Record<
  RiskLevel,
  { label: string; bg: string; text: string; dot: string }
> = {
  green: {
    label: "Low Risk",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  yellow: {
    label: "Moderate Risk",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  red: {
    label: "High Risk",
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
  },
};

export default function NavBar({
  activeTab,
  onTabChange,
  riskLevel,
  seniorName,
}: NavBarProps) {
  const risk = riskConfig[riskLevel];

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-lg font-bold text-white shadow-sm">
            T
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-lg font-bold tracking-tight text-zinc-900">
              TrustKaki
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-teal-600">
              AI Care Companion
            </span>
          </div>
        </div>

        {/* Tabs */}
        <nav className="hidden items-center gap-1 sm:flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-teal-50 text-teal-700"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Risk badge */}
        <div className="flex items-center gap-3">
          <div className="hidden text-right md:block">
            <div className="text-xs font-medium text-zinc-400">Monitoring</div>
            <div className="text-sm font-semibold text-zinc-700">
              {seniorName}
            </div>
          </div>
          <div
            className={`flex items-center gap-2 rounded-full ${risk.bg} ${risk.text} px-3 py-1.5`}
          >
            <span className={`h-2 w-2 rounded-full ${risk.dot} animate-pulse`} />
            <span className="text-xs font-semibold">{risk.label}</span>
          </div>
        </div>
      </div>

      {/* Mobile tabs */}
      <nav className="flex items-center gap-1 border-t border-zinc-100 px-2 py-1.5 sm:hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-teal-50 text-teal-700"
                : "text-zinc-500"
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
