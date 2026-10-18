"use client";

import { recordedRouting, memoryFailureLabel, type JudgeRun } from "./judgeRunViewModel";
import { z } from "zod";
import type { AgentTrace } from "@/lib/types";
import {
  formatAgentInputForCaregiver,
  formatAgentOutputForCaregiver,
  formatStateChangeForCaregiver,
} from "./agentTraceViewModel";

interface AgentTracePanelProps {
  traces: AgentTrace[];
  run?: JudgeRun | null;
  visible: boolean;
  onToggle: () => void;
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AgentTracePanel({ traces, run, visible, onToggle }: AgentTracePanelProps) {
  return (
    <div className="decision-trail flex h-full min-w-0 flex-col border-t border-[var(--care-line)] bg-[var(--care-paper)] text-[var(--care-ink)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={visible}
        className="flex min-h-11 shrink-0 items-center justify-between px-4 py-3 text-left hover:bg-[var(--care-mist)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--care-brand)]"
      >
        <span className="text-lg font-bold">Decision trail</span>
        <span className="flex items-center gap-2 text-sm text-gray-600">
          <span>{traces.length} {traces.length === 1 ? "run" : "runs"}</span>
          <span aria-hidden="true">{visible ? "-" : "+"}</span>
        </span>
      </button>

      {visible && (
        <div className="decision-trail-scroll min-h-0 flex-1 overflow-y-auto border-t border-[var(--care-line)]">
          <section className="decision-trail-outcome space-y-4" aria-label="Run outcome">
            <p className="text-gray-600">{run ? "Last completed message in this workspace." : "Latest recorded traces for the selected senior. Send a message to inspect its retrieved context and save outcome."}</p>
            {run && <>
              <div className="decision-trail-memory"><h3 className="font-semibold">Personal memory retrieved for this request</h3>
                {!run.retrieval || run.retrieval.status === "not_recorded" ? <p className="mt-1 text-gray-600">Retrieval evidence was not recorded.</p>
                  : run.retrieval.status === "unavailable" ? <p className="mt-1 text-gray-600">Retrieval unavailable. No personal memory supplied.</p>
                  : run.retrieval.items.length === 0 ? <p className="mt-1 text-gray-600">No matching personal memory supplied.</p>
                  : <ul className="mt-2 space-y-3">{run.retrieval.items.map((item, index) => <li key={index} className="border-l-2 border-[var(--care-line)] pl-3">
                    <p className="leading-6">{item.content}</p><p className="mt-1 break-words text-gray-600">Source: {item.source} · Confirmed {new Date(item.confirmedAt).toLocaleDateString("en-SG")}</p>
                  </li>)}</ul>}
              </div>
              <div className="decision-trail-summary">
                <div><h3 className="font-semibold">Final policy</h3><p className="decision-trail-risk mt-2 capitalize" data-risk={run.riskLevel}>{run.riskLevel} risk</p><p className="mt-1 text-gray-600">Policy retains safety authority.</p></div>
                <div><h3 className="font-semibold">Save outcome</h3><p className="mt-1">{run.persistence?.persisted === true ? "Saved" : run.persistence?.persisted === false ? "Not saved" : "Not recorded"}{run.persistence?.replayed ? " · Existing request replayed" : ""}</p>
                  {run.persistence?.memory && <p className="mt-1 text-gray-600">Personal memory: {run.persistence.memory.accepted} accepted, {run.persistence.memory.rejected} rejected, {run.persistence.memory.failed} failed</p>}
                  {!!run.persistence?.memory?.failures?.length && <ul className="mt-2 space-y-1 text-gray-600">{[...new Set(run.persistence.memory.failures.map(memoryFailureLabel))].map(label => <li key={label}>{label}</li>)}</ul>}
                </div>
              </div>
            </>}
            {traces.length === 0 && <p className="text-gray-600">No recorded decisions yet.</p>}
          </section>
          {traces.map((trace) => (
            <article
              key={trace.id}
              className="decision-trail-card"
              data-fallback={trace.fallback || Boolean(trace.errorMessage)}
            >
              <div className="decision-trail-card-header">
                <div className="min-w-0"><h3 className="decision-trail-agent">{trace.agentName}</h3><p className="decision-trail-model">{trace.modelUsed ?? "Model not recorded"}</p>
                  {trace.fallback && <span className="decision-trail-fallback">Fallback used</span>}</div>
                <code className="decision-trail-time">
                  {formatTime(trace.timestamp)}
                </code>
              </div>

              <div className="divide-y divide-[var(--care-hairline)]">
                {recordedRouting(trace) && <RoutingDetails trace={trace} />}
                <EnvironmentSources trace={trace} />
                <div className="py-2">
                  <div className="decision-trail-label">What it reviewed</div>
                  <p className="mt-1 leading-relaxed text-gray-700">
                    {formatAgentInputForCaregiver(trace)}
                  </p>
                </div>
                <div className="decision-trail-result">
                  <div className="decision-trail-label">Result</div>
                  <p className="mt-1 leading-relaxed text-gray-700">
                    {formatAgentOutputForCaregiver(trace)}
                  </p>
                </div>
                {trace.stateChanges && trace.stateChanges.length > 0 && (
                  <div className="py-2">
                    <div className="decision-trail-label">Recorded changes</div>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-gray-700">
                      {trace.stateChanges.slice(0, 4).map((change) => (
                        <li key={change}>{formatStateChangeForCaregiver(change)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {trace.errorMessage && (
                  <div className="decision-trail-error">
                    <div className="decision-trail-label">Fallback or error</div>
                    <p className="mt-1 text-gray-700">{trace.errorMessage}</p>
                  </div>
                )}
                <details className="decision-trail-technical">
                  <summary className="cursor-pointer font-semibold text-[var(--care-brand)]">
                    Technical values
                  </summary>
                  <dl className="mt-2 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-gray-600">
                    <dt>Model</dt>
                    <dd className="min-w-0 break-words"><code className="font-mono">{trace.modelUsed ?? "not recorded"}</code></dd>
                    <dt>Duration</dt>
                    <dd className="min-w-0 break-words"><code className="font-mono">{trace.durationMs != null ? `${Math.round(trace.durationMs)} ms` : "not recorded"}</code></dd>
                    <dt>Fallback</dt>
                    <dd className="min-w-0 break-words"><code className="font-mono">{trace.fallback ? "yes" : "no"}</code></dd>
                  </dl>
                </details>
              </div>

              <div className="decision-trail-tags">
                {trace.tags.map((tag) => (
                  <code key={tag} className="decision-trail-tag">
                    {tag}
                  </code>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function RoutingDetails({ trace }: { trace: AgentTrace }) {
  const routing = recordedRouting(trace);
  if (!routing) return null;
  return <dl className="decision-trail-routing">
    {[["Mode", routing.mode], ["Jev requested", routing.requested], ["Actually executed", routing.executed], ["Blocked by policy or exclusions", routing.blocked], ["Independent safety/context triggers", routing.overrides]].map(([label, value]) => <div key={label}><dt className="decision-trail-label">{label}</dt><dd className="mt-1">{value}</dd></div>)}
  </dl>;
}


const environmentEvidenceSchema = z.object({ evidence: z.array(z.object({
  source: z.string().regex(/^https:\/\/api-open\.data\.gov\.sg\/v2\/real-time\/api\/(?:two-hr-forecast|twenty-four-hr-forecast|psi|pm25)$/),
  area: z.string(), issuedAt: z.string(), validFrom: z.string().optional(), validUntil: z.string().optional(), value: z.string(),
})).max(4) });
function EnvironmentSources({ trace }: { trace: AgentTrace }) {
  if (trace.agentName !== "Outdoor Conditions Tool") return null;
  let evidence: z.infer<typeof environmentEvidenceSchema>["evidence"] = [];
  try {
    const parsed = environmentEvidenceSchema.safeParse(JSON.parse(trace.output));
    if (parsed.success) evidence = parsed.data.evidence;
  } catch { return null; }
  if (!evidence.length) return null;
  const time = (value: string) => new Date(value).toLocaleString("en-SG", { timeZone: "Asia/Singapore" }) + " SGT";
  return <details className="py-3">
    <summary className="cursor-pointer font-semibold text-[var(--care-brand)]">Government sources and coverage</summary>
    <ul className="mt-3 space-y-3">{evidence.map(item => <li key={item.source} className="break-words border-l-2 border-[var(--care-line)] pl-3">
      <a href={item.source} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{item.source.split("/").at(-1)?.replaceAll("-", " ")}</a>
      <p className="mt-1">{item.area} · {item.value}</p>
      <p className="mt-1 text-sm text-gray-600">Issued {time(item.issuedAt)}{item.validUntil ? ` · Valid ${item.validFrom ? time(item.validFrom) + " to " : "until "}${time(item.validUntil)}` : " · Observed air reading, not a forecast"}</p>
    </li>)}</ul>
    <a href="https://www.haze.gov.sg/" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block underline underline-offset-4">NEA air-quality guidance</a>
  </details>;
}
