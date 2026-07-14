export type ContactKind =
  | "family_guardian"
  | "aac_staff"
  | "healthcare_contact";

export type ContactChannel = "whatsapp" | "sms" | "voice" | "email";
export type ContactVerificationStatus = "pending" | "verified" | "rejected";
export type ConsentEventType = "granted" | "revoked";
export type NotificationCategory =
  | "wellbeing_follow_up"
  | "health_safety"
  | "digital_safety"
  | "urgent_safety";
export type NotificationDestination =
  | "family_guardian"
  | "aac_supervisor"
  | "healthcare_follow_up"
  | "emergency_guidance";

export type RecipientReasonCode =
  | "inactive_contact"
  | "inactive_method"
  | "destination_mismatch"
  | "channel_mismatch"
  | "unverified_method"
  | "consent_missing"
  | "consent_revoked"
  | "consent_expired"
  | "category_not_permitted"
  | "quiet_hours";

export interface RecipientConsentEvent {
  id: string;
  eventType: ConsentEventType;
  categories: NotificationCategory[];
  allowUrgentQuietHours: boolean;
  confirmedAt: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface RecipientCandidate {
  contactId: string;
  methodId: string;
  contactKind: ContactKind;
  contactPriority: number;
  contactActive: boolean;
  methodPriority: number;
  methodActive: boolean;
  channel: ContactChannel;
  verificationStatus: ContactVerificationStatus;
  verifiedAt: string | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  consentEvents: RecipientConsentEvent[];
}

export interface RecipientSelectionInput {
  seniorId: string;
  category: NotificationCategory;
  destination: NotificationDestination;
  evaluationTime: string;
  requestedChannel: ContactChannel | null;
}

export interface EvaluatedRecipientCandidate extends RecipientCandidate {
  reasonCodes: RecipientReasonCode[];
}

export interface RecipientSelectionResult {
  result: "candidate_selected" | "no_eligible_contact";
  selectedContactId: string | null;
  selectedMethodId: string | null;
  explanation: string;
  candidates: EvaluatedRecipientCandidate[];
  skippedReasons: Array<{
    contactId: string;
    methodId: string;
    reasonCodes: RecipientReasonCode[];
  }>;
}
