import type { DashboardData } from "@/lib/types";
import { SeniorAvatar } from "./SeniorAvatar";
import { portraitForSenior } from "./careWorkspacePresentation";

interface SelectedSeniorSummaryProps {
  senior: DashboardData["senior"];
  selectedSenior?: NonNullable<DashboardData["seniors"]>[number];
}

export function SelectedSeniorSummary({ senior, selectedSenior }: SelectedSeniorSummaryProps) {
  return (
    <section className="care-person-card">
      <div className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--care-brand)]">
        Selected senior
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <SeniorAvatar name={senior.name} src={portraitForSenior(senior.name)} size="lg" />
        <div className="min-w-0">
          <h3 className="break-words font-display text-[30px] font-bold sm:text-[34px] leading-tight text-[var(--care-ink)]">{senior.name}</h3>
          <div className="mt-2 text-sm text-[var(--care-muted)]">
            {[senior.gender, senior.age > 0 ? `${senior.age} years old` : "Age not recorded", senior.livingSituation].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-1 break-words text-sm text-[var(--care-muted)]">
            {senior.address ?? selectedSenior?.address ?? "Address not recorded"}
          </div>
        </div>
      </div>
    </section>
  );
}
