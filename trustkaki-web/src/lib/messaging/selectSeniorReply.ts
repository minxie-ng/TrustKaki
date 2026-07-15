import type { OrchestrateResponse } from "@/lib/agents/contracts";
import type { AgentId } from "@/lib/types";

export interface SelectedSeniorReply {
  text: string;
  agentId?: AgentId;
  index: number;
}

export function selectSeniorReply(
  result: OrchestrateResponse
): SelectedSeniorReply | null {
  const digitalSafetyIndex = result.messages.findIndex(
    (message) => message.agentId === "digital_safety"
  );
  if (digitalSafetyIndex >= 0) {
    return { ...result.messages[digitalSafetyIndex], index: digitalSafetyIndex };
  }

  const triageIndex = result.messages.findIndex(
    (message) => message.agentId === "triage"
  );
  if (triageIndex >= 0) {
    return { ...result.messages[triageIndex], index: triageIndex };
  }

  const first = result.messages[0];
  return first ? { ...first, index: 0 } : null;
}
