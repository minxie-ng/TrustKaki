import type {
  CareActivityItem,
  DashboardData,
  FollowUpQueueItem,
  Message,
  PatternDetail,
} from "@/lib/types";

export const PUBLIC_DEMO_STORAGE_KEY = "trustkaki.public-demo.v1";
export const PUBLIC_DEMO_SCHEMA_VERSION = 1;
export const PUBLIC_DEMO_TTL_MS = 2 * 60 * 60 * 1000;

export type PublicDemoCommand = "prepare" | "refresh" | "recordResponse" | "resolve";

export interface PublicDemoDocument {
  schemaVersion: 1;
  createdAt: string;
  expiresAt: string;
  phase: "orientation" | "prepare" | "review" | "respond" | "resolve" | "complete";
  activeView: "workspace" | "activity";
  data: DashboardData;
}

export interface PublicDemoCommandResult {
  data: DashboardData;
  queueItemId: string | null;
  seniorId: string;
}

const seniorId = "public-demo-senior";
const queueItemId = "public-demo-case";

function initialData(): DashboardData {
  return {
    selectedSeniorId: seniorId,
    seniors: [{
      id: seniorId,
      name: "Mr Tan Ah Hock",
      age: 76,
      gender: "Male",
      livingSituation: "Lives alone in a 3-room HDB flat",
      riskLevel: "green",
      lastCheckIn: null,
      followUpCount: 0,
      primaryCaregiver: "Rachel Tan",
      primaryCaregiverRelationship: "daughter",
      aacVolunteer: "Mei Ling",
    }],
    assignableCaregivers: [],
    senior: {
      name: "Mr Tan Ah Hock",
      age: 76,
      gender: "Male",
      livingSituation: "Lives alone in a 3-room HDB flat",
      caregiver: "Rachel Tan",
      caregiverRelationship: "daughter",
      aacVolunteer: "Mei Ling",
      riskLevel: "green",
      lastCheckIn: null,
    },
    activeSessions: [],
    recentAlerts: [],
    followUpQueue: [],
    activity: [],
  };
}

function message(sender: Message["sender"], text: string, timestamp: string): Message {
  return { id: `public-demo-message-${timestamp}`, sender, text, timestamp };
}

function pattern(now: string): PatternDetail {
  const day = (offset: number) => new Date(new Date(now).getTime() - offset * 86400000).toISOString();
  return {
    id: "public-demo-pattern",
    type: "combined_wellbeing_decline",
    status: "active",
    severity: "medium",
    conciseSummary: "Mobility, appetite, routine, and social withdrawal changed across four days.",
    recommendedAction: "Call today and check whether he needs meal or mobility support.",
    firstObservedAt: day(3),
    latestObservedAt: now,
    evidence: [
      { id: "public-demo-evidence-1", type: "health", severity: "medium", description: "Mr Tan mentioned knee discomfort.", observedAt: day(3), message: "My knee is painful today." },
      { id: "public-demo-evidence-2", type: "daily_living", severity: "medium", description: "He skipped breakfast for the first time this week.", observedAt: day(2), message: "Not hungry this morning." },
      { id: "public-demo-evidence-3", type: "social", severity: "medium", description: "He declined his usual community activity.", observedAt: day(1), message: "Maybe another day, paiseh." },
      { id: "public-demo-evidence-4", type: "health", severity: "medium", description: "Knee discomfort continued into today.", observedAt: now, message: "Still a bit sore, but okay." },
    ],
    triggerExplanation: "The pattern combines several moderate changes instead of treating one message as a crisis.",
    comparison: "Different from Mr Tan's usual breakfast and community routine.",
    previousActions: [],
    usualRoutine: ["Breakfast before 9am", "Weekly community centre visit"],
    knownContext: ["Lives alone", "Rachel checks in after work"],
  };
}

function preparedData(data: DashboardData, now: string): DashboardData {
  const evidence = pattern(now);
  const messages: Message[] = evidence.evidence.map((item) =>
    message("senior", item.message ?? item.description, item.observedAt)
  );
  const item: FollowUpQueueItem = {
    id: queueItemId,
    seniorId,
    seniorName: data.senior.name,
    riskLevel: "yellow",
    headline: "Wellbeing pattern needs a human check-in",
    reason: evidence.conciseSummary,
    changeFromUsual: evidence.comparison,
    lastResponseAt: now,
    recommendedAction: evidence.recommendedAction,
    status: "pending",
    assignedTo: null,
    lastUpdatedAt: now,
    priority: 100,
    relatedPatterns: [],
    pattern: evidence,
  };
  return {
    ...data,
    senior: { ...data.senior, riskLevel: "yellow", lastCheckIn: now },
    seniors: data.seniors?.map((senior) => ({ ...senior, riskLevel: "yellow", lastCheckIn: now, followUpCount: 1 })),
    activeSessions: [{
      id: "public-demo-session",
      startedAt: evidence.firstObservedAt,
      status: "completed",
      messages,
      traces: [],
      riskBefore: "green",
      riskAfter: "yellow",
      summary: "Four days of small changes were consolidated into one case for human follow-up.",
    }],
    recentAlerts: evidence.evidence.map((entry) => ({ id: entry.id, type: entry.type, message: entry.description, timestamp: entry.observedAt, acknowledged: false })),
    followUpQueue: [item],
  };
}

function action(data: DashboardData, actionType: CareActivityItem["actionType"], status: CareActivityItem["resultingStatus"], note: string, now: string): DashboardData {
  const activity: CareActivityItem = {
    id: `public-demo-activity-${actionType}`,
    queueItemId,
    seniorId,
    actionType,
    outcomeType: actionType === "record_outcome" ? "needs_follow_up" : "resolved",
    previousStatus: actionType === "record_outcome" ? "pending" : "acknowledged",
    resultingStatus: status,
    note,
    caregiver: "Rachel Tan",
    createdAt: now,
  };
  return {
    ...data,
    followUpQueue: actionType === "resolve"
      ? []
      : data.followUpQueue.map((item) => ({ ...item, status: "acknowledged", lastUpdatedAt: now })),
    activity: [activity, ...(data.activity ?? []).filter((item) => item.id !== activity.id)],
  };
}

export function createInitialPublicDemo(now = new Date()): PublicDemoDocument {
  const createdAt = now.toISOString();
  return { schemaVersion: 1, createdAt, expiresAt: new Date(now.getTime() + PUBLIC_DEMO_TTL_MS).toISOString(), phase: "orientation", activeView: "workspace", data: initialData() };
}

export function applyPublicDemoCommand(document: PublicDemoDocument, command: PublicDemoCommand, now = new Date()): PublicDemoDocument {
  if (new Date(document.expiresAt).getTime() <= now.getTime()) return createInitialPublicDemo(now);
  const timestamp = now.toISOString();
  let data = document.data;
  if (command === "prepare" && !data.followUpQueue.length) data = preparedData(data, timestamp);
  if (command === "recordResponse" && data.followUpQueue.length && !(data.activity ?? []).some((item) => item.actionType === "record_outcome")) data = action(data, "record_outcome", "acknowledged", "Rachel spoke with Mr Tan and will check again this evening.", timestamp);
  if (command === "resolve" && data.followUpQueue.length && !(data.activity ?? []).some((item) => item.actionType === "resolve")) data = action(data, "resolve", "resolved", "Rachel confirmed Mr Tan is safe and the follow-up is complete.", timestamp);
  return { ...document, data };
}

export function serializePublicDemo(document: PublicDemoDocument): string {
  return JSON.stringify(document);
}

function validDocument(value: unknown): value is PublicDemoDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<PublicDemoDocument>;
  return document.schemaVersion === PUBLIC_DEMO_SCHEMA_VERSION &&
    typeof document.createdAt === "string" && typeof document.expiresAt === "string" &&
    ["orientation", "prepare", "review", "respond", "resolve", "complete"].includes(document.phase ?? "") &&
    (document.activeView === "workspace" || document.activeView === "activity") &&
    Boolean(document.data?.senior && Array.isArray(document.data.followUpQueue) && Array.isArray(document.data.activity));
}

export function restorePublicDemo(raw: string | null, now = new Date()): PublicDemoDocument | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!validDocument(value) || new Date(value.expiresAt).getTime() <= now.getTime()) return null;
    return value;
  } catch { return null; }
}

