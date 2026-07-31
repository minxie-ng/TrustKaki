import type { BriefingOutput } from "@/lib/agents/contracts";
import type {
  CaregiverActionItem,
  DashboardData,
  FollowUpQueueItem,
  Message,
  PatternEvidenceItem,
} from "@/lib/types";
import { recentCareMessages } from "../dashboardViewModel";
import {
  escalationDestinationLabel,
  formatDate,
  labelPattern,
} from "./presentation";

interface CaseDetailsProps {
  item: FollowUpQueueItem;
  data: DashboardData;
  briefing?: BriefingOutput | null;
}

const evidenceMarker = {
  low: "bg-[var(--status-green)]",
  medium: "bg-[var(--status-amber)]",
  high: "bg-[var(--status-red)]",
} as const;

const evidenceSeverityLabel = {
  low: "Low severity",
  medium: "Medium severity",
  high: "High severity",
} as const;

const messageChannelLabel = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
} as const;

const messageProcessingStateLabel = {
  processed: "Processed by TrustKaki",
  provider_accepted: "Accepted by provider",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Delivery failed",
} as const;

export function formatCaregiverActionHistory(
  action: CaregiverActionItem
): string {
  const destination = action.escalationDestination
    ? ` to ${escalationDestinationLabel[action.escalationDestination]}`
    : "";
  const assignee = action.assignedCaregiver
    ? ` to ${action.assignedCaregiver}`
    : "";
  const actor = action.caregiver ? ` · by ${action.caregiver}` : "";
  const note = action.note ? ` · ${action.note}` : "";

  return `${formatDate(action.createdAt)} · ${labelPattern(action.actionType)}${destination}${assignee}${actor}${note}`;
}

function caregiverActionLabel(action: CaregiverActionItem): string {
  const destination = action.escalationDestination
    ? ` to ${escalationDestinationLabel[action.escalationDestination]}`
    : "";
  const assignee = action.assignedCaregiver
    ? ` to ${action.assignedCaregiver}`
    : "";
  return `${labelPattern(action.actionType)}${destination}${assignee}`;
}

type CareThreadEntry =
  | {
      kind: "signal";
      id: string;
      at: string;
      evidence: PatternEvidenceItem;
    }
  | {
      kind: "message";
      id: string;
      at: string;
      message: Message;
    }
  | {
      kind: "caregiver";
      id: string;
      at: string;
      action: CaregiverActionItem;
    };

function careThreadEntries(
  evidence: PatternEvidenceItem[],
  messages: Message[],
  actions: CaregiverActionItem[]
): CareThreadEntry[] {
  return [
    ...evidence.map((item): CareThreadEntry => ({
      kind: "signal",
      id: `signal:${item.id}`,
      at: item.observedAt,
      evidence: item,
    })),
    ...messages.map((message): CareThreadEntry => ({
      kind: "message",
      id: `message:${message.id}`,
      at: message.timestamp,
      message,
    })),
    ...actions.map((action): CareThreadEntry => ({
      kind: "caregiver",
      id: `caregiver:${action.id}`,
      at: action.createdAt,
      action,
    })),
  ].sort((left, right) => right.at.localeCompare(left.at));
}

export function CaseDetails({ item, data, briefing }: CaseDetailsProps) {
  if (!item.pattern) return null;
  const pattern = item.pattern;
  const careMessages = recentCareMessages(data);
  const thread = careThreadEntries(
    pattern.evidence,
    careMessages,
    pattern.previousActions
  );

  return (
    <div className="mt-6 border-t border-[var(--care-line)] pt-6">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] xl:gap-10">
        <div>
          <SectionHeading eyebrow="Authoritative care evidence" title="Chronological evidence timeline" />
          {pattern.evidence.length === 0 ? (
            <div className="mt-4 border-l-[3px] border-l-[var(--care-hairline)] px-4 py-2">
              <div className="text-sm font-semibold text-gray-900">No timeline evidence yet</div>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                Evidence will appear here as relevant observations are recorded.
              </p>
            </div>
          ) : null}
          {careMessages.length === 0 && (
            <p className="mt-4 text-sm leading-6 text-gray-600">
              No care messages recorded for this case yet.
            </p>
          )}
          <ol
            data-care-thread="true"
            className="relative ml-1 mt-5 border-l border-[var(--care-hairline)]"
          >
            {thread.map((entry) => (
              <li key={entry.id} className="relative pb-6 pl-6 last:pb-0">
                <ThreadMarker entry={entry} />
                <time dateTime={entry.at} className="text-xs font-semibold text-gray-500">
                  {formatDate(entry.at)}
                </time>
                <ThreadEntry entry={entry} />
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-8">
          <section>
            <SectionHeading eyebrow="Recommendation basis" title="Why this case was surfaced" />
            <dl className="mt-4 divide-y divide-[var(--care-line)] border-y border-[var(--care-line)]">
              <Detail label="Supporting patterns">
                {item.relatedPatterns.map((related) => labelPattern(related.type)).join(", ") || "No supporting patterns yet."}
              </Detail>
              <Detail label="Why TrustKaki suggested this">{pattern.triggerExplanation}</Detail>
              <Detail label="Compared with usual">{pattern.comparison}</Detail>
            </dl>
          </section>

          {(Boolean(pattern.usualRoutine?.length) || Boolean(pattern.knownContext?.length) || Boolean(pattern.memoryNotes?.length)) && (
            <section>
              <SectionHeading eyebrow="Senior context" title="What helps explain the change" />
              <dl className="mt-4 divide-y divide-[var(--care-line)] border-y border-[var(--care-line)]">
                {pattern.usualRoutine && pattern.usualRoutine.length > 0 && (
                  <DetailList label="Usual routine" values={pattern.usualRoutine} />
                )}
                {pattern.knownContext && pattern.knownContext.length > 0 && (
                  <DetailList label="Known context" values={pattern.knownContext} />
                )}
                {pattern.memoryNotes && pattern.memoryNotes.length > 0 && (
                  <DetailList label="Helpful preference" values={pattern.memoryNotes} />
                )}
              </dl>
            </section>
          )}

          <section className="border-t border-[var(--care-line)] pt-6">
            <SectionHeading eyebrow="Human follow-up" title="Recorded actions" />
            <p className="mt-3 text-sm leading-6 text-gray-600">
              {pattern.previousActions.length === 0
                ? "No caregiver action recorded yet."
                : `${pattern.previousActions.length} caregiver ${
                    pattern.previousActions.length === 1 ? "action is" : "actions are"
                  } included in the care thread.`}
            </p>

            {briefing && (
              <div className="mt-6 border-y border-l-4 border-[var(--care-line)] border-l-[var(--care-evergreen)] p-4">
                <div className="text-xs font-semibold text-[var(--care-evergreen)]">AI-generated caregiver summary</div>
                <div className="mt-2 text-sm leading-6 text-gray-900">
                  {briefing.forCaregiver}
                  {briefing.recommendedActions.length > 0 && (
                    <div className="mt-2 text-gray-700">{briefing.recommendedActions.join(" ")}</div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ThreadMarker({ entry }: { entry: CareThreadEntry }) {
  const markerClass =
    entry.kind === "signal"
      ? evidenceMarker[entry.evidence.severity]
      : entry.kind === "caregiver"
        ? "bg-[var(--status-green)]"
        : "bg-[var(--care-evergreen)]";

  return (
    <span
      className={`absolute -left-1 top-1 h-2 w-2 rounded-full ${markerClass}`}
      aria-hidden="true"
    />
  );
}

function ThreadEntry({ entry }: { entry: CareThreadEntry }) {
  if (entry.kind === "signal") {
    return (
      <>
        <div className="mt-1 text-xs font-bold uppercase text-[var(--care-evergreen)]">
          Observed signal
        </div>
        <div className="mt-1 text-sm font-semibold text-gray-950">
          {labelPattern(entry.evidence.type)}
          <span className="font-normal text-gray-500">
            {` · ${evidenceSeverityLabel[entry.evidence.severity]}`}
          </span>
        </div>
        <p className="mt-1 text-sm leading-6 text-gray-700">
          {entry.evidence.description}
        </p>
      </>
    );
  }

  if (entry.kind === "message") {
    return (
      <>
        <div className="mt-1 text-xs font-bold uppercase text-[var(--care-evergreen)]">
          {entry.message.sender === "senior" ? "Senior message" : "TrustKaki reply"}
        </div>
        <p className="mt-1 text-sm leading-6 text-gray-700">
          {entry.message.text}
        </p>
        {entry.message.channel && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
            <span className="font-semibold text-gray-700">
              {messageChannelLabel[entry.message.channel]}
            </span>
            {entry.message.processingState && (
              <>
                <span aria-hidden="true">·</span>
                <span>{messageProcessingStateLabel[entry.message.processingState]}</span>
              </>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="mt-1 text-xs font-bold uppercase text-[var(--care-evergreen)]">
        Caregiver record
      </div>
      <div className="mt-1 text-sm font-semibold text-gray-950">
        {caregiverActionLabel(entry.action)}
        {entry.action.caregiver && (
          <span className="font-normal text-gray-500">
            {` · ${entry.action.caregiver}`}
          </span>
        )}
      </div>
      {entry.action.note && (
        <p className="mt-1 text-sm leading-6 text-gray-700">
          {entry.action.note}
        </p>
      )}
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-4">
      <dt className="text-xs font-semibold text-gray-500">{label}</dt>
      <dd className="mt-1.5 text-[15px] leading-6 text-gray-900">{children}</dd>
    </div>
  );
}

function DetailList({ label, values }: { label: string; values: string[] }) {
  return (
    <Detail label={label}>
      <ul className="space-y-2">{values.map((value) => <li key={value}>{value}</li>)}</ul>
    </Detail>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase text-[var(--care-brand)]">
        {eyebrow}
      </div>
      <h3 className="mt-1 text-lg font-bold text-gray-950">{title}</h3>
    </div>
  );
}
