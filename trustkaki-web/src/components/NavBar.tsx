"use client";

interface NavProps {
  riskLevel: "green" | "yellow" | "red";
  onSignOut?: () => void;
  canShowDemoMode?: boolean;
  demoMode?: boolean;
  onDemoModeChange?: (enabled: boolean) => void;
}

export default function NavBar({
  riskLevel,
  onSignOut,
  canShowDemoMode = false,
  demoMode = false,
  onDemoModeChange,
}: NavProps) {
  const riskBadge = {
    green: "🟢",
    yellow: "🟡",
    red: "🔴",
  };

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-2 flex flex-col gap-2 shrink-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
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

      <div className="flex flex-wrap items-center gap-1 sm:justify-end">
        {canShowDemoMode && (
          <button
            onClick={() => onDemoModeChange?.(!demoMode)}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
              demoMode
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {demoMode ? "Exit demo mode" : "Demo mode"}
          </button>
        )}
        <div className="ml-2 text-sm">{riskBadge[riskLevel]}</div>
        {onSignOut && (
          <button
            onClick={onSignOut}
            className="ml-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            Sign out
          </button>
        )}
      </div>
    </nav>
  );
}
