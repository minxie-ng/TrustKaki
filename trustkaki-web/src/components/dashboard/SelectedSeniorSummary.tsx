import type { DashboardData } from "@/lib/types";
import { formatCaregiverLabel } from "../dashboardViewModel";
import { SeniorAvatar } from "./SeniorAvatar";
import { portraitForSenior } from "./careWorkspacePresentation";
import { formatDate, riskConfig } from "./presentation";

interface SelectedSeniorSummaryProps {
  senior: DashboardData["senior"];
  selectedSenior?: NonNullable<DashboardData["seniors"]>[number];
}

export function SelectedSeniorSummary({ senior, selectedSenior }: SelectedSeniorSummaryProps) {
  return (
    <section className="pb-3">
      <div className="mb-2 text-xs font-bold uppercase text-[var(--care-brand)]">
        Selected senior
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <SeniorAvatar name={senior.name} src={portraitForSenior(senior.name)} size="md" />
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold text-[var(--care-ink)]">{senior.name}</h3>
          <div className="text-sm text-gray-700">
            {[senior.gender, `${senior.age} years old`, senior.livingSituation].filter(Boolean).join(" · ")}
          </div>
          <div className="break-words text-xs text-gray-600">
            {senior.address ?? selectedSenior?.address ?? "Address not recorded"}
          </div>
        </div>
      </div>
      <div className="mt-3 grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--care-line)] pt-3 text-sm text-gray-700 sm:grid-cols-4">
        <SummaryField
          label="Primary caregiver"
          value={formatCaregiverLabel(
            selectedSenior?.primaryCaregiver ?? senior.caregiver,
            selectedSenior?.primaryCaregiverRelationship ?? senior.caregiverRelationship
          )}
        />
        <SummaryField label="AAC volunteer" value={selectedSenior?.aacVolunteer ?? senior.aacVolunteer} />
        <SummaryField label="Current risk" value={riskConfig[senior.riskLevel].label} />
        <SummaryField label="Last response" value={formatDate(senior.lastCheckIn)} />
      </div>
    </section>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold text-gray-500">{label}</div>
      <div className="mt-1 break-words font-semibold leading-snug text-gray-900">{value}</div>
    </div>
  );
}
