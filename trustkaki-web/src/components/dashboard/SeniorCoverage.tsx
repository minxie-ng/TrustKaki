import type { DashboardData } from "@/lib/types";
import { formatDate, riskConfig } from "./presentation";
import { formatCaregiverLabel } from "../dashboardViewModel";

interface SeniorCoverageProps {
  seniors: NonNullable<DashboardData["seniors"]>;
  selectedSeniorId: string | null;
  disabled: boolean;
  onSelect: (seniorId: string) => void;
}

export function SeniorCoverage({
  seniors,
  selectedSeniorId,
  disabled,
  onSelect,
}: SeniorCoverageProps) {
  if (seniors.length <= 1) return null;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-950">Seniors covered</h3>
          <p className="mt-1 text-sm text-gray-500">
            Select a senior to review their current follow-up context.
          </p>
        </div>
        <div className="text-xs text-gray-500">{seniors.length} seniors</div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {seniors.map((senior) => {
          const risk = riskConfig[senior.riskLevel];
          const selected = senior.id === selectedSeniorId;
          return (
            <button
              key={senior.id}
              type="button"
              onClick={() => onSelect(senior.id)}
              disabled={disabled}
              aria-pressed={selected}
              className={`rounded-xl border p-4 text-left transition hover:border-emerald-400 hover:shadow-sm disabled:opacity-50 ${
                selected
                  ? "border-emerald-500 bg-emerald-50 shadow-sm"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-base font-bold text-gray-950">{senior.name}</div>
                <span className={`rounded px-2 py-1 text-[11px] font-semibold ${risk.bg} ${risk.text}`}>
                  {risk.label}
                </span>
              </div>
              {selected && (
                <div className="mt-2 text-[11px] font-semibold text-emerald-700">
                  Selected
                </div>
              )}
              <div className="mt-2 text-xs text-gray-600">
                {senior.followUpCount === 0
                  ? "No active follow-up"
                  : `${senior.followUpCount} active follow-up item${senior.followUpCount === 1 ? "" : "s"}`}
              </div>
              <div className="mt-1 text-xs text-gray-600">
                {[senior.gender, senior.age ? `${senior.age} years old` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {formatCaregiverLabel(
                  senior.primaryCaregiver,
                  senior.primaryCaregiverRelationship
                )} ·{" "}
                {formatDate(senior.lastCheckIn)}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
