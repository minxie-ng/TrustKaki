"use client";

import type { CareActivityItem, FollowUpQueueItem } from "@/lib/types";

type CareActivityEntry =
  | {
      kind: "signal";
      id: string;
      at: string;
      source: "Observed signal";
      text: string;
    }
  | {
      kind: "policy";
      id: string;
      at: string;
      source: "Care policy";
      text: string;
    }
  | {
      kind: "caregiver";
      id: string;
      at: string;
      source: "Caregiver record";
      item: CareActivityItem;
    };

interface CareActivityProps {
  activity: CareActivityItem[];
  queue: FollowUpQueueItem[];
  seniorName: string;
  onReturnToWorkspace: () => void;
}

const actionLabels: Record<CareActivityItem["actionType"], string> = {
  mark_for_follow_up: "Marked for follow-up",
  assign: "Assigned caregiver",
  record_outcome: "Recorded follow-up",
  snooze: "Snoozed follow-up",
  escalate: "Escalated case",
  resolve: "Closed case",
};

const outcomeLabels: Record<
  NonNullable<CareActivityItem["outcomeType"]>,
  string
> = {
  reached_and_okay: "Reached and okay",
  needs_follow_up: "Needs follow-up",
  referred_to_aac_staff: "Referred to AAC staff",
  unable_to_reach: "Unable to reach",
  resolved: "Resolved",
};

const statusLabels: Record<
  NonNullable<CareActivityItem["resultingStatus"]>,
  string
> = {
  pending: "Pending",
  acknowledged: "Acknowledged",
  followed_up: "Followed up",
  snoozed: "Snoozed",
  escalated: "Escalated",
  resolved: "Resolved",
};

function activityEntries(
  activity: CareActivityItem[],
  queue: FollowUpQueueItem[]
): CareActivityEntry[] {
  const queueEntries = queue.flatMap<CareActivityEntry>((item) => [
    ...(item.pattern?.evidence ?? []).map((evidence) => ({
      kind: "signal" as const,
      id: `${item.id}:signal:${evidence.id}`,
      at: evidence.observedAt,
      source: "Observed signal" as const,
      text: evidence.description,
    })),
    {
      kind: "policy" as const,
      id: `${item.id}:policy`,
      at: item.lastUpdatedAt,
      source: "Care policy" as const,
      text: item.reason,
    },
  ]);
  const caregiverEntries = activity.map<CareActivityEntry>((item) => ({
    kind: "caregiver",
    id: item.id,
    at: item.createdAt,
    source: "Caregiver record",
    item,
  }));

  return [...queueEntries, ...caregiverEntries].sort(
    (left, right) =>
      new Date(right.at).getTime() - new Date(left.at).getTime()
  );
}

function displayTime(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function CareActivity({
  activity,
  queue,
  seniorName,
  onReturnToWorkspace,
}: CareActivityProps) {
  const entries = activityEntries(activity, queue);

  return (
    <main
      data-care-thread="true"
      className="h-full overflow-y-auto bg-[var(--care-paper)] text-[var(--care-ink)]"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--care-line)] pb-5">
          <div>
            <div className="text-xs font-bold uppercase text-[var(--care-evergreen)]">
              Retained care history
            </div>
            <h1 className="mt-1 font-display text-2xl font-semibold text-gray-950">
              {seniorName} activity
            </h1>
          </div>
          <button
            type="button"
            onClick={onReturnToWorkspace}
            className="min-h-11 border border-[var(--care-evergreen)] px-4 py-2 text-sm font-semibold text-[var(--care-evergreen)] hover:bg-[var(--care-mist)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--care-brand)]"
          >
            Return to care workspace
          </button>
        </div>

        {entries.length === 0 ? (
          <section className="border-b border-[var(--care-line)] py-10">
            <h2 className="text-lg font-bold text-gray-950">
              No care activity recorded
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Observed signals and caregiver actions will appear here.
            </p>
          </section>
        ) : (
          <ol className="divide-y divide-[var(--care-line)]">
            {entries.map((entry) => (
              <li
                key={`${entry.kind}:${entry.id}`}
                className="grid gap-3 py-5 sm:grid-cols-[9rem_minmax(0,1fr)]"
              >
                <div>
                  <div className="text-xs font-bold uppercase text-[var(--care-evergreen)]">
                    {entry.source}
                  </div>
                  <time className="mt-1 block text-xs text-gray-500" dateTime={entry.at}>
                    {displayTime(entry.at)}
                  </time>
                </div>
                {entry.kind === "caregiver" ? (
                  <div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-bold text-gray-950">
                        {entry.item.caregiver ?? "Care team"}
                      </span>
                      <span className="text-sm font-semibold text-[var(--care-coral-hover)]">
                        {actionLabels[entry.item.actionType]}
                      </span>
                      {entry.item.resultingStatus && (
                        <span className="text-xs font-semibold text-gray-600">
                          {statusLabels[entry.item.resultingStatus]}
                        </span>
                      )}
                    </div>
                    {entry.item.outcomeType && (
                      <p className="mt-2 text-sm font-semibold text-gray-900">
                        {outcomeLabels[entry.item.outcomeType]}
                      </p>
                    )}
                    {entry.item.note && (
                      <p className="mt-1 text-sm leading-6 text-gray-700">
                        {entry.item.note}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-gray-800">{entry.text}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
