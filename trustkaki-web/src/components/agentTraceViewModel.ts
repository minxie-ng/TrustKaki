interface AgentOutputFormatInput {
  outputSummary?: string | null;
  output?: string | null;
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (
        item &&
        typeof item === "object" &&
        "description" in item &&
        typeof item.description === "string"
      ) {
        return item.description;
      }
      return null;
    })
    .filter((item): item is string => Boolean(item));
}

export function formatAgentOutputForCaregiver(input: AgentOutputFormatInput): string {
  if (input.outputSummary?.trim()) return input.outputSummary.trim();
  if (!input.output?.trim()) return "No recommendation summary available.";

  try {
    const parsed = JSON.parse(input.output) as Record<string, unknown>;
    const parts = [
      parsed.summary,
      parsed.recommendedAction,
      parsed.responseMessage,
      parsed.nudgeMessage,
      parsed.warningMessage,
      parsed.forCaregiver,
    ].filter((item): item is string => typeof item === "string" && item.length > 0);
    const signalText = textList(parsed.signals).slice(0, 3);
    const concernText = textList(parsed.keyConcerns).slice(0, 3);
    const actionText = textList(parsed.recommendedActions).slice(0, 3);
    const combined = [...parts, ...signalText, ...concernText, ...actionText];
    if (combined.length > 0) return combined.join(" ");
  } catch {
    return input.output.length > 220
      ? `${input.output.slice(0, 217)}...`
      : input.output;
  }

  return "Structured result recorded.";
}

export function formatStateChangeForCaregiver(change: string): string {
  const riskChange = change.match(/^risk:([a-z]+)->([a-z]+)$/i);
  if (riskChange) {
    return `Risk changed from ${riskChange[1]} to ${riskChange[2]}`;
  }
  if (change === "briefing:manual_override") {
    return "Briefing requested by a human";
  }
  if (change.startsWith("briefing:")) return "Caregiver briefing prepared";
  if (change.startsWith("alert:")) return "Caregiver alert decision recorded";
  if (change.startsWith("route:")) return "Specialist agent routing recorded";
  return change.replaceAll("_", " ").replaceAll(":", ": ");
}
