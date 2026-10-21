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
    <section className="border-y border-[var(--care-line)] bg-[var(--care-surface-muted)] px-5 py-6 sm:px-7" aria-label="Follow-up & handover">
      <div className="text-sm font-semibold text-[var(--care-evergreen)]">Human follow-up</div>
      <h4 className="mt-1 font-display text-2xl font-bold leading-tight text-gray-950">Follow-up &amp; handover</h4>
      <p className="mt-3 inline-block border border-[var(--care-line)] bg-white px-3 py-1.5 text-base font-medium text-gray-900">
        {statusLabel[item.status]} · {handover.owner === "Unassigned" ? "Unassigned" : `Assigned to ${handover.owner}`}
      </p>
      <dl className="mt-6 grid gap-6 text-base leading-7 lg:grid-cols-2 lg:gap-x-10">
        <div>
          <dt className="font-semibold text-gray-900">Latest recorded outcome</dt>
          <dd className="mt-1 max-w-[65ch] text-gray-900">
            {outcome ? <>
              {outcome.outcomeType ? labelPattern(outcome.outcomeType) : outcome.actionType === "resolve" ? "Case closed as resolved" : "Outcome recorded"}
              {outcome.note?.trim() ? <p className="whitespace-pre-wrap">{outcome.note}</p> : <p>No outcome note recorded.</p>}
              <a className="mt-2 inline-block break-words text-base font-medium text-[var(--care-evergreen)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" href={`#${careActionAnchor(item.id, outcome.id)}`}>
                {formatDate(outcome.createdAt)} · {outcome.caregiver || "Recorded caregiver action"}
              </a>
            </> : "No dated outcome recorded yet."}
          </dd>
        </div>
        {handover.note && handover.note.id !== outcome?.id && <div>
          <dt className="font-semibold text-gray-900">Latest caregiver note</dt>
          <dd className="mt-1 max-w-[65ch] text-gray-900">
            <p className="whitespace-pre-wrap">{handover.note.note}</p>
            <a className="mt-2 inline-block break-words text-base font-medium text-[var(--care-evergreen)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" href={`#${careActionAnchor(item.id, handover.note.id)}`}>
              {formatDate(handover.note.createdAt)} · {handover.note.caregiver || "Recorded caregiver action"}
            </a>
          </dd>
        </div>}
        <div>
          <dt className="font-semibold text-gray-900">{item.status === "resolved" ? "Follow-up status" : "Suggested next action · TrustKaki"}</dt>
          <dd className="mt-1 max-w-[65ch] text-gray-900">{item.status === "resolved" ? "Case resolved. Earlier notes remain in the history." : handover.suggestion || "No suggested action available. Review the case before deciding."}</dd>
          {item.status !== "resolved" && <p className="mt-2 max-w-[65ch] text-sm leading-6 text-gray-700">Suggestion for caregiver review; not a recorded commitment or completed action.</p>}
        </div>
      </dl>
      {handover.undatedActions && <p className="mt-4 text-sm leading-6 text-gray-700">Some actions have no valid date and are excluded from the latest-record summary. Review the care thread.</p>}
      <p className="mt-5 text-sm leading-6 text-gray-700">Recorded actions: {actions.length}. Source records are in the care thread.</p>
      {briefing && <details className="mt-5 border-t border-[var(--care-line)] pt-4">
        <summary className="cursor-pointer text-base font-semibold text-[var(--care-evergreen)]">AI-generated caregiver summary</summary>
        <p className="mt-3 max-w-[65ch] text-base leading-7 text-gray-900">{briefing.forCaregiver}</p>
        {briefing.recommendedActions.length > 0 && <p className="mt-3 max-w-[65ch] text-base leading-7 text-gray-900">{briefing.recommendedActions.join(" ")}</p>}
      </details>}
    </section>
  );
}
