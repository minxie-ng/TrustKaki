import type { BriefingOutput } from "@/lib/agents/contracts";
import type { FollowUpQueueItem } from "@/lib/types";
import { buildCaseHandover, careActionAnchor } from "./caseHandover";
import { formatDate, labelPattern, statusLabel } from "./presentation";

export function FollowUpHandover({ item, briefing }: {
  item: FollowUpQueueItem;
  briefing?: BriefingOutput | null;
}) {
  const actions = item.pattern?.previousActions ?? [];
  const handover = buildCaseHandover(item, actions);
  const outcome = handover.outcome;
  return (
    <section className="border-t border-[var(--care-line)] pt-6" aria-label="Follow-up & handover">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--care-muted)]">Human follow-up</div>
      <h4 className="mt-2 text-base font-semibold text-gray-950">Follow-up &amp; handover</h4>
      <p className="mt-2 text-sm text-gray-600">
        {statusLabel[item.status]} · {handover.owner === "Unassigned" ? "Unassigned" : `Assigned to ${handover.owner}`}
      </p>
      <dl className="mt-4 space-y-4 text-sm leading-6">
        <div>
          <dt className="font-semibold text-gray-900">Latest recorded outcome</dt>
          <dd className="text-gray-700">
            {outcome ? <>
              {outcome.outcomeType ? labelPattern(outcome.outcomeType) : outcome.actionType === "resolve" ? "Case closed as resolved" : "Outcome recorded"}
              {outcome.note?.trim() ? <p className="whitespace-pre-wrap">{outcome.note}</p> : <p>No outcome note recorded.</p>}
              <a className="text-[var(--care-evergreen)] underline underline-offset-2" href={`#${careActionAnchor(item.id, outcome.id)}`}>
                {formatDate(outcome.createdAt)} · {outcome.caregiver || "Recorded caregiver action"}
              </a>
            </> : "No dated outcome recorded yet."}
          </dd>
        </div>
        {handover.note && handover.note.id !== outcome?.id && <div>
          <dt className="font-semibold text-gray-900">Latest caregiver note</dt>
          <dd className="text-gray-700">
            <p className="whitespace-pre-wrap">{handover.note.note}</p>
            <a className="text-[var(--care-evergreen)] underline underline-offset-2" href={`#${careActionAnchor(item.id, handover.note.id)}`}>
              {formatDate(handover.note.createdAt)} · {handover.note.caregiver || "Recorded caregiver action"}
            </a>
          </dd>
        </div>}
        <div>
          <dt className="font-semibold text-gray-900">{item.status === "resolved" ? "Follow-up status" : "Suggested next action · TrustKaki"}</dt>
          <dd className="text-gray-700">{item.status === "resolved" ? "Case resolved. Earlier notes remain in the history." : handover.suggestion || "No suggested action available. Review the case before deciding."}</dd>
          {item.status !== "resolved" && <p className="mt-1 text-xs text-gray-500">Suggestion for caregiver review; not a recorded commitment or completed action.</p>}
        </div>
      </dl>
      {handover.undatedActions && <p className="mt-3 text-xs text-gray-500">Some actions have no valid date and are excluded from the latest-record summary. Review the care thread.</p>}
      <p className="mt-4 text-xs text-gray-500">Recorded actions: {actions.length}. Source records are in the care thread.</p>
      {briefing && <details className="mt-4 border-t border-[var(--care-line)] pt-3">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--care-evergreen)]">AI-generated caregiver summary</summary>
        <p className="mt-2 text-sm leading-6 text-gray-700">{briefing.forCaregiver}</p>
        {briefing.recommendedActions.length > 0 && <p className="mt-2 text-sm leading-6 text-gray-700">{briefing.recommendedActions.join(" ")}</p>}
      </details>}
    </section>
  );
}
