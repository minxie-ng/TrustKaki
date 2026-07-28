"use client";

import type { AppView } from "./AppShell";
import { StatusIndicator, type StatusTone } from "./ui/StatusIndicator";

interface NavProps {
  activeView: AppView;
  riskLevel: "green" | "yellow" | "red";
  onViewChange: (view: AppView) => void;
  onOpenSetup: () => void;
  onSignOut: () => void;
  canShowDemoMode?: boolean;
  demoMode?: boolean;
  onDemoModeChange?: (enabled: boolean) => void;
}

export default function NavBar({
  activeView,
  riskLevel,
  onViewChange,
  onOpenSetup,
  onSignOut,
  canShowDemoMode = false,
  demoMode = false,
  onDemoModeChange,
}: NavProps) {
  const riskStatus: Record<typeof riskLevel, { label: string; tone: StatusTone }> = {
    green: { label: "Stable", tone: "stable" },
    yellow: { label: "Needs attention", tone: "attention" },
    red: { label: "Urgent", tone: "urgent" },
  };
  const status = riskStatus[riskLevel];
  const navigationClass =
    "min-h-11 border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-white/80 hover:text-white";
  const activeNavigationClass =
    "min-h-11 border-b-2 border-white px-3 py-2 text-sm font-semibold text-white";

  return (
    <header className="relative z-10 flex shrink-0 flex-wrap items-center gap-x-6 border-b border-emerald-950/30 bg-[var(--care-evergreen)] px-4 sm:px-5">
      <div className="flex min-h-16 min-w-0 items-center">
        <span className="font-display text-xl font-semibold text-white">TrustKaki</span>
      </div>

      <nav aria-label="Primary" className="hidden min-h-16 items-stretch md:flex">
        <button
          type="button"
          aria-current={activeView === "workspace" ? "page" : undefined}
          onClick={() => onViewChange("workspace")}
          className={activeView === "workspace" ? activeNavigationClass : navigationClass}
        >
          Care workspace
        </button>
        <button
          type="button"
          aria-current={activeView === "activity" ? "page" : undefined}
          onClick={() => onViewChange("activity")}
          className={activeView === "activity" ? activeNavigationClass : navigationClass}
        >
          Activity
        </button>
        <button type="button" onClick={onOpenSetup} className={navigationClass}>
          Care setup
        </button>
        {canShowDemoMode && (
          <button
            onClick={() => onDemoModeChange?.(!demoMode)}
            type="button"
            aria-pressed={demoMode}
            className={demoMode ? activeNavigationClass : navigationClass}
          >
            {demoMode ? "Exit demo tools" : "Demo tools"}
          </button>
        )}
      </nav>

      <div className="ml-auto flex min-h-16 items-center gap-3">
        <StatusIndicator
          tone={status.tone}
          label={status.label}
          className="text-white"
        />
        <button
          onClick={onSignOut}
          type="button"
          className="min-h-11 border border-white/40 px-3 py-2 text-sm font-semibold text-white hover:border-white"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
