import type { BriefingOutput } from "@/lib/agents/contracts";
import type { AgentTrace, DashboardData, FollowUpQueueItem } from "@/lib/types";
import { recentSeniorMessages, systemProof } from "../dashboardViewModel";
import {
  escalationDestinationLabel,
  formatDate,
  labelPattern,
} from "./presentation";

interface CaseDetailsProps {
  item: FollowUpQueueItem;
  data: DashboardData;
  traces: AgentTrace[];
  briefing?: BriefingOutput | null;
}

export function CaseDetails({ item, data, traces, briefing }: CaseDetailsProps) {
  if (!item.pattern) return null;
  const pattern = item.pattern;
  const seniorMessages = recentSeniorMessages(data);
  const proof = systemProof({ data, traces, selected: item });

  return (
    <div className="mt-5 border-t border-gray-200 pt-5">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-lg font-bold text-gray-950">Chronological evidence timeline</h3>
            <div className="mt-2 space-y-2">
              {pattern.evidence.map((evidence) => (
                <div key={evidence.id} className="rounded-lg border border-gray-200 bg-white p-3 text-xs">
                  <div className="font-semibold text-gray-800">
                    {formatDate(evidence.observedAt)} · {evidence.type}
                  </div>
                  <div className="mt-1 text-gray-700">{evidence.description}</div>
                </div>
              ))}
            </div>
            <h3 className="mt-4 text-lg font-bold text-gray-950">Relevant senior messages</h3>
            <div className="mt-2 space-y-2">
              {seniorMessages.length === 0 ? (
                <div className="text-sm text-gray-600">No persisted senior messages in this view yet.</div>
              ) : seniorMessages.map((message) => (
                <div key={message.id} className="rounded-lg border border-gray-200 bg-white p-3 text-xs">
                  <div className="font-semibold text-gray-700">{formatDate(message.timestamp)}</div>
                  <div className="mt-1 text-gray-800">{message.text}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <Detail label="Supporting patterns">
              {item.relatedPatterns.map((related) => labelPattern(related.type)).join(", ") || "No supporting patterns yet."}
            </Detail>
            <Detail label="Deterministic Pattern Watch">{pattern.triggerExplanation}</Detail>
            <Detail label="Compared with usual">{pattern.comparison}</Detail>
            {pattern.usualRoutine && pattern.usualRoutine.length > 0 && (
              <DetailList label="Usual routine" values={pattern.usualRoutine} />
            )}
            {pattern.knownContext && pattern.knownContext.length > 0 && (
              <DetailList label="Known context" values={pattern.knownContext} />
            )}
            {pattern.memoryNotes && pattern.memoryNotes.length > 0 && (
              <DetailList label="Helpful preference" values={pattern.memoryNotes} />
            )}
            {briefing && (
              <Detail label="AI-generated summary">
                {briefing.forCaregiver}
                {briefing.recommendedActions.length > 0 && (
                  <div className="mt-2 text-gray-700">{briefing.recommendedActions.join(" ")}</div>
                )}
              </Detail>
            )}
            <Detail label="Caregiver-recorded action history">
              {pattern.previousActions.length === 0
                ? "No caregiver action recorded yet."
                : pattern.previousActions.map((action) => (
                    <div key={action.id}>
                      {formatDate(action.createdAt)} · {labelPattern(action.actionType)}
                      {action.escalationDestination
                        ? ` to ${escalationDestinationLabel[action.escalationDestination]}`
                        : ""}
                      {action.note ? ` · ${action.note}` : ""}
                    </div>
                  ))}
            </Detail>
            <details className="rounded-lg border border-gray-200 bg-white p-3 text-xs">
              <summary className="cursor-pointer font-semibold text-gray-700">
                How TrustKaki reached this recommendation
              </summary>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-gray-600">
                <dt>Messages persisted</dt><dd className="text-right font-semibold">{proof.messagesPersisted}</dd>
                <dt>Signals detected</dt><dd className="text-right font-semibold">{proof.signalsDetected}</dd>
                <dt>Active patterns</dt><dd className="text-right font-semibold">{proof.activePatterns}</dd>
                <dt>Agent runs completed</dt><dd className="text-right font-semibold">{proof.agentRunsCompleted}</dd>
                <dt>Caregiver action recorded</dt><dd className="text-right font-semibold">{proof.caregiverActionRecorded ? "Yes" : "No"}</dd>
              </dl>
              <div className="mt-2 text-gray-600">
                Deterministic policy result: {proof.deterministicPolicyResult}
              </div>
            </details>
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-gray-500">Advanced technical trace</summary>
              <div className="mt-2 text-gray-600">
                Pattern evidence: {pattern.evidence.length} item{pattern.evidence.length === 1 ? "" : "s"}. Agent traces remain in the technical panel.
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="text-xs font-semibold text-gray-500">{label}</div>
      <div className="mt-1 text-gray-900">{children}</div>
    </div>
  );
}

function DetailList({ label, values }: { label: string; values: string[] }) {
  return (
    <Detail label={label}>
      <ul className="space-y-1">{values.map((value) => <li key={value}>{value}</li>)}</ul>
    </Detail>
  );
}
