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
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <SeniorAvatar name={senior.name} src={portraitForSenior(senior.name)} size="lg" />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Selected senior</div>
            <h3 className="mt-1 truncate text-xl font-bold text-[var(--care-ink)]">{senior.name}</h3>
            <div className="mt-1 text-sm text-gray-700">
              {[senior.gender, `${senior.age} years old`, senior.livingSituation].filter(Boolean).join(" · ")}
            </div>
            <div className="mt-1 break-words text-sm text-gray-700">
              {senior.address ?? selectedSenior?.address ?? "Address not recorded"}
            </div>
          </div>
        </div>
        <div className="grid min-w-0 flex-1 gap-2 text-sm text-gray-700 sm:grid-cols-2 lg:max-w-2xl">
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
      </div>
    </section>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-gray-50 p-2.5">
      <div className="text-xs font-semibold text-gray-500">{label}</div>
      <div className="mt-1 break-words font-semibold text-gray-900">{value}</div>
    </div>
  );
}
