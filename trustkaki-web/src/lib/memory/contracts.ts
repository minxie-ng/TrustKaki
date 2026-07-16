import type { Message } from "@/lib/types";

export const memoryTargetStores = [
  "memory",
  "health_context",
  "routine_baseline",
] as const;

export const memoryContextTypes = [
  "communication_preference",
  "food_preference",
  "routine_preference",
  "aac_preference",
  "family_routing",
  "health_observation",
  "accessibility_need",
  "routine_baseline",
] as const;

export const memoryApplicationTags = [
  "concise_text",
  "gentle_one_to_one",
  "voice_preferred",
  "practical_meal_prompt",
  "accessibility_support",
  "trusted_contact_route",
] as const;

export const memoryRetentionClasses = [
  "health_accessibility",
  "routine_baseline",
  "preference",
  "family_routing",
] as const;

export type MemoryTargetStore = (typeof memoryTargetStores)[number];
export type MemoryContextType = (typeof memoryContextTypes)[number];
export type MemoryApplicationTag = (typeof memoryApplicationTags)[number];
export type MemoryRetentionClass = (typeof memoryRetentionClasses)[number];
export type MemoryCandidateIntent = "confirm" | "replace";

export type MemorySourceMessage = Pick<Message, "id" | "sender" | "text">;

export interface MemoryCandidate {
  targetStore: MemoryTargetStore;
  contextKey: string;
  contextType: MemoryContextType;
  content: string;
  sourceMessageId: string;
  evidenceExcerpt: string;
  confidence: number;
  applicationTags: MemoryApplicationTag[];
  retentionClass: MemoryRetentionClass;
  intent?: MemoryCandidateIntent;
}

export type MemoryRejectionCategory =
  | "low_confidence"
  | "unsupported_evidence"
  | "sensitive_data"
  | "diagnostic_inference"
  | "treatment_instruction"
  | "invalid_candidate";

export type MemoryEligibilityResult =
  | {
      accepted: true;
      candidate: MemoryCandidate;
      expiresInDays: number;
    }
  | {
      accepted: false;
      reason: MemoryRejectionCategory;
    };
