import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentRunContext,
  KnownContextItem,
  KnownContextItemType,
} from "@/lib/agents/contracts";
import { agentRunContextSchema } from "@/lib/agents/schemas";
import {
  canAccessSenior,
  type AuthenticatedCaregiver,
} from "@/lib/auth/session";
import { normalizePhoneNumber } from "@/lib/phone";
import { createTrustKakiServiceClient } from "@/lib/supabase/server";
import type { Database, SeniorMessagingPlatform } from "@/lib/supabase/types";
import { findSeniorIdByMessagingIdentity } from "./seniorMessagingIdentityRepository";

type ServiceClient = SupabaseClient<Database>;
type SeniorRow = Database["public"]["Tables"]["seniors"]["Row"];
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
type RoutineRow = Database["public"]["Tables"]["routine_baselines"]["Row"];
type HealthContextRow =
  Database["public"]["Tables"]["senior_health_contexts"]["Row"];
type MemoryRow = Database["public"]["Tables"]["senior_memories"]["Row"];

const CONTEXT_ERROR = "Senior context unavailable";
const KNOWN_CONTEXT_LIMIT = 12;
const KNOWN_CONTEXT_VALUE_LIMIT = 280;
const NON_DIAGNOSTIC_NOTE = "This is not a diagnosis.";

interface RankedKnownContextItem extends KnownContextItem {
  rank: number;
  confidence: number;
  confirmedAt: string;
}

function boundedMessageLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 50;
  return Math.min(50, Math.max(1, Math.trunc(value)));
}

function throwIfQueryFailed(error: unknown): void {
  if (error) throw new Error(CONTEXT_ERROR);
}

function requireClient(): ServiceClient {
  const client = createTrustKakiServiceClient();
  if (!client) throw new Error(CONTEXT_ERROR);
  return client;
}

function boundedText(value: string): string {
  return value.trim().slice(0, KNOWN_CONTEXT_VALUE_LIMIT);
}

function boundedNotes(value: string | null): string | null {
  if (!value?.trim()) return null;
  return boundedText(value);
}

function rankedItem(args: {
  type: KnownContextItemType;
  content: string;
  safeUseNotes: string | null;
  applicationTags: KnownContextItem["applicationTags"];
  rank: number;
  confidence: number;
  confirmedAt: string;
}): RankedKnownContextItem | null {
  const content = boundedText(args.content);
  if (!content) return null;
  return {
    type: args.type,
    content,
    safeUseNotes: boundedNotes(args.safeUseNotes),
    applicationTags: args.applicationTags.slice(0, 3),
    rank: args.rank,
    confidence: args.confidence,
    confirmedAt: args.confirmedAt,
  };
}

function buildKnownContext(
  routines: RoutineRow[],
  healthContexts: HealthContextRow[],
  memories: MemoryRow[]
): NonNullable<AgentRunContext["knownContext"]> {
  const ranked = [
    ...memories.map((row) =>
      rankedItem({
        type: "preference",
        content: row.content,
        safeUseNotes: row.safe_use_notes,
        applicationTags: row.application_tags,
        rank: row.importance,
        confidence: row.confidence,
        confirmedAt: row.last_confirmed_at,
      })
    ),
    ...routines.map((row) =>
      rankedItem({
        type: "usual_routine",
        content: `${row.label}: ${row.usual_pattern}`,
        safeUseNotes: row.safe_use_notes,
        applicationTags: row.application_tags,
        rank: row.confidence * 5,
        confidence: row.confidence,
        confirmedAt: row.last_confirmed_at,
      })
    ),
    ...healthContexts.map((row) =>
      rankedItem({
        type: "observed_operational_context",
        content: row.description,
        safeUseNotes: `${NON_DIAGNOSTIC_NOTE} ${row.safe_use_notes}`,
        applicationTags: row.application_tags,
        rank: row.confidence * 5,
        confidence: row.confidence,
        confirmedAt: row.last_confirmed_at,
      })
    ),
  ].filter((item): item is RankedKnownContextItem => item !== null);

  ranked.sort(
    (a, b) =>
      b.rank - a.rank ||
      b.confidence - a.confidence ||
      b.confirmedAt.localeCompare(a.confirmedAt) ||
      a.type.localeCompare(b.type) ||
      a.content.localeCompare(b.content)
  );

  return {
    items: ranked.slice(0, KNOWN_CONTEXT_LIMIT).map((item) => ({
      type: item.type,
      content: item.content,
      safeUseNotes: item.safeUseNotes,
      applicationTags: item.applicationTags,
    })),
  };
}

async function loadContext(
  client: ServiceClient,
  senior: SeniorRow,
  messageLimit: number
): Promise<AgentRunContext> {
  const now = new Date().toISOString();
  const checkInResult = await client
    .from("check_ins")
    .select("id")
    .eq("senior_id", senior.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfQueryFailed(checkInResult.error);
  const checkIn = checkInResult.data as { id: string } | null;

  const [
    caregiverResult,
    messageResult,
    routineResult,
    healthContextResult,
    memoryResult,
  ] = await Promise.all([
    client
      .from("senior_caregivers")
      .select("role, caregivers(display_name)")
      .eq("senior_id", senior.id),
    checkIn
      ? client
          .from("messages")
          .select("id, sender, text, created_at, agent_id")
          .eq("senior_id", senior.id)
          .eq("check_in_id", checkIn.id)
          .order("created_at", { ascending: false })
          .limit(messageLimit)
      : Promise.resolve({ data: [] as MessageRow[], error: null }),
    client
      .from("routine_baselines")
      .select(
        "baseline_type, label, usual_pattern, confidence, safe_use_notes, application_tags, last_confirmed_at"
      )
      .eq("senior_id", senior.id)
      .eq("status", "active")
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("confidence", { ascending: false })
      .order("last_confirmed_at", { ascending: false })
      .limit(KNOWN_CONTEXT_LIMIT),
    client
      .from("senior_health_contexts")
      .select(
        "context_type, description, confidence, safe_use_notes, application_tags, last_confirmed_at"
      )
      .eq("senior_id", senior.id)
      .eq("status", "active")
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("confidence", { ascending: false })
      .order("last_confirmed_at", { ascending: false })
      .limit(KNOWN_CONTEXT_LIMIT),
    client
      .from("senior_memories")
      .select(
        "memory_type, content, importance, confidence, safe_use_notes, application_tags, last_confirmed_at"
      )
      .eq("senior_id", senior.id)
      .eq("status", "active")
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("importance", { ascending: false })
      .order("confidence", { ascending: false })
      .order("last_confirmed_at", { ascending: false })
      .limit(KNOWN_CONTEXT_LIMIT),
  ]);
  throwIfQueryFailed(caregiverResult.error);
  throwIfQueryFailed(messageResult.error);
  throwIfQueryFailed(routineResult.error);
  throwIfQueryFailed(healthContextResult.error);
  throwIfQueryFailed(memoryResult.error);

  const caregiverRows = (caregiverResult.data ?? []) as Array<{
    role: "caregiver" | "aac_volunteer";
    caregivers?: { display_name?: string | null } | null;
  }>;
  const displayNameFor = (role: "caregiver" | "aac_volunteer") =>
    caregiverRows.find((row) => row.role === role)?.caregivers?.display_name ??
    "Not assigned";

  const context = {
    senior: {
      name: senior.display_name,
      age: senior.age ?? 0,
      livingSituation: senior.living_situation ?? "Not recorded",
      caregiver: displayNameFor("caregiver"),
      aacVolunteer: displayNameFor("aac_volunteer"),
    },
    messages: [...(messageResult.data ?? [])].reverse().map((message) => ({
      id: message.id,
      sender: message.sender,
      text: message.text,
      timestamp: message.created_at,
      agentId: message.agent_id ?? undefined,
    })),
    currentRiskLevel: senior.risk_level,
    knownContext: buildKnownContext(
      (routineResult.data ?? []) as RoutineRow[],
      (healthContextResult.data ?? []) as HealthContextRow[],
      (memoryResult.data ?? []) as MemoryRow[]
    ),
  };

  const parsed = agentRunContextSchema.safeParse(context);
  if (!parsed.success) throw new Error(CONTEXT_ERROR);
  return parsed.data;
}

async function loadSeniorById(
  client: ServiceClient,
  seniorId: string
): Promise<SeniorRow> {
  const { data, error } = await client
    .from("seniors")
    .select("id, display_name, age, living_situation, risk_level")
    .eq("id", seniorId)
    .maybeSingle();
  throwIfQueryFailed(error);
  if (!data) throw new Error(CONTEXT_ERROR);
  return data as SeniorRow;
}

export async function loadAuthorizedAgentContext(args: {
  auth: AuthenticatedCaregiver;
  seniorId: string;
  messageLimit?: number;
}): Promise<AgentRunContext> {
  if (!canAccessSenior(args.auth, args.seniorId)) {
    throw new Error("Forbidden");
  }

  const client = requireClient();
  const senior = await loadSeniorById(client, args.seniorId);
  return loadContext(client, senior, boundedMessageLimit(args.messageLimit));
}

export async function loadSeniorContextByVerifiedPhone(args: {
  phone: string;
  messageLimit?: number;
}): Promise<{ seniorId: string; context: AgentRunContext } | null> {
  const phone = normalizePhoneNumber(args.phone);
  if (!phone) return null;

  const client = requireClient();
  const { data, error } = await client
    .from("seniors")
    .select("id, display_name, age, living_situation, risk_level")
    .eq("phone_e164", phone)
    .maybeSingle();
  throwIfQueryFailed(error);
  if (!data) return null;

  const senior = data as SeniorRow;
  return {
    seniorId: senior.id,
    context: await loadContext(
      client,
      senior,
      boundedMessageLimit(args.messageLimit)
    ),
  };
}

export async function loadSeniorContextByMessagingIdentity(args: {
  platform: SeniorMessagingPlatform;
  externalUserId: string;
  externalChatId?: string | null;
  messageLimit?: number;
}): Promise<{ seniorId: string; context: AgentRunContext } | null> {
  const seniorId = await findSeniorIdByMessagingIdentity({
    platform: args.platform,
    externalUserId: args.externalUserId,
    externalChatId: args.externalChatId,
  });
  if (!seniorId) return null;

  const client = requireClient();
  const senior = await loadSeniorById(client, seniorId);
  return {
    seniorId,
    context: await loadContext(
      client,
      senior,
      boundedMessageLimit(args.messageLimit)
    ),
  };
}
