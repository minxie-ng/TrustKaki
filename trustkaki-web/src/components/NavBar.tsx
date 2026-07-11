"use client";

interface NavProps {
  activeTab: "chat" | "dashboard";
  onTabChange: (tab: "chat" | "dashboard") => void;
  riskLevel: "green" | "yellow" | "red";
}

export default function NavBar({ activeTab, onTabChange, riskLevel }: NavProps) {
  const riskBadge = {
    green: "🟢",
    yellow: "🟡",
    red: "🔴",
  };

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🫂</span>
          <span className="font-bold text-gray-800">TrustKaki</span>
          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
            MVP
          </span>
        </div>
        <span className="text-xs text-gray-400 hidden sm:inline">
          AI Last-Mile Engagement for Seniors
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onTabChange("chat")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "chat"
              ? "bg-emerald-100 text-emerald-800"
              : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          💬 Chat
        </button>
        <button
          onClick={() => onTabChange("dashboard")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "dashboard"
              ? "bg-emerald-100 text-emerald-800"
              : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          📊 Dashboard
        </button>
        <div className="ml-2 text-sm">{riskBadge[riskLevel]}</div>
      </div>
    </nav>
  );
}
