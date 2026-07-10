"use client";

import { useState } from "react";
import type { AgentTrace, AgentId } from "@/lib/types";

interface AgentTracePanelProps {
  traces: AgentTrace[];
}

const agentConfig: Record<
  AgentId,
  { name: string; color: string; bg: string; border: string; icon: string; accent: string }
> = {
  triage: {
    name: "Triage Agent",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: "🔀",
    accent: "bg-blue-500",
  },
  daily_living: {
    name: "Daily Living Agent",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: "🍽️",
    accent: "bg-amber-500",
  },
  health_frailty: {
    name: "Health & Frailty Agent",
    color: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-200",
    icon: "🏥",
    accent: "bg-rose-500",
  },
  aac_nudge: {
    name: "AAC Nudge Agent",
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-200",
    icon: "👥",
    accent: "bg-violet-500",
  },
  digital_safety: {
    name: "Digital Safety Agent",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    icon: "🛡️",
    accent: "bg-red-500",
  },
  briefing: {
    name: "Briefing Agent",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: "📋",
    accent: "bg-emerald-500",
  },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export default function AgentTracePanel({ traces }: AgentTracePanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(traces[0]?.id ?? null);

  const toggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">
            Agent Reasoning Pipeline
          </h3>
          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600">
            {traces.length} traces
          </span>
        </div>
        <span className="text-xs text-zinc-400">
          Click cards to expand
        </span>
      </div>

      {/* Pipeline flow */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {traces.map((trace, i) => {
          const cfg = agentConfig[trace.agentId];
          return (
            <div key={trace.id} className="flex items-center gap-1">
              <div
                className={`flex items-center gap-1.5 rounded-lg ${cfg.bg} border ${cfg.border} px-2 py-1 text-[10px] font-medium ${cfg.color} whitespace-nowrap`}
              >
                <span>{cfg.icon}</span>
                {cfg.name.replace(" Agent", "")}
              </div>
              {i < traces.length - 1 && (
                <span className="text-zinc-300">→</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Trace cards */}
      <div className="space-y-2.5">
        {traces.map((trace, index) => {
          const cfg = agentConfig[trace.agentId];
          const isExpanded = expandedId === trace.id;

          return (
            <div
              key={trace.id}
              className={`overflow-hidden rounded-xl border ${cfg.border} bg-white transition-shadow hover:shadow-sm`}
            >
              {/* Card header */}
              <button
                onClick={() => toggle(trace.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                {/* Step number */}
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${cfg.accent} text-xs font-bold text-white`}
                >
                  {index + 1}
                </div>

                {/* Agent info */}
                <div className="flex flex-1 items-center gap-2">
                  <span className="text-lg">{cfg.icon}</span>
                  <div>
                    <div className={`text-sm font-semibold ${cfg.color}`}>
                      {cfg.name}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      {formatTime(trace.timestamp)}
                    </div>
                  </div>
                </div>

                {/* Tags preview */}
                <div className="hidden items-center gap-1 sm:flex">
                  {trace.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className={`rounded-full ${cfg.bg} px-2 py-0.5 text-[10px] font-medium ${cfg.color}`}
                    >
                      {tag}
                    </span>
                  ))}
                  {trace.tags.length > 2 && (
                    <span className="text-[10px] text-zinc-400">
                      +{trace.tags.length - 2}
                    </span>
                  )}
                </div>

                {/* Expand icon */}
                <span
                  className={`text-zinc-400 transition-transform ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                >
                  ▼
                </span>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="space-y-3 border-t border-zinc-100 px-4 py-3">
                  {/* Input */}
                  <div>
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        Input
                      </span>
                    </div>
                    <div className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                      {trace.input}
                    </div>
                  </div>

                  {/* Reasoning */}
                  <div>
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        Reasoning
                      </span>
                    </div>
                    <div
                      className={`rounded-lg ${cfg.bg} border-l-2 ${cfg.border.replace("border-", "border-l-")} px-3 py-2 text-sm leading-relaxed text-zinc-700`}
                    >
                      {trace.reasoning}
                    </div>
                  </div>

                  {/* Output */}
                  <div>
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        Output
                      </span>
                    </div>
                    <div className="rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800">
                      {trace.output}
                    </div>
                  </div>

                  {/* All tags */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {trace.tags.map((tag) => (
                      <span
                        key={tag}
                        className={`rounded-full ${cfg.bg} border ${cfg.border} px-2 py-0.5 text-[10px] font-medium ${cfg.color}`}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
