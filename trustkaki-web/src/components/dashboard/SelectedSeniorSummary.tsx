import type { DashboardData } from "@/lib/types";
import { SeniorAvatar } from "./SeniorAvatar";
import { portraitForSenior } from "./careWorkspacePresentation";

interface SelectedSeniorSummaryProps {
  senior: DashboardData["senior"];
  selectedSenior?: NonNullable<DashboardData["seniors"]>[number];
}

export function SelectedSeniorSummary({ senior, selectedSenior }: SelectedSeniorSummaryProps) {
  return (
    <section className="pb-2">
      <div className="mb-3 text-sm font-semibold text-[var(--care-brand)]">
        Selected senior
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <SeniorAvatar name={senior.name} src={portraitForSenior(senior.name)} size="md" />
        <div className="min-w-0">
          <h3 className="break-words font-display text-[28px] font-semibold leading-tight text-[var(--care-ink)]">{senior.name}</h3>
          <div className="text-sm text-gray-700">
            {[senior.gender, senior.age > 0 ? `${senior.age} years old` : "Age not recorded", senior.livingSituation].filter(Boolean).join(" · ")}
          </div>
          <div className="break-words text-sm text-gray-600">
            {senior.address ?? selectedSenior?.address ?? "Address not recorded"}
          </div>
        </div>
      </div>
    </section>
  );
}
