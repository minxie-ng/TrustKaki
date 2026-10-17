"use client";

import { useState } from "react";
import type { AgentTrace } from "@/lib/types";
import ChatSimulation, { type ChatSimulationProps } from "./ChatSimulation";
import AgentTracePanel from "./AgentTracePanel";
import type { JudgeRun } from "./judgeRunViewModel";

export default function JudgeWorkspace(props: ChatSimulationProps & { traces: AgentTrace[] }) {
  const [run, setRun] = useState<JudgeRun | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(true);
  return <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
    <div className="min-h-[480px] min-w-0 border-b border-[var(--care-line)] lg:min-h-0 lg:border-b-0 lg:border-r">
      <ChatSimulation {...props} onResult={setRun} />
    </div>
    <div className="min-h-[380px] min-w-0 lg:min-h-0">
      <AgentTracePanel traces={run?.traces ?? props.traces} run={run} visible={detailsVisible} onToggle={() => setDetailsVisible((value) => !value)} />
    </div>
  </div>;
}
