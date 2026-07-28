"use client";

import type { AgentTrace } from "@/lib/types";
import {
  formatAgentInputForCaregiver,
  formatAgentOutputForCaregiver,
  formatStateChangeForCaregiver,
} from "./agentTraceViewModel";

interface AgentTracePanelProps {
  traces: AgentTrace[];
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

export default function AgentTracePanel({ traces, visible, onToggle }: AgentTracePanelProps) {
  return (
    <div className="flex h-full flex-col border-t border-[var(--care-line)] bg-[var(--care-paper)] text-[var(--care-ink)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={visible}
        className="flex min-h-11 shrink-0 items-center justify-between px-4 py-3 text-left hover:bg-[var(--care-mist)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--care-brand)]"
      >
        <span className="text-sm font-semibold">Run details</span>
        <span className="flex items-center gap-2 text-xs text-gray-500">
          <span>{traces.length} {traces.length === 1 ? "run" : "runs"}</span>
          <span aria-hidden="true">{visible ? "-" : "+"}</span>
        </span>
      </button>

      {visible && (
        <div className="flex-1 divide-y divide-[var(--care-line)] overflow-y-auto border-t border-[var(--care-line)]">
          {traces.map((trace) => (
            <article
              key={trace.id}
              className="px-4 py-3 text-xs"
            >
              <div className="flex items-start justify-between gap-3 border-b border-[var(--care-hairline)] pb-2">
                <span className="font-bold text-gray-800">{trace.agentName}</span>
                <code className="shrink-0 font-mono text-[10px] text-gray-500">
                  {formatTime(trace.timestamp)}
                </code>
              </div>

              <div className="divide-y divide-[var(--care-hairline)]">
                <div className="py-2">
                  <div className="font-semibold text-gray-600">What it reviewed</div>
                  <p className="mt-1 leading-relaxed text-gray-700">
                    {formatAgentInputForCaregiver(trace)}
                  </p>
                </div>
                <div className="py-2">
                  <div className="font-semibold text-gray-600">Result</div>
                  <p className="mt-1 leading-relaxed text-gray-700">
                    {formatAgentOutputForCaregiver(trace)}
                  </p>
                </div>
                {trace.stateChanges && trace.stateChanges.length > 0 && (
                  <div className="py-2">
                    <div className="font-semibold text-gray-600">Recorded changes</div>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-gray-700">
                      {trace.stateChanges.slice(0, 4).map((change) => (
                        <li key={change}>{formatStateChangeForCaregiver(change)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {trace.errorMessage && (
                  <div className="py-2">
                    <div className="font-semibold text-gray-600">Fallback or error</div>
                    <p className="mt-1 text-gray-700">{trace.errorMessage}</p>
                  </div>
                )}
                <details className="py-2">
                  <summary className="cursor-pointer font-semibold text-gray-600">
                    Technical values
                  </summary>
                  <dl className="mt-2 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-gray-600">
                    <dt>Model</dt>
                    <dd><code className="font-mono">{trace.modelUsed ?? "not recorded"}</code></dd>
                    <dt>Duration</dt>
                    <dd><code className="font-mono">{trace.durationMs ? `${trace.durationMs} ms` : "not recorded"}</code></dd>
                    <dt>Fallback</dt>
                    <dd><code className="font-mono">{trace.fallback ? "yes" : "no"}</code></dd>
                  </dl>
                </details>
              </div>

              <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--care-hairline)] pt-2">
                {trace.tags.map((tag) => (
                  <code key={tag} className="font-mono text-[10px] text-[var(--care-brand)]">
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
