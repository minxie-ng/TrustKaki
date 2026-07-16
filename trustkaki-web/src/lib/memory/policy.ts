import {
  memoryApplicationTags,
  memoryContextTypes,
  memoryRetentionClasses,
  memoryTargetStores,
  type MemoryApplicationTag,
  type MemoryCandidate,
  type MemoryContextType,
  type MemoryEligibilityResult,
  type MemoryRetentionClass,
  type MemorySourceMessage,
  type MemoryTargetStore,
} from "./contracts";

const MINIMUM_CONFIDENCE = 0.85;
const MAX_CONTEXT_KEY_LENGTH = 80;
const MAX_CONTENT_LENGTH = 500;
const MAX_EVIDENCE_LENGTH = 500;
const MAX_APPLICATION_TAGS = 3;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const retentionDays: Record<MemoryRetentionClass, number> = {
  health_accessibility: 30,
  routine_baseline: 90,
  preference: 180,
  family_routing: 180,
};

interface ContextPolicy {
  targetStore: MemoryTargetStore;
  retentionClass: MemoryRetentionClass;
  applicationTags: readonly MemoryApplicationTag[];
}

const contextPolicies: Record<MemoryContextType, ContextPolicy> = {
  communication_preference: {
    targetStore: "memory",
    retentionClass: "preference",
    applicationTags: ["concise_text", "gentle_one_to_one", "voice_preferred"],
  },
  food_preference: {
    targetStore: "memory",
    retentionClass: "preference",
    applicationTags: ["gentle_one_to_one", "practical_meal_prompt"],
  },
  routine_preference: {
    targetStore: "memory",
    retentionClass: "preference",
    applicationTags: ["gentle_one_to_one", "practical_meal_prompt"],
  },
  aac_preference: {
    targetStore: "memory",
    retentionClass: "preference",
    applicationTags: ["concise_text", "voice_preferred", "accessibility_support"],
  },
  family_routing: {
    targetStore: "memory",
    retentionClass: "family_routing",
    applicationTags: ["trusted_contact_route"],
  },
  health_observation: {
    targetStore: "health_context",
    retentionClass: "health_accessibility",
    applicationTags: [
      "gentle_one_to_one",
      "practical_meal_prompt",
      "accessibility_support",
    ],
  },
  accessibility_need: {
    targetStore: "health_context",
    retentionClass: "health_accessibility",
    applicationTags: [
      "concise_text",
      "gentle_one_to_one",
      "voice_preferred",
      "accessibility_support",
    ],
  },
  routine_baseline: {
    targetStore: "routine_baseline",
    retentionClass: "routine_baseline",
    applicationTags: ["gentle_one_to_one", "practical_meal_prompt"],
  },
};

const sensitiveDataPatterns = [
  /\b(?:otp|one[- ]time (?:password|pin|code))\b/i,
  /\b(?:bank|internet banking|account)\s+(?:password|pin|credential)s?\b/i,
  /\b(?:password|passcode|security code|cvv|cvc)\s*(?:is|:)/i,
  /\b(?:credit|debit|bank)\s+card\s+(?:number|details?)\b/i,
  /\b(?:passport|identity card|national id|nric)\s*(?:number|no\.?|is|:)/i,
  /\bnric\s+[stfgm]\d{7}[a-z]\b/i,
  /\bbank\s+account(?:\s+(?:number|no\.?|is|:))?\s+\d[\d -]{2,}\d\b/i,
  /\bpassport\s+(?=[a-z0-9-]*\d)[a-z0-9][a-z0-9-]{5,}\b/i,
  /\bpin\s*(?:is|:)\s*\d{4,12}\b/i,
];

const diagnosticPatterns = [
  /\b(?:diagnosed|diagnosis)\s+(?:as|with|of)\b/i,
  /\b(?:likely|probably|possibly|may|might|must)\s+(?:have|has|be)\b/i,
  /\b(?:suspect|suggests?|indicates?|appears? to have)\b/i,
  /\b(?:have|has)\s+(?:dementia|diabetes|cancer|parkinson(?:'s)?|depression)\b/i,
];

const selfDiagnosticClaimPatterns = [
  /(?:^|\n)\s*i\s+(?:think|believe)\s+i\s+(?:have|may have|might have)\s+[a-z][a-z'-]*(?:[ \t]+[a-z][a-z'-]*){0,5}[.!?]?(?=\n|$)/i,
];

const treatmentInstructionPatterns = [
  /(?:^|\n)\s*(?:please\s+)?(?:take|start|stop|increase|decrease)\s+(?:(?:one|two|three|four|\d+(?:\.\d+)?)\s+)?[a-z][a-z-]*(?:\s+\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml))?\s+(?:daily|nightly|weekly|monthly|once|twice|(?:once|twice|three times)\s+(?:a|per)\s+(?:day|week))\b/i,
];

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function hasPattern(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function isSupportedCandidate(candidate: MemoryCandidate): boolean {
  if (!includes(memoryTargetStores, candidate.targetStore)) return false;
  if (!includes(memoryContextTypes, candidate.contextType)) return false;
  if (!includes(memoryRetentionClasses, candidate.retentionClass)) return false;

  const policy = contextPolicies[candidate.contextType];
  if (
    policy.targetStore !== candidate.targetStore ||
    policy.retentionClass !== candidate.retentionClass
  ) {
    return false;
  }

  if (
    !Array.isArray(candidate.applicationTags) ||
    candidate.applicationTags.length === 0 ||
    candidate.applicationTags.length > MAX_APPLICATION_TAGS ||
    new Set(candidate.applicationTags).size !== candidate.applicationTags.length
  ) {
    return false;
  }

  return candidate.applicationTags.every(
    (tag) =>
      includes(memoryApplicationTags, tag) && policy.applicationTags.includes(tag)
  );
}

function hasValidBounds(candidate: MemoryCandidate): boolean {
  if (
    typeof candidate.contextKey !== "string" ||
    candidate.contextKey.length > MAX_CONTEXT_KEY_LENGTH
  ) {
    return false;
  }

  const contextKey = normaliseContextKey(candidate.contextKey);
  return (
    contextKey.length > 0 &&
    contextKey.length <= MAX_CONTEXT_KEY_LENGTH &&
    typeof candidate.content === "string" &&
    candidate.content.trim().length > 0 &&
    candidate.content.length <= MAX_CONTENT_LENGTH &&
    typeof candidate.evidenceExcerpt === "string" &&
    candidate.evidenceExcerpt.length > 0 &&
    candidate.evidenceExcerpt.length <= MAX_EVIDENCE_LENGTH &&
    (candidate.intent === undefined ||
      candidate.intent === "confirm" ||
      candidate.intent === "replace")
  );
}

export function normaliseContextKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function expiryForRetention(
  retentionClass: MemoryRetentionClass,
  now: Date
): string {
  return new Date(
    now.getTime() + retentionDays[retentionClass] * MILLISECONDS_PER_DAY
  ).toISOString();
}

export function evaluateMemoryCandidate(
  candidate: MemoryCandidate,
  sourceMessage: MemorySourceMessage
): MemoryEligibilityResult {
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !Number.isFinite(candidate.confidence) ||
    candidate.confidence < 0 ||
    candidate.confidence > 1
  ) {
    return { accepted: false, reason: "invalid_candidate" };
  }
  if (candidate.confidence < MINIMUM_CONFIDENCE) {
    return { accepted: false, reason: "low_confidence" };
  }

  if (
    !sourceMessage ||
    sourceMessage.sender !== "senior" ||
    candidate.sourceMessageId !== sourceMessage.id ||
    typeof sourceMessage.text !== "string" ||
    typeof candidate.evidenceExcerpt !== "string" ||
    candidate.evidenceExcerpt.trim().length === 0 ||
    !sourceMessage.text.includes(candidate.evidenceExcerpt)
  ) {
    return { accepted: false, reason: "unsupported_evidence" };
  }

  const proposedText = `${candidate.contextKey}\n${candidate.content}\n${candidate.evidenceExcerpt}`;
  if (hasPattern(proposedText, sensitiveDataPatterns)) {
    return { accepted: false, reason: "sensitive_data" };
  }
  if (
    hasPattern(proposedText, diagnosticPatterns) ||
    hasPattern(proposedText, selfDiagnosticClaimPatterns)
  ) {
    return { accepted: false, reason: "diagnostic_inference" };
  }
  if (hasPattern(proposedText, treatmentInstructionPatterns)) {
    return { accepted: false, reason: "treatment_instruction" };
  }
  if (!hasValidBounds(candidate) || !isSupportedCandidate(candidate)) {
    return { accepted: false, reason: "invalid_candidate" };
  }

  return {
    accepted: true,
    candidate: {
      ...candidate,
      contextKey: normaliseContextKey(candidate.contextKey),
    },
    expiresInDays: retentionDays[candidate.retentionClass],
  };
}
