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
const MAX_CONTEXT_KEY_LENGTH = 120;
const MAX_CONTENT_LENGTH = 500;
const MAX_EVIDENCE_LENGTH = 500;
const MIN_EVIDENCE_LENGTH = 8;
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
  /(?:^|\n)\s*i\s+(?:have|live with|suffer from)\s+(?:[a-z][a-z'-]*[ \t]+){0,4}(?:[a-z][a-z'-]*(?:itis|osis|emia|oma|pathy|tension)|[a-z][a-z'-]*[ \t]+(?:syndrome|disease|disorder)|alzheimer(?:'s)?)\b/i,
];

const nonDiagnosticDirectObservationPatterns = [
  /^(?:(?:persistent|ongoing|chronic|long[- ]term|recurring|severe|mild)\s+)*(?:(?:knee|back|joint|hip|leg|arm|shoulder|neck|chest|stomach)\s+)?(?:pain|ache|soreness|stiffness|swelling)(?:\s+for\s+.+)?$/i,
  /^(?:pain|ache|soreness|stiffness|swelling)\s+(?:in|around)\s+.+$/i,
  /^(?:difficulty|trouble|problems?)\s+(?:hearing|seeing|reading|walking|moving|breathing|sleeping)(?:\s+for\s+.+)?$/i,
  /^(?:reduced|poor|little|no|low)\s+appetite(?:\s+for\s+.+)?$/i,
  /^(?:hearing|vision|mobility|breathing|appetite|sleep)\s+(?:difficulty|problems?|loss|issues?)(?:\s+for\s+.+)?$/i,
] as const;

function hasAllPatterns(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.every((pattern) => pattern.test(value));
}

const contextEvidenceMatchers: Record<
  MemoryContextType,
  (value: string) => boolean
> = {
  communication_preference: (value) =>
    hasAllPatterns(value, [
      /\b(?:voice|calls?|texts?|messages?|language|mandarin|english|short|concise)\b/i,
      /\b(?:prefer|would rather|keep|use|send|short|concise|hard to follow|cannot follow|can't follow)\b/i,
    ]),
  food_preference: (value) =>
    hasAllPatterns(value, [
      /\b(?:food|meal|breakfast|lunch|dinner|porridge|rice|meat|vegetables?|vegetarian|vegan|pescatarian)\b/i,
      /\b(?:prefer|like|warm|cold|do not eat|don't eat|cannot eat|can't eat|allergic|vegetarian|vegan|pescatarian|always|usually|daily)\b/i,
    ]),
  routine_preference: (value) =>
    hasAllPatterns(value, [
      /\b(?:morning|afternoon|evening|night|walk|exercise|visit|call|wake|sleep|routine|schedule)\b/i,
      /\b(?:prefer|like|would rather)\b/i,
    ]),
  aac_preference: (value) =>
    hasAllPatterns(value, [
      /\b(?:aac|active ageing|one[- ]to[- ]one|group activit(?:y|ies))\b/i,
      /\b(?:prefer|like|comfortable|would rather)\b/i,
    ]),
  family_routing: (value) =>
    hasAllPatterns(value, [
      /\b(?:daughter|son|wife|husband|sister|brother|caregiver|niece|nephew)\b/i,
      /\b(?:call|contact|tell|notify|message|handles?|manages?|arranges?|first)\b/i,
    ]),
  health_observation: (value) =>
    hasAllPatterns(value, [
      /\b(?:pain|ache|soreness|stiffness|swelling|mobility|hearing|vision|walking|breathing|appetite|sleep)\b/i,
      /\b(?:persistent|ongoing|chronic|long[- ]term|recurring|for (?:many )?(?:years|months))\b/i,
    ]),
  accessibility_need: (value) =>
    /\b(?:large(?:r)? text|small (?:text|words)|hearing aid|hard of hearing|wheelchair|screen reader|captions?|difficulty (?:hearing|seeing|reading|walking)|trouble (?:hearing|seeing|reading|walking)|cannot (?:hear|see|read|walk)|can't (?:hear|see|read|walk))\b/i.test(
      value
    ),
  routine_baseline: (value) =>
    hasAllPatterns(value, [
      /\b(?:always|usually|every (?:day|morning|afternoon|evening|night|week)|daily|weekly)\b/i,
      /\b(?:eat|have|wake|sleep|walk|call|visit|exercise|take)\b/i,
    ]),
};

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

function isDirectDiagnosticClaim(candidate: MemoryCandidate): boolean {
  if (candidate.contextType !== "health_observation") return false;
  const match = candidate.evidenceExcerpt
    .trim()
    .match(/(?:^|[.!?]\s*)i\s+(?:have|live with|suffer from)\s+([^.!?\n]+)[.!?]?$/i);
  if (!match) return false;
  const claim = match[1].trim();
  return !hasPattern(claim, nonDiagnosticDirectObservationPatterns);
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
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^[_:-]+|[_:-]+$/g, "");
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
    candidate.evidenceExcerpt.trim().length < MIN_EVIDENCE_LENGTH ||
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
    hasPattern(proposedText, selfDiagnosticClaimPatterns) ||
    isDirectDiagnosticClaim(candidate)
  ) {
    return { accepted: false, reason: "diagnostic_inference" };
  }
  if (hasPattern(proposedText, treatmentInstructionPatterns)) {
    return { accepted: false, reason: "treatment_instruction" };
  }
  if (!hasValidBounds(candidate) || !isSupportedCandidate(candidate)) {
    return { accepted: false, reason: "invalid_candidate" };
  }
  if (!contextEvidenceMatchers[candidate.contextType](candidate.evidenceExcerpt)) {
    return { accepted: false, reason: "unsupported_evidence" };
  }

  return {
    accepted: true,
    candidate: {
      ...candidate,
      contextKey: normaliseContextKey(candidate.contextKey),
      content: candidate.evidenceExcerpt.trim(),
    },
    expiresInDays: retentionDays[candidate.retentionClass],
  };
}
