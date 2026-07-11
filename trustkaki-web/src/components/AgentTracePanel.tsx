"use client";

import type { AgentTrace } from "@/lib/types";

interface AgentTracePanelProps {
  traces: AgentTrace[];
  visible: boolean;
  onToggle: () => void;
}

const agentColors: Record<string, string> = {
  triage: "bg-orange-100 border-orange-400 text-orange-800",
  daily_living: "bg-blue-100 border-blue-400 text-blue-800",
  health_frailty: "bg-red-100 border-red-400 text-red-800",
  aac_nudge: "bg-green-100 border-green-400 text-green-800",
  digital_safety: "bg-purple-100 border-purple-400 text-purple-800",
  briefing: "bg-indigo-100 border-indigo-400 text-indigo-800",
  orchestrator: "bg-slate-100 border-slate-400 text-slate-800",
  policy: "bg-gray-100 border-gray-400 text-gray-800",
  pattern_watch: "bg-teal-100 border-teal-400 text-teal-800",
};

const agentIcons: Record<string, string> = {
  triage: "🔍",
  daily_living: "🍽️",
  health_frailty: "🏥",
  aac_nudge: "🤝",
  digital_safety: "🛡️",
  briefing: "📋",
  orchestrator: "🧭",
  policy: "⚖️",
  pattern_watch: "📈",
};

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function compactOutput(output: string): string {
  try {
    return JSON.stringify(JSON.parse(output), null, 2);
  } catch {
    return output.length > 600 ? `${output.slice(0, 597)}...` : output;
  }
}

export default function AgentTracePanel({ traces, visible, onToggle }: AgentTracePanelProps) {
  return (
    <div className="flex flex-col h-full">
      <button
        onClick={onToggle}
        className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white hover:bg-gray-800 transition-colors shrink-0"
      >
        <div className="flex items-center gap-2">
          <span>🧠</span>
          <span className="font-semibold text-sm">Agent Trace</span>
          <span className="text-xs bg-gray-700 px-2 py-0.5 rounded-full">{traces.length}</span>
        </div>
        <span className="text-xs">{visible ? "▼" : "▲"}</span>
      </button>

      {visible && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-950">
          {traces.map((trace) => (
            <div
              key={trace.id}
              className={`border rounded-lg p-3 text-xs ${agentColors[trace.agentId] || "bg-gray-800 border-gray-600 text-gray-300"}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{agentIcons[trace.agentId] || "🤖"}</span>
                <span className="font-bold">{trace.agentName}</span>
                <span className="ml-auto opacity-60">{formatTime(trace.timestamp)}</span>
              </div>

              <div className="space-y-1.5">
                <div>
                  <span className="font-semibold">Input summary:</span>
                  <p className="mt-0.5 opacity-90">{trace.inputSummary ?? "No summary available"}</p>
                </div>
                <div>
                  <span className="font-semibold">Structured output:</span>
                  <pre className="mt-0.5 whitespace-pre-wrap opacity-90 font-mono text-[10px]">
                    {trace.outputSummary ?? compactOutput(trace.output)}
                  </pre>
                </div>
                {trace.stateChanges && trace.stateChanges.length > 0 && (
                  <div>
                    <span className="font-semibold">Tool/state changes:</span>
                    <p className="mt-0.5 opacity-90">{trace.stateChanges.join(", ")}</p>
                  </div>
                )}
                {trace.errorMessage && (
                  <div>
                    <span className="font-semibold">Fallback/error:</span>
                    <p className="mt-0.5 opacity-90">{trace.errorMessage}</p>
                  </div>
                )}
                <details>
                  <summary className="cursor-pointer font-semibold opacity-80">
                    Advanced raw JSON
                  </summary>
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] opacity-80">
                    {compactOutput(trace.output)}
                  </pre>
                </details>
              </div>

              <div className="flex gap-1 mt-2 flex-wrap">
                {trace.tags.map((tag) => (
                  <span key={tag} className="px-1.5 py-0.5 rounded bg-black/20 text-[10px] font-medium">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
