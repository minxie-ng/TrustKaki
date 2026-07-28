"use client";

import type { ReactNode } from "react";
import type { RiskLevel } from "@/lib/types";
import type { DemoPhase } from "./dashboard/demoGuideState";
import NavBar from "./NavBar";

export type AppView = "workspace" | "activity";

interface AppShellProps {
  activeView: AppView;
  isDemoAdmin: boolean;
  riskLevel: RiskLevel;
  demoMode?: boolean;
  guidedDemoPhase?: DemoPhase;
  onViewChange: (view: AppView) => void;
  onOpenSetup: () => void;
  onDemoModeChange?: (enabled: boolean) => void;
  onSignOut: () => void;
  children?: ReactNode;
}

export default function AppShell({
  activeView,
  isDemoAdmin,
  riskLevel,
  demoMode = false,
  guidedDemoPhase,
  onViewChange,
  onOpenSetup,
  onDemoModeChange,
  onSignOut,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-screen flex-col bg-[var(--care-mist)] text-[var(--care-ink)]">
      <a
        href="#main-content"
        className="sr-only z-50 bg-[var(--care-paper)] px-4 py-3 font-semibold text-[var(--care-evergreen)] focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
      >
        Skip to main content
      </a>
      <NavBar
        activeView={activeView}
        riskLevel={riskLevel}
        onViewChange={onViewChange}
        onOpenSetup={onOpenSetup}
        onSignOut={onSignOut}
        canShowDemoMode={isDemoAdmin}
        demoMode={demoMode}
        suppressWorkflowNavigation={Boolean(
          demoMode && guidedDemoPhase && guidedDemoPhase !== "exited"
        )}
        onDemoModeChange={onDemoModeChange}
      />
      <div id="main-content" tabIndex={-1} className="min-h-0 flex-1">
        {children}
      </div>
    </div>
  );
}
