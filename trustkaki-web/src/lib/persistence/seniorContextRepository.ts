import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentRunContext } from "@/lib/agents/contracts";
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

const CONTEXT_ERROR = "Senior context unavailable";

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

async function loadContext(
  client: ServiceClient,
  senior: SeniorRow,
  messageLimit: number
): Promise<AgentRunContext> {
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

  const [caregiverResult, messageResult] = await Promise.all([
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
  ]);
  throwIfQueryFailed(caregiverResult.error);
  throwIfQueryFailed(messageResult.error);

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
