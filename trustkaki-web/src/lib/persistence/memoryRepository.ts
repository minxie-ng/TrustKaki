import "server-only";

import { z } from "zod";
import {
  memoryApplicationTags,
  type MemoryApplicationTag,
} from "@/lib/memory/contracts";
import { createTrustKakiServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import type { TrustKakiClient } from "./persistenceSupport";

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
    client
      .from("senior_memories")
      .select("application_tags")
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
  return memoryApplicationTags.filter((tag) => activeTags.has(tag));
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
