import type { BriefingOutput } from "@/lib/agents/contracts";
import type {
  CaregiverActionItem,
  DashboardData,
  FollowUpQueueItem,
} from "@/lib/types";
import { recentSeniorMessages } from "../dashboardViewModel";
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
  low: "bg-[var(--care-green)]",
  medium: "bg-[var(--care-amber)]",
  high: "bg-[var(--care-red)]",
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

export function CaseDetails({ item, data, briefing }: CaseDetailsProps) {
  if (!item.pattern) return null;
  const pattern = item.pattern;
  const seniorMessages = recentSeniorMessages(data);

  return (
    <div className="mt-6 border-t border-[var(--care-line)] pt-6">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] xl:gap-10">
        <div>
          <SectionHeading eyebrow="Evidence" title="Chronological evidence timeline" />
          {pattern.evidence.length === 0 ? (
            <div className="mt-4 border-l-[3px] border-l-[var(--care-teal-line)] bg-[var(--care-surface-muted)] px-4 py-3">
              <div className="text-sm font-semibold text-gray-900">No timeline evidence yet</div>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                Evidence will appear here as relevant observations are recorded.
              </p>
            </div>
          ) : (
            <ol className="relative ml-2 mt-5 space-y-7 border-l border-gray-300">
              {pattern.evidence.map((evidence) => (
                <li key={evidence.id} className="relative pl-7">
                  <span
                    className={`absolute -left-[7px] top-1 h-[13px] w-[13px] rounded-full ring-4 ring-white ${evidenceMarker[evidence.severity]}`}
                    aria-hidden="true"
                  />
                  <div className="text-xs font-semibold text-gray-500">
                    {formatDate(evidence.observedAt)}
                  </div>
                  <div className="mt-1 text-sm font-bold text-gray-950">
                    {labelPattern(evidence.type)}
                  </div>
                  <div className="mt-1 text-sm leading-6 text-gray-700">
                    {evidence.description}
                  </div>
                </li>
              ))}
            </ol>
          )}

          <section className="mt-8 border-t border-[var(--care-line)] pt-6">
            <SectionHeading eyebrow="Conversation" title="Relevant senior messages" />
            <div className="mt-4 space-y-3">
              {seniorMessages.length === 0 ? (
                <div className="text-sm leading-6 text-gray-600">
                  No senior messages recorded for this case yet.
                </div>
              ) : seniorMessages.map((message) => (
                <div key={message.id} className="border-l-2 border-l-[var(--care-teal-line)] pl-4">
                  <div className="text-xs font-semibold text-gray-500">{formatDate(message.timestamp)}</div>
                  <div className="mt-1 text-sm leading-6 text-gray-800">{message.text}</div>
                </div>
              ))}
            </div>
          </section>
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

          <section>
            <SectionHeading eyebrow="Caregiver record" title="Recorded actions" />
            {pattern.previousActions.length === 0 ? (
              <p className="mt-4 text-sm leading-6 text-gray-600">No caregiver action recorded yet.</p>
            ) : (
              <ol className="mt-4 divide-y divide-[var(--care-line)] border-y border-[var(--care-line)]">
                {pattern.previousActions.map((action) => (
                  <li key={action.id} className="grid gap-1 py-3 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-4">
                    <time className="text-xs font-semibold text-gray-500">
                      {formatDate(action.createdAt)}
                    </time>
                    <div>
                      <div className="text-sm font-semibold text-gray-950">
                        {caregiverActionLabel(action)}
                        {action.caregiver && (
                          <span className="font-normal text-gray-500"> · {action.caregiver}</span>
                        )}
                      </div>
                      {action.note && (
                        <p className="mt-1 text-sm leading-6 text-gray-700">{action.note}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {briefing && (
              <div className="mt-6 border-l-4 border-[var(--care-brand)] bg-[var(--care-soft-teal)] p-4">
                <div className="text-xs font-semibold text-[var(--care-brand)]">AI-generated caregiver summary</div>
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
