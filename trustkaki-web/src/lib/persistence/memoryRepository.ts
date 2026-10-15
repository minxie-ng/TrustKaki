import "server-only";

import { z } from "zod";
import {
  memoryApplicationTags,
  type MemoryApplicationTag,
} from "@/lib/memory/contracts";
import type {
  SeniorContextActionCommand,
  SeniorContextReadItem,
  SeniorContextReadModel,
} from "@/lib/api/schemas";
import {
  createTrustKakiServiceClient,
  createTrustKakiUserClient,
} from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import type { Database } from "@/lib/supabase/types";
import type { TrustKakiClient } from "./persistenceSupport";

import { canAdministerSenior, type AuthenticatedCaregiver } from "@/lib/auth/session";
import { applyNeonAutomaticMemory, mutateNeonPersonalMemory, readNeonPersonalMemory, readNeonMemoryTags,
  resolveMemoryScope, isNeonPersonalMemoryEnabled, withOperationalMemoryPurpose } from "@/lib/memory/applicationRepository";

const OPERATIONAL_MEMORY_TAGS = ["trusted_contact_route", "accessibility_support"];
function legacyMemoryQuery(client: TrustKakiClient, columns: string) {
  const query = client.from("senior_memories").select(columns);
  return isNeonPersonalMemoryEnabled() ? query.overlaps("application_tags", OPERATIONAL_MEMORY_TAGS) : query;
}

const automaticContextResultSchema = z.discriminatedUnion("accepted", [
  z.object({
    accepted: z.literal(true),
    store: z.enum(["memory", "health_context", "routine_baseline"]),
    context_id: z.string().uuid(),
    event: z.enum(["proposal_accepted", "confirmed"]),
    duplicate: z.boolean(),
  }),
  z.object({
    accepted: z.literal(false),
    event: z.literal("proposal_rejected"),
    duplicate: z.boolean(),
  }),
]);

const applicationTagRowsSchema = z.array(
  z.object({ application_tags: z.array(z.enum(memoryApplicationTags)) })
);
const contextCommandResultSchema = z.object({
  store: z.enum(["memory", "health_context", "routine_baseline"]),
  context_id: z.string().uuid(),
  updated_at: z.string().min(1),
  duplicate: z.boolean(),
});
const routineScheduleSchema = z.record(z.string(), z.json());

type MemoryReadRow = Pick<
  Database["public"]["Tables"]["senior_memories"]["Row"],
  | "id"
  | "context_key"
  | "memory_type"
  | "content"
  | "importance"
  | "safe_use_notes"
  | "application_tags"
  | "extraction_method"
  | "last_confirmed_at"
  | "expires_at"
  | "updated_at"
>;
type HealthReadRow = Pick<
  Database["public"]["Tables"]["senior_health_contexts"]["Row"],
  | "id"
  | "context_key"
  | "context_type"
  | "description"
  | "safe_use_notes"
  | "application_tags"
  | "extraction_method"
  | "last_confirmed_at"
  | "expires_at"
  | "updated_at"
>;
type RoutineReadRow = Pick<
  Database["public"]["Tables"]["routine_baselines"]["Row"],
  | "id"
  | "context_key"
  | "baseline_type"
  | "label"
  | "usual_pattern"
  | "schedule_json"
  | "safe_use_notes"
  | "application_tags"
  | "extraction_method"
  | "last_confirmed_at"
  | "expires_at"
  | "updated_at"
>;

export interface AutomaticContextRpcCommand {
  commandId: string;
  seniorId: string;
  sourceMessageId: string;
  payload: Json;
}

export type AutomaticContextRpcResult = z.infer<
  typeof automaticContextResultSchema
>;

export class AutomaticContextRpcError extends Error {
  constructor(readonly code: string | null) {
    super("automatic context RPC failed");
    this.name = "AutomaticContextRpcError";
  }
}

export class ContextConflictError extends Error {
  constructor() {
    super("Senior context changed");
    this.name = "ContextConflictError";
  }
}

function payloadObject(payload: Json): Record<string, Json | undefined> | null {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload
    : null;
}

export async function loadActiveContextApplicationTags(args: {
  seniorId: string;
  now: string;
}): Promise<MemoryApplicationTag[]> {
  const client = createTrustKakiServiceClient();
  if (!client) return [];
  const expiryFilter = `expires_at.is.null,expires_at.gt.${args.now}`;
  const [memoryResult, routineResult, healthResult] = await Promise.all([
    legacyMemoryQuery(client, "application_tags")
      .eq("senior_id", args.seniorId)
      .eq("status", "active")
      .or(expiryFilter),
    client
      .from("routine_baselines")
      .select("application_tags")
      .eq("senior_id", args.seniorId)
      .eq("status", "active")
      .or(expiryFilter),
    client
      .from("senior_health_contexts")
      .select("application_tags")
      .eq("senior_id", args.seniorId)
      .eq("status", "active")
      .or(expiryFilter),
  ]);
  const results = [memoryResult, routineResult, healthResult];
  if (results.some((result) => result.error)) {
    throw new Error("Senior context tags unavailable");
  }

  const parsed = results.map((result) =>
    applicationTagRowsSchema.safeParse(result.data ?? [])
  );
  if (parsed.some((result) => !result.success)) {
    throw new Error("Senior context tags unavailable");
  }
  const activeTags = new Set(
    parsed.flatMap((result) =>
      result.success
        ? result.data.flatMap((row) => row.application_tags)
        : []
    )
  );
  if (isNeonPersonalMemoryEnabled()) {
    try {
      const scope = await resolveMemoryScope(client, args.seniorId);
      for (const tag of await readNeonMemoryTags(scope, args.now)) activeTags.add(tag);
    }
    catch { /* Optional personalisation must not block operational contact/safety tags. */ }
  }
  return memoryApplicationTags.filter((tag) => activeTags.has(tag));
}

export async function readSeniorContext(args: {
  accessToken: string;
  seniorId: string;
  now: string;
}): Promise<SeniorContextReadModel> {
  const client = createTrustKakiUserClient(args.accessToken);
  if (!client) throw new Error("Senior context unavailable");
  const expiryFilter = `expires_at.is.null,expires_at.gt.${args.now}`;
  const [memoryResult, healthResult, routineResult] = await Promise.all([
    legacyMemoryQuery(client, "id, context_key, memory_type, content, importance, safe_use_notes, application_tags, extraction_method, last_confirmed_at, expires_at, updated_at")
      .eq("senior_id", args.seniorId)
      .eq("status", "active")
      .or(expiryFilter)
      .order("importance", { ascending: false })
      .order("last_confirmed_at", { ascending: false }),
    client
      .from("senior_health_contexts")
      .select(
        "id, context_key, context_type, description, safe_use_notes, application_tags, extraction_method, last_confirmed_at, expires_at, updated_at"
      )
      .eq("senior_id", args.seniorId)
      .eq("status", "active")
      .or(expiryFilter)
      .order("last_confirmed_at", { ascending: false }),
    client
      .from("routine_baselines")
      .select(
        "id, context_key, baseline_type, label, usual_pattern, schedule_json, safe_use_notes, application_tags, extraction_method, last_confirmed_at, expires_at, updated_at"
      )
      .eq("senior_id", args.seniorId)
      .eq("status", "active")
      .or(expiryFilter)
      .order("last_confirmed_at", { ascending: false }),
  ]);
  if (memoryResult.error || healthResult.error || routineResult.error) {
    throw new Error("Senior context unavailable");
  }

  const items: SeniorContextReadItem[] = [
    ...((memoryResult.data ?? []) as unknown as MemoryReadRow[]).map((row) => ({
      id: row.id,
      store: "memory" as const,
      contextKey: row.context_key,
      memoryType: row.memory_type,
      content: row.content,
      importance: row.importance,
      safeUseNotes: row.safe_use_notes,
      applicationTags: row.application_tags,
      source: row.extraction_method,
      lastConfirmedAt: row.last_confirmed_at,
      expiresAt: row.expires_at,
      updatedAt: row.updated_at,
    })),
    ...((healthResult.data ?? []) as unknown as HealthReadRow[]).map((row) => ({
      id: row.id,
      store: "health_context" as const,
      contextKey: row.context_key,
      contextType: row.context_type,
      description: row.description,
      safeUseNotes: row.safe_use_notes,
      applicationTags: row.application_tags,
      source: row.extraction_method,
      lastConfirmedAt: row.last_confirmed_at,
      expiresAt: row.expires_at,
      updatedAt: row.updated_at,
    })),
    ...((routineResult.data ?? []) as unknown as RoutineReadRow[]).map((row) => ({
      id: row.id,
      store: "routine_baseline" as const,
      contextKey: row.context_key,
      baselineType: row.baseline_type,
      label: row.label,
      usualPattern: row.usual_pattern,
      scheduleJson: routineScheduleSchema.parse(row.schedule_json),
      safeUseNotes: row.safe_use_notes,
      applicationTags: row.application_tags,
      source: row.extraction_method,
      lastConfirmedAt: row.last_confirmed_at,
      expiresAt: row.expires_at,
      updatedAt: row.updated_at,
    })),
  ];
  if (isNeonPersonalMemoryEnabled()) {
    const scope = await resolveMemoryScope(client, args.seniorId);
    items.push(...await readNeonPersonalMemory(scope, args.now));
  }
  items.sort(
    (left, right) =>
      right.lastConfirmedAt.localeCompare(left.lastConfirmedAt) ||
      left.store.localeCompare(right.store) ||
      left.id.localeCompare(right.id)
  );
  return { seniorId: args.seniorId, items };
}

function replacementJson(
  command: Extract<SeniorContextActionCommand, { action: "correct" }>
): Json {
  if (command.store === "memory") {
    return {
      context_key: command.replacement.contextKey,
      memory_type: command.replacement.memoryType,
      content: command.replacement.content,
      importance: command.replacement.importance,
      safe_use_notes: command.replacement.safeUseNotes,
      application_tags: command.replacement.applicationTags,
      expires_at: command.replacement.expiresAt,
    };
  }
  if (command.store === "health_context") {
    return {
      context_key: command.replacement.contextKey,
      context_type: command.replacement.contextType,
      description: command.replacement.description,
      safe_use_notes: command.replacement.safeUseNotes,
      application_tags: command.replacement.applicationTags,
      expires_at: command.replacement.expiresAt,
    };
  }
  return {
    context_key: command.replacement.contextKey,
    baseline_type: command.replacement.baselineType,
    label: command.replacement.label,
    usual_pattern: command.replacement.usualPattern,
    schedule_json: command.replacement.scheduleJson,
    safe_use_notes: command.replacement.safeUseNotes,
    application_tags: command.replacement.applicationTags,
    expires_at: command.replacement.expiresAt,
  };
}

export async function mutateSeniorContext(args: {
  accessToken: string;
  seniorId: string;
  command: SeniorContextActionCommand;
  auth?: AuthenticatedCaregiver;
}) {
  const client = createTrustKakiUserClient(args.accessToken);
  if (!client) throw new Error("Senior context unavailable");
  if (isNeonPersonalMemoryEnabled() && args.command.store === "memory") {
    if (!args.auth || !canAdministerSenior(args.auth, args.seniorId)) throw new Error("Forbidden");
    const { data: operational, error } = await legacyMemoryQuery(client, "id,context_key")
      .eq("senior_id", args.seniorId).eq("id", args.command.contextId).maybeSingle();
    if (error) throw new Error("Senior context unavailable");
    if (!operational) {
      try { return await mutateNeonPersonalMemory(client, args.seniorId, args.auth.caregiverId, args.command); }
      catch (error) {
        if (error instanceof Error && (error.message === "Memory conflict" || ("code" in error && error.code === "PT409"))) throw new ContextConflictError();
        throw new Error("Senior context command failed");
      }
    }
    if (args.command.action === "correct" && (args.command.replacement.contextKey !== z.object({ context_key: z.string() }).parse(operational).context_key
      || !args.command.replacement.applicationTags.some(tag => OPERATIONAL_MEMORY_TAGS.includes(tag)))) {
      throw new ContextConflictError();
    }
  }
  const common = {
    p_command_id: args.command.commandId,
    p_senior_id: args.seniorId,
    p_store: args.command.store,
    p_context_id: args.command.contextId,
    p_expected_updated_at: args.command.expectedUpdatedAt,
    p_reason: args.command.reason,
  };
  const rpcClient = client as unknown as {
    rpc: (
      name: string,
      payload: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { code?: string } | null }>;
  };
  const { data, error } =
    args.command.action === "correct"
      ? await rpcClient.rpc("correct_senior_context", {
          ...common,
          p_replacement_json: replacementJson(args.command),
        })
      : await rpcClient.rpc("archive_senior_context", common);
  if (error?.code === "PT409") throw new ContextConflictError();
  if (error) throw new Error("Senior context command failed");
  return contextCommandResultSchema.parse(data);
}

async function replacementExpectedAt(
  client: TrustKakiClient,
  command: AutomaticContextRpcCommand,
  payload: Record<string, Json | undefined>
): Promise<string | null> {
  if (payload.decision !== "accepted" || payload.intent !== "replace") return null;
  const store = String(payload.store ?? "");
  const contextKey = String(payload.context_key ?? "");
  const table = {
    memory: "senior_memories",
    health_context: "senior_health_contexts",
    routine_baseline: "routine_baselines",
  }[store];
  if (!table || !contextKey) throw new AutomaticContextRpcError("22023");

  const { data: event, error: eventError } = await client
    .from("senior_context_events")
    .select("before_snapshot")
    .eq("command_id", command.commandId)
    .eq("senior_id", command.seniorId)
    .eq("store", store)
    .eq("event_type", "superseded")
    .limit(1)
    .maybeSingle();
  if (eventError) throw new AutomaticContextRpcError(eventError.code ?? null);
  if (event) {
    const parsed = z
      .object({ updated_at: z.string().min(1) })
      .safeParse(event.before_snapshot);
    if (!parsed.success) throw new Error("invalid replacement event snapshot");
    return parsed.data.updated_at;
  }

  const { data: active, error: activeError } = await client
    .from(table)
    .select("updated_at")
    .eq("senior_id", command.seniorId)
    .eq("context_key", contextKey)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (activeError) throw new AutomaticContextRpcError(activeError.code ?? null);
  if (!active) throw new AutomaticContextRpcError("PT409");
  return String(active.updated_at);
}

export async function applyAutomaticSeniorContext(
  client: TrustKakiClient,
  command: AutomaticContextRpcCommand
): Promise<AutomaticContextRpcResult> {
  const payload = payloadObject(command.payload);
  if (!payload) throw new Error("invalid automatic context RPC payload");
  if (isNeonPersonalMemoryEnabled() && payload.store === "memory" && payload.decision === "accepted") {
    const tags = z.array(z.enum(memoryApplicationTags)).parse(payload.application_tags);
    if (!tags.some(tag => OPERATIONAL_MEMORY_TAGS.includes(tag))) {
      try { return await applyNeonAutomaticMemory(client, command); }
      catch (error) {
        throw new AutomaticContextRpcError(error instanceof Error && (error.message === "Memory conflict" || ("code" in error && error.code === "PT409")) ? "PT409" : null);
      }
    }
    try { return await withOperationalMemoryPurpose(client, command, () => applyLegacyAutomaticContext(client, command, payload)); }
    catch (error) {
      throw new AutomaticContextRpcError(error instanceof Error && (error.message === "Memory conflict" || ("code" in error && error.code === "PT409")) ? "PT409" : null);
    }
  }
  return applyLegacyAutomaticContext(client, command, payload);
}
async function applyLegacyAutomaticContext(client: TrustKakiClient, command: AutomaticContextRpcCommand, payload: Record<string, Json | undefined>): Promise<AutomaticContextRpcResult> {
  const expectedUpdatedAt = await replacementExpectedAt(client, command, payload);
  const rpcPayload = expectedUpdatedAt
    ? { ...payload, expected_updated_at: expectedUpdatedAt }
    : payload;
  const { data, error } = await client.rpc("apply_automatic_senior_context", {
    p_command_id: command.commandId,
    p_senior_id: command.seniorId,
    p_source_message_id: command.sourceMessageId,
    p_payload_json: rpcPayload,
  });
  if (error) {
    throw new AutomaticContextRpcError(error.code ?? null);
  }

  const parsed = automaticContextResultSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("invalid automatic context RPC result");
  }
  return parsed.data;
}
