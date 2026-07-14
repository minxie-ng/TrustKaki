import type {
  ContactKind,
  EvaluatedRecipientCandidate,
  NotificationDestination,
  RecipientCandidate,
  RecipientConsentEvent,
  RecipientReasonCode,
  RecipientSelectionInput,
  RecipientSelectionResult,
} from "./contracts";

const destinationKinds: Partial<Record<NotificationDestination, ContactKind>> = {
  family_guardian: "family_guardian",
  aac_supervisor: "aac_staff",
  healthcare_follow_up: "healthcare_contact",
};

function timestamp(value: string): number {
  return new Date(value).getTime();
}

function latestConsent(
  events: RecipientConsentEvent[]
): RecipientConsentEvent | null {
  return [...events].sort((left, right) => {
    return (
      timestamp(right.confirmedAt) - timestamp(left.confirmedAt) ||
      timestamp(right.createdAt) - timestamp(left.createdAt) ||
      right.id.localeCompare(left.id)
    );
  })[0] ?? null;
}

function minutesAt(instant: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function isQuietHours(
  instant: string,
  timezone: string,
  start: string | null,
  end: string | null
): boolean {
  if (!start || !end) return false;
  const now = minutesAt(instant, timezone);
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (startMinutes < endMinutes) {
    return now >= startMinutes && now < endMinutes;
  }
  return now >= startMinutes || now < endMinutes;
}

function evaluateCandidate(
  input: RecipientSelectionInput,
  candidate: RecipientCandidate
): EvaluatedRecipientCandidate {
  const reasonCodes: RecipientReasonCode[] = [];
  const expectedKind = destinationKinds[input.destination];
  if (!candidate.contactActive) reasonCodes.push("inactive_contact");
  if (!candidate.methodActive) reasonCodes.push("inactive_method");
  if (!expectedKind || candidate.contactKind !== expectedKind) {
    reasonCodes.push("destination_mismatch");
  }
  if (input.requestedChannel && candidate.channel !== input.requestedChannel) {
    reasonCodes.push("channel_mismatch");
  }
  if (candidate.verificationStatus !== "verified" || !candidate.verifiedAt) {
    reasonCodes.push("unverified_method");
  }

  const consent = latestConsent(candidate.consentEvents);
  if (!consent) {
    reasonCodes.push("consent_missing");
  } else if (consent.eventType === "revoked") {
    reasonCodes.push("consent_revoked");
  } else if (
    consent.expiresAt &&
    timestamp(consent.expiresAt) <= timestamp(input.evaluationTime)
  ) {
    reasonCodes.push("consent_expired");
  } else if (!consent.categories.includes(input.category)) {
    reasonCodes.push("category_not_permitted");
  }

  const quiet = isQuietHours(
    input.evaluationTime,
    candidate.timezone,
    candidate.quietHoursStart,
    candidate.quietHoursEnd
  );
  const canBypassQuietHours =
    input.category === "urgent_safety" &&
    consent?.eventType === "granted" &&
    consent.categories.includes("urgent_safety") &&
    consent.allowUrgentQuietHours;
  if (quiet && !canBypassQuietHours) reasonCodes.push("quiet_hours");

  return { ...candidate, reasonCodes };
}

function compareCandidates(
  left: EvaluatedRecipientCandidate,
  right: EvaluatedRecipientCandidate
): number {
  return (
    left.contactPriority - right.contactPriority ||
    left.methodPriority - right.methodPriority ||
    left.contactId.localeCompare(right.contactId) ||
    left.methodId.localeCompare(right.methodId)
  );
}

export function selectNotificationRecipient(
  input: RecipientSelectionInput,
  candidates: RecipientCandidate[]
): RecipientSelectionResult {
  if (input.destination === "emergency_guidance") {
    return {
      result: "no_eligible_contact",
      selectedContactId: null,
      selectedMethodId: null,
      explanation:
        "Emergency guidance does not contact emergency services or select an automated recipient.",
      candidates: candidates.map((candidate) => ({
        ...candidate,
        reasonCodes: ["destination_mismatch"],
      })),
      skippedReasons: candidates.map((candidate) => ({
        contactId: candidate.contactId,
        methodId: candidate.methodId,
        reasonCodes: ["destination_mismatch"],
      })),
    };
  }

  const evaluated = candidates.map((candidate) =>
    evaluateCandidate(input, candidate)
  );
  const selected = evaluated
    .filter((candidate) => candidate.reasonCodes.length === 0)
    .sort(compareCandidates)[0];

  return {
    result: selected ? "candidate_selected" : "no_eligible_contact",
    selectedContactId: selected?.contactId ?? null,
    selectedMethodId: selected?.methodId ?? null,
    explanation: selected
      ? "Selected the first verified, consented contact in the configured escalation order."
      : "No verified and consented contact is currently eligible; staff follow-up is required.",
    candidates: evaluated,
    skippedReasons: evaluated
      .filter((candidate) => candidate.reasonCodes.length > 0)
      .map((candidate) => ({
        contactId: candidate.contactId,
        methodId: candidate.methodId,
        reasonCodes: candidate.reasonCodes,
      })),
  };
}
