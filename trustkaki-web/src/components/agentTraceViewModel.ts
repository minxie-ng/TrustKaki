interface AgentOutputFormatInput {
  inputSummary?: string | null;
  input?: string | null;
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

function looksTechnical(value: string): boolean {
  return /[{}[\]"]/.test(value) || /"?[a-zA-Z0-9_]+"?\s*:/.test(value);
}

function collectSignalDescriptions(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectSignalDescriptions(item));
  }

  const record = value as Record<string, unknown>;
  const direct = textList(record.signals);
  return [
    ...direct,
    ...Object.values(record).flatMap((item) => collectSignalDescriptions(item)),
  ];
}

function readableSummaryFromParsed(value: unknown): string | null {
  const signalText = collectSignalDescriptions(value).slice(0, 3);
  if (signalText.length > 0) return signalText.join(" ");
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const parts = [
    record.summary,
    record.message,
    record.text,
    record.recommendedAction,
    record.route ? `Route: ${String(record.route).replaceAll("_", " ")}.` : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0);
  return parts.length > 0 ? parts.join(" ") : null;
}

function riskText(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return `Risk level: ${value}.`;
}

export function formatAgentInputForCaregiver(input: AgentOutputFormatInput): string {
  const summary = input.inputSummary?.trim();
  if (summary && !looksTechnical(summary)) return summary;

  const rawInput = input.input?.trim();
  if (!rawInput) return "Relevant senior context and recent messages.";
  if (!looksTechnical(rawInput)) return rawInput;

  try {
    const parsed = JSON.parse(rawInput) as unknown;
    return readableSummaryFromParsed(parsed) ?? "Relevant senior context and recent messages.";
  } catch {
    return "Relevant senior context and recent messages.";
  }
}

export function formatAgentOutputForCaregiver(input: AgentOutputFormatInput): string {
  const summary = input.outputSummary?.trim();
  if (summary && !looksTechnical(summary)) return summary;
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
      riskText(parsed.riskLevel),
      parsed.humanFollowUp === true ? "Human follow-up suggested." : null,
    ].filter((item): item is string => typeof item === "string" && item.length > 0);
    const signalText = collectSignalDescriptions(parsed).slice(0, 3);
    const concernText = textList(parsed.keyConcerns).slice(0, 3);
    const actionText = textList(parsed.recommendedActions).slice(0, 3);
    const combined = Array.from(
      new Set([...parts, ...signalText, ...concernText, ...actionText])
    );
    if (combined.length > 0) return combined.join(" ");
  } catch {
    return "Structured result recorded.";
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
