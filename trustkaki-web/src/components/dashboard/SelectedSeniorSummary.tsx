import type { DashboardData } from "@/lib/types";
import { formatDate, riskConfig } from "./presentation";
import { formatCaregiverLabel } from "../dashboardViewModel";

interface SelectedSeniorSummaryProps {
  senior: DashboardData["senior"];
  selectedSenior?: NonNullable<DashboardData["seniors"]>[number];
}

export function SelectedSeniorSummary({
  senior,
  selectedSenior,
}: SelectedSeniorSummaryProps) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Selected senior
          </div>
          <h3 className="mt-1 text-2xl font-bold text-gray-950">{senior.name}</h3>
          <div className="mt-2 text-sm text-gray-700">
            {[senior.gender, `${senior.age} years old`, senior.livingSituation]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="mt-1 text-sm text-gray-700">
            {senior.address ?? selectedSenior?.address ?? "Address not recorded"}
          </div>
        </div>
        <div className="grid gap-3 text-sm text-gray-700 sm:grid-cols-2 md:min-w-96">
          <SummaryField
            label="Primary caregiver"
            value={formatCaregiverLabel(
              selectedSenior?.primaryCaregiver ?? senior.caregiver,
              selectedSenior?.primaryCaregiverRelationship ??
                senior.caregiverRelationship
            )}
          />
          <SummaryField
            label="AAC volunteer"
            value={selectedSenior?.aacVolunteer ?? senior.aacVolunteer}
          />
          <SummaryField label="Current risk" value={riskConfig[senior.riskLevel].label} />
          <SummaryField label="Last response" value={formatDate(senior.lastCheckIn)} />
        </div>
      </div>
    </section>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="text-xs font-semibold text-gray-500">{label}</div>
      <div className="mt-1 font-semibold text-gray-900">{value}</div>
    </div>
  );
}
