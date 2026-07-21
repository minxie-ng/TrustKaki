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
    green: "Low",
    yellow: "Medium",
    red: "High",
  };

  return (
    <nav className="relative z-10 flex shrink-0 flex-col gap-2 border-b border-emerald-950/20 bg-[#183d35] px-4 py-2.5 shadow-[0_2px_12px_rgba(23,33,29,0.16)] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-md border border-white/15 bg-white/10 text-xs font-black text-white shadow-sm" aria-hidden="true">TK</span>
          <span className="text-[17px] font-extrabold text-white">TrustKaki</span>
        </div>
        <span className="hidden border-l border-white/20 pl-3 text-xs font-medium text-emerald-50/75 sm:inline">
          AI Last-Mile Engagement for Seniors
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1 sm:justify-end">
        {canShowDemoMode && (
          <button
            onClick={() => onDemoModeChange?.(!demoMode)}
            type="button"
            aria-pressed={demoMode}
            className={`min-h-11 rounded-md border px-3 py-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              demoMode
                ? "border-white/50 bg-white text-[var(--care-brand-strong)]"
                : "border-white/35 bg-white/10 text-white hover:border-white/55 hover:bg-white/15"
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
            className="ml-1 min-h-11 rounded-md border border-white/35 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:border-white/55 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Sign out
          </button>
        )}
      </div>
    </nav>
  );
}
