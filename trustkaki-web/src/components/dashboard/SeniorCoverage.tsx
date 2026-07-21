import type { DashboardData, FollowUpQueueItem } from "@/lib/types";
import { buildSeniorCoverage } from "./careWorkspacePresentation";
import { coverageRiskStyle } from "./presentation";
import { SeniorAvatar } from "./SeniorAvatar";

interface SeniorCoverageProps {
  seniors: NonNullable<DashboardData["seniors"]>;
  queue?: FollowUpQueueItem[];
  selectedSeniorId: string | null;
  disabled: boolean;
  onSelect: (seniorId: string) => void;
}

const urgencyLabel = {
  urgent: "Urgent",
  today: "Today",
  monitoring: "Monitoring",
  stable: "Stable",
} as const;

export function SeniorCoverage({
  seniors,
  queue,
  selectedSeniorId,
  disabled,
  onSelect,
}: SeniorCoverageProps) {
  if (seniors.length <= 1) return null;

  const coverage = buildSeniorCoverage(seniors, queue ?? []);
  const monitoringIndex = coverage.findIndex((item) => !item.activeItem);

  return (
    <nav aria-label="Senior priority coverage" className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <h3 className="text-sm font-bold text-[var(--care-ink)]">Priority coverage</h3>
        <span className="text-xs text-gray-500">{seniors.length} seniors</span>
      </div>
      <div className="flex min-w-0 snap-x gap-2 overflow-x-auto pb-2 lg:grid lg:gap-2 lg:overflow-visible">
        {coverage.map((item, index) => {
          const selected = item.senior.id === selectedSeniorId;
          const style = coverageRiskStyle[item.senior.riskLevel];
          const showSeparator = monitoringIndex === index;

          return (
            <div key={item.senior.id} className="contents">
              {showSeparator && (
                <div className="flex min-w-24 items-center gap-2 px-1 pt-2 text-[11px] font-semibold uppercase text-gray-500 lg:col-span-full lg:min-w-0">
                  <span className="h-px flex-1 bg-gray-200" />
                  Monitoring
                  <span className="h-px flex-1 bg-gray-200" />
                </div>
              )}
              <button
                type="button"
                onClick={() => onSelect(item.senior.id)}
                disabled={disabled}
                aria-pressed={selected}
                aria-label={`Select ${item.senior.name}${selected ? " (selected)" : ""}`}
                className={`relative min-h-11 min-w-0 w-[70%] shrink-0 snap-start rounded-lg border border-gray-200 border-l-4 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(23,33,29,0.2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--care-brand)] disabled:cursor-not-allowed disabled:opacity-50 lg:w-full ${style.edge} ${style.tint} ${selected ? "shadow-md" : ""}`}
              >
                {selected && (
                  <span
                    title="Selected senior"
                    aria-hidden="true"
                    className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-[var(--care-ink)] text-xs font-bold text-white"
                  >
                    &#10003;
                  </span>
                )}
                <div className="flex items-center gap-3">
                  <div className="text-lg font-bold text-gray-400">{item.position}</div>
                  <SeniorAvatar name={item.senior.name} src={item.portraitSrc} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm font-bold text-[var(--care-ink)] ${selected ? "pr-6" : ""}`}>{item.senior.name}</div>
                    <div className="mt-0.5 text-xs font-semibold text-gray-600">{urgencyLabel[item.urgency]}</div>
                  </div>
                </div>
                {item.reason && <div className="mt-2 truncate text-xs text-gray-600">{item.reason}</div>}
              </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
