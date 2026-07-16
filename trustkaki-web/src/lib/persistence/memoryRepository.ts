import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type { Json } from "@/lib/supabase/types";
import type { TrustKakiClient } from "./persistenceSupport";
import { normaliseContextKey } from "@/lib/memory/policy";

type AutomaticContextIntent = "create" | "confirm" | "replace";

function uuidFromDigest(value: string): string {
  const bytes = Buffer.from(createHash("sha256").update(value).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function automaticContextCommandId(args: {
  seniorId: string;
  sourceMessageId: string;
  contextKey: string;
  intent: AutomaticContextIntent;
}): string {
  return uuidFromDigest(
    [
      "trustkaki:gate5:automatic-context:v1",
      args.seniorId,
      args.sourceMessageId,
      normaliseContextKey(args.contextKey),
      args.intent,
    ].join(":")
  );
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
