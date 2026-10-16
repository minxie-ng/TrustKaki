import type { RoutingJudgment } from "./routingContract";

export type RoutingSpecialist = "digital_safety" | "context_memory" | "aac_nudge";
interface BaselineRouting { digitalSafety: boolean; contextMemory: boolean; social: boolean }

export function selectSpecialistRouting(judgment: RoutingJudgment | null, baseline: BaselineRouting, memoryAllowed: boolean) {
  const requestedSpecialists: RoutingSpecialist[] = [];
  if (judgment && judgment.digital_safety !== "absent") requestedSpecialists.push("digital_safety");
  if (judgment?.durable_context === "present") requestedSpecialists.push("context_memory");
  if (judgment?.social === "present") requestedSpecialists.push("aac_nudge");
  const independentTriggers: RoutingSpecialist[] = [];
  if (baseline.digitalSafety) independentTriggers.push("digital_safety");
  if (baseline.contextMemory) independentTriggers.push("context_memory");
  if (baseline.social) independentTriggers.push("aac_nudge");
  return {
    requestedSpecialists, independentTriggers,
    digitalSafety: baseline.digitalSafety || requestedSpecialists.includes("digital_safety"),
    contextMemory: memoryAllowed && (baseline.contextMemory || requestedSpecialists.includes("context_memory")),
    social: baseline.social || requestedSpecialists.includes("aac_nudge"),
    carePause: judgment !== null && [judgment.health, judgment.daily_living, judgment.urgent].some(label => label !== "absent"),
  };
}

export type SpecialistRouting = ReturnType<typeof selectSpecialistRouting>;
