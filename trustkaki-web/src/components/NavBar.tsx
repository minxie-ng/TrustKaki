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
  const riskLabel = {
    green: "Stable",
    yellow: "Watch",
    red: "Urgent",
  };

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-2 flex flex-col gap-2 shrink-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-black text-[var(--care-plum)]" aria-hidden="true">TK</span>
          <span className="font-bold text-[var(--care-ink)]">TrustKaki</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
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
            type="button"
            aria-pressed={demoMode}
            className={`min-h-11 rounded-md border px-3 py-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--care-plum)] ${
            demoMode
                ? "border-[var(--care-plum)] bg-[var(--care-soft-purple)] text-[var(--care-plum)]"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {demoMode ? "Exit demo mode" : "Demo mode"}
          </button>
        )}
        <div className={`ml-2 rounded-full px-2 py-1 text-xs font-semibold ${riskLevel === "red" ? "bg-red-50 text-red-700" : riskLevel === "yellow" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`} aria-label={`Current risk: ${riskLabel[riskLevel]}`}>
          {riskLabel[riskLevel]}
        </div>
        {onSignOut && (
          <button
            onClick={onSignOut}
            type="button"
            className="ml-1 min-h-11 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            Sign out
          </button>
        )}
      </div>
    </nav>
  );
}
