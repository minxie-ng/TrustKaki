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
  suppressWorkflowNavigation?: boolean;
  publicDemo?: boolean;
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
  suppressWorkflowNavigation = false,
  publicDemo = false,
}: NavProps) {
  const riskStatus: Record<typeof riskLevel, { label: string; tone: StatusTone }> = {
    green: { label: "Stable", tone: "stable" },
    yellow: { label: "Needs attention", tone: "attention" },
    red: { label: "Urgent", tone: "urgent" },
  };
  const status = riskStatus[riskLevel];
  const navigationClass =
    "flex min-h-11 flex-1 shrink-0 items-center justify-center px-3 py-2 text-center text-sm font-medium text-[var(--care-muted)] hover:bg-[var(--care-mist)] hover:text-[var(--care-brand)] md:flex-none";
  const activeNavigationClass =
    "flex min-h-11 flex-1 shrink-0 items-center justify-center bg-[var(--care-sage)] px-3 py-2 text-center text-sm font-semibold text-[var(--care-brand)] md:flex-none";

  return (
    <header className="relative z-10 flex shrink-0 flex-wrap items-center gap-x-6 border-b border-[var(--care-line)] bg-white px-4 sm:px-6">
      <div className="flex min-h-[76px] min-w-0 items-center gap-3">
        <span className="care-brand-mark" aria-hidden="true"><svg width="23" height="23" viewBox="0 0 24 24" fill="none"><path d="M5 5.5h14v10H11l-5 4v-4H5v-10Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M9 9.5h6M9 12.5h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></span>
        <span className="font-display text-[23px] font-bold text-[var(--care-brand)]">TrustKaki</span>
      </div>

      {!suppressWorkflowNavigation && (
        <nav
          aria-label="Primary"
          className="order-3 flex w-full items-stretch overflow-x-auto gap-1 border-t border-[var(--care-line)] py-2 md:order-none md:min-h-[76px] md:w-auto md:overflow-visible md:border-t-0"
        >
        <button
          type="button"
          aria-current={activeView === "workspace" ? "page" : undefined}
          onClick={() => onViewChange("workspace")}
          className={activeView === "workspace" ? activeNavigationClass : navigationClass}
        >
          Care workspace
        </button>
        <button type="button" onClick={onOpenSetup} className={navigationClass}>
          Care setup
        </button>
        {canShowDemoMode && <button type="button" onClick={() => onViewChange("demo")} aria-current={activeView === "demo" ? "page" : undefined} className={activeView === "demo" ? activeNavigationClass : navigationClass}>Judge workspace</button>}
        {canShowDemoMode && (
          <button
            onClick={() => onDemoModeChange?.(!demoMode)}
            type="button"
            aria-pressed={demoMode}
            className={demoMode ? activeNavigationClass : navigationClass}
          >
            {demoMode ? "Exit live demo" : "Live system demo"}
          </button>
        )}
        </nav>
      )}

      <div className="ml-auto flex min-h-16 items-center gap-3">
        {publicDemo && <span className="border border-[var(--care-line)] px-2 py-1 text-xs font-semibold text-[var(--care-brand)]">Demo data</span>}
        <StatusIndicator
          tone={status.tone}
          label={status.label}
          className="text-[var(--care-muted)]"
        />
        <button
          onClick={onSignOut}
          type="button"
          className="care-secondary-button text-sm"
        >
          {publicDemo ? "Exit demo" : "Sign out"}
        </button>
      </div>
    </header>
  );
}
