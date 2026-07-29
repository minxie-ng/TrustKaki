import type { DashboardData, FollowUpQueueItem } from "@/lib/types";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import {
  buildSeniorCoverage,
  careUrgencyTone,
} from "./careWorkspacePresentation";
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
  if (seniors.length === 0) return null;

  const coverage = buildSeniorCoverage(seniors, queue ?? []);
  const monitoringIndex = coverage.findIndex((item) => !item.activeItem);

  return (
    <nav aria-label="Senior priority coverage" className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-[var(--care-ink)]">Priority coverage</h3>
        <span className="text-xs text-gray-500">
          {seniors.length} {seniors.length === 1 ? "senior" : "seniors"}
        </span>
      </div>
      <div className="min-w-0 border-y border-[var(--care-line)] bg-[var(--care-surface-muted)]">
        {coverage.map((item, index) => {
          const selected = item.senior.id === selectedSeniorId;
          const showSeparator = monitoringIndex === index;

          return (
            <div key={item.senior.id} className="contents">
              {showSeparator && (
                <div className="flex items-center gap-2 border-b border-[var(--care-line)] px-3 py-2 text-[11px] font-semibold uppercase text-gray-500">
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
                aria-current={selected ? "true" : undefined}
                aria-label={`Select ${item.senior.name}${selected ? " (selected)" : ""}`}
                className={`min-h-11 w-full min-w-0 border-b border-[var(--care-line)] px-3 py-3 text-left hover:bg-[var(--care-soft-teal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--care-brand)] disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-l-2 border-l-[var(--care-coral)] bg-white pl-[10px]" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <SeniorAvatar name={item.senior.name} src={item.portraitSrc} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold leading-5 text-[var(--care-ink)]">
                      {item.senior.name}
                    </div>
                    <StatusIndicator
                      tone={careUrgencyTone[item.urgency]}
                      label={urgencyLabel[item.urgency]}
                      className="mt-0.5 text-xs font-semibold text-gray-600"
                    />
                  </div>
                  <div className="text-xs font-semibold tabular-nums text-gray-400">
                    {item.position}
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
