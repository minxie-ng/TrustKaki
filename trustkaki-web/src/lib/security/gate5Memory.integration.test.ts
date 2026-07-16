import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSupabaseServerConfig } from "@/lib/supabase/config";
import type { Json } from "@/lib/supabase/types";

const execFileAsync = promisify(execFile);
const EXPECTED_PROJECT_REF = "mbzolhqtcbdfosifjkmd";
const describeLive =
  process.env.TRUSTKAKI_RUN_LIVE_SUPABASE === "1"
    ? describe.sequential
    : describe.skip;

interface CaregiverFixture {
  userId: string;
  caregiverId: string;
  email: string;
  password: string;
  client: SupabaseClient;
}

function rpcResult(value: unknown): Record<string, Json> {
  return value as Record<string, Json>;
}

function requireSuccess(
  operation: string,
  result: { error: { message: string } | null }
): void {
  if (result.error) throw new Error(`${operation} failed`);
}

describeLive("Gate 5 memory lifecycle and isolation", () => {
  const runId = randomUUID();
  const marker = `trustkaki-gate5-${runId}`;
  const seniorIds = [randomUUID(), randomUUID()];
  const caregiverIds = [randomUUID(), randomUUID(), randomUUID()];
  const checkInId = randomUUID();
  const sourceMessageIds = [randomUUID(), randomUUID(), randomUUID()];
  const sourceTexts = [
    "I prefer porridge for breakfast.",
    "I prefer porridge for breakfast.",
    "I prefer toast for breakfast.",
  ];
  const createdUserIds: string[] = [];
  const commandIds: string[] = [];
  let service: SupabaseClient;
  let caregiverA: CaregiverFixture;
  let caregiverB: CaregiverFixture;
  let unrelated: CaregiverFixture;
  let activeContextId = "";
  let activeUpdatedAt = "";
  let cleanupComplete = false;

  const supabaseRoot = resolve(process.cwd(), "../../..");

  function automaticPayload(args: {
    content: string;
    evidence: string;
    intent: "create" | "confirm" | "replace";
    expectedUpdatedAt?: string;
  }) {
    return {
      store: "memory",
      context_key: "breakfast_preference",
      decision: "accepted",
      intent: args.intent,
      content: args.content,
      memory_type: "food_preference",
      evidence_excerpt: args.evidence,
      confidence: 0.96,
      expires_at: new Date(Date.now() + 180 * 86_400_000).toISOString(),
      application_tags: ["practical_meal_prompt"],
      ...(args.expectedUpdatedAt
        ? { expected_updated_at: args.expectedUpdatedAt }
        : {}),
    };
  }

  async function createCaregiver(index: number): Promise<CaregiverFixture> {
    const config = getSupabaseServerConfig();
    if (!config) throw new Error("Supabase integration configuration is missing");
    const email = `${marker}-caregiver-${index}@example.com`;
    const password = `Tk-${randomUUID()}`;
    const user = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "demo_admin" },
    });
    requireSuccess("Gate 5 auth user creation", user);
    if (!user.data.user) throw new Error("Gate 5 auth user was not returned");
    createdUserIds.push(user.data.user.id);

    requireSuccess(
      "Gate 5 caregiver creation",
      await service.from("caregivers").insert({
        id: caregiverIds[index],
        external_ref: `${marker}-caregiver-${index}`,
        display_name: `Gate 5 Caregiver ${index}`,
        relationship: "test administrator",
        auth_user_id: user.data.user.id,
      })
    );
    const client = createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const session = await client.auth.signInWithPassword({ email, password });
    requireSuccess("Gate 5 caregiver sign-in", session);
    if (!session.data.session) throw new Error("Gate 5 session was not returned");
    return {
      userId: user.data.user.id,
      caregiverId: caregiverIds[index],
      email,
      password,
      client,
    };
  }

  async function cleanup(): Promise<void> {
    if (cleanupComplete) return;
    const projectRefPath = resolve(supabaseRoot, "supabase/.temp/project-ref");
    const linkedRef = (await readFile(projectRefPath, "utf8")).trim();
    if (linkedRef !== EXPECTED_PROJECT_REF) {
      throw new Error("Gate 5 cleanup refused: linked project ref mismatch");
    }

    const seniorList = seniorIds.map((id) => `'${id}'::uuid`).join(", ");
    const sql = `
begin;
alter table public.senior_context_events disable trigger senior_context_events_append_only;
delete from public.senior_context_events where senior_id in (${seniorList});
alter table public.senior_context_events enable trigger senior_context_events_append_only;
delete from trustkaki_private.context_command_bindings where senior_id in (${seniorList});
delete from public.senior_memories where senior_id in (${seniorList});
delete from public.senior_health_contexts where senior_id in (${seniorList});
delete from public.routine_baselines where senior_id in (${seniorList});
delete from public.messages where senior_id in (${seniorList});
delete from public.check_ins where senior_id in (${seniorList});
delete from public.senior_caregivers where senior_id in (${seniorList});
delete from public.caregivers where external_ref like '${marker}%';
delete from public.seniors where external_ref like '${marker}%';
commit;`;
    await execFileAsync(
      "npx",
      [
        "supabase",
        "db",
        "query",
        sql,
        "--linked",
        "--workdir",
        supabaseRoot,
      ],
      { timeout: 30_000, maxBuffer: 1024 * 1024 }
    );
    for (const userId of createdUserIds) {
      const deletion = await service.auth.admin.deleteUser(userId);
      requireSuccess("Gate 5 auth user cleanup", deletion);
    }

    const [seniors, caregivers, contexts, events] = await Promise.all([
      service.from("seniors").select("id").in("id", seniorIds),
      service.from("caregivers").select("id").in("id", caregiverIds),
      service.from("senior_memories").select("id").in("senior_id", seniorIds),
      service.from("senior_context_events").select("id").in("senior_id", seniorIds),
    ]);
    for (const result of [seniors, caregivers, contexts, events]) {
      requireSuccess("Gate 5 cleanup verification", result);
      if (result.data?.length) throw new Error("Gate 5 cleanup left temporary rows");
    }
    cleanupComplete = true;
  }

  beforeAll(async () => {
    const config = getSupabaseServerConfig();
    if (!config) throw new Error("Supabase integration configuration is missing");
    service = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    try {
      caregiverA = await createCaregiver(0);
      caregiverB = await createCaregiver(1);
      unrelated = await createCaregiver(2);
      requireSuccess(
        "Gate 5 senior creation",
        await service.from("seniors").insert([
          {
            id: seniorIds[0],
            external_ref: `${marker}-shared-senior`,
            display_name: "Gate 5 Shared Senior",
            risk_level: "green",
          },
          {
            id: seniorIds[1],
            external_ref: `${marker}-unrelated-senior`,
            display_name: "Gate 5 Unrelated Senior",
            risk_level: "green",
          },
        ])
      );
      requireSuccess(
        "Gate 5 relationship creation",
        await service.from("senior_caregivers").insert([
          { senior_id: seniorIds[0], caregiver_id: caregiverIds[0], role: "caregiver" },
          { senior_id: seniorIds[0], caregiver_id: caregiverIds[1], role: "caregiver" },
          { senior_id: seniorIds[1], caregiver_id: caregiverIds[2], role: "caregiver" },
        ])
      );
      requireSuccess(
        "Gate 5 check-in creation",
        await service.from("check_ins").insert({
          id: checkInId,
          senior_id: seniorIds[0],
          status: "active",
          risk_before: "green",
          risk_after: "green",
        })
      );
      requireSuccess(
        "Gate 5 source message creation",
        await service.from("messages").insert(
          sourceMessageIds.map((id, index) => ({
            id,
            check_in_id: checkInId,
            senior_id: seniorIds[0],
            sender: "senior" as const,
            text: sourceTexts[index],
            client_message_id: `${marker}-message-${index}`,
          }))
        )
      );
    } catch (error) {
      try {
        await cleanup();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Gate 5 setup and cleanup failed");
      }
      throw error;
    }
  }, 60_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  it("inserts automatically and replays one deterministic event set", async () => {
    const commandId = randomUUID();
    commandIds.push(commandId);
    const args = {
      p_command_id: commandId,
      p_senior_id: seniorIds[0],
      p_source_message_id: sourceMessageIds[0],
      p_payload_json: automaticPayload({
        content: "Prefers porridge for breakfast",
        evidence: "prefer porridge for breakfast",
        intent: "create",
      }),
    };
    const first = await service.rpc("apply_automatic_senior_context", args);
    const replay = await service.rpc("apply_automatic_senior_context", args);
    const active = await service
      .from("senior_memories")
      .select("id, updated_at, source_message_id")
      .eq("senior_id", seniorIds[0])
      .eq("context_key", "breakfast_preference")
      .eq("status", "active");
    const events = await service
      .from("senior_context_events")
      .select("id, event_type")
      .eq("command_id", commandId);

    expect(first.error).toBeNull();
    expect(rpcResult(first.data).duplicate).toBe(false);
    expect(replay.error).toBeNull();
    expect(rpcResult(replay.data).duplicate).toBe(true);
    expect(active.data).toHaveLength(1);
    expect(active.data?.[0].source_message_id).toBe(sourceMessageIds[0]);
    expect(events.data).toEqual([expect.objectContaining({ event_type: "proposal_accepted" })]);
    activeContextId = active.data![0].id;
    activeUpdatedAt = active.data![0].updated_at;
  });

  it("rejects changed payload reuse without changing state or events", async () => {
    const commandId = commandIds[0];
    const changed = await service.rpc("apply_automatic_senior_context", {
      p_command_id: commandId,
      p_senior_id: seniorIds[0],
      p_source_message_id: sourceMessageIds[0],
      p_payload_json: automaticPayload({
        content: "Prefers noodles for breakfast",
        evidence: "prefer porridge for breakfast",
        intent: "create",
      }),
    });
    const active = await service
      .from("senior_memories")
      .select("id, content")
      .eq("senior_id", seniorIds[0])
      .eq("status", "active");
    const events = await service
      .from("senior_context_events")
      .select("id")
      .eq("command_id", commandId);

    expect(changed.error?.code).toBe("22023");
    expect(active.data).toEqual([{ id: activeContextId, content: "Prefers porridge for breakfast" }]);
    expect(events.data).toHaveLength(1);
  });

  it("refreshes confirmation without duplicating the active row", async () => {
    const commandId = randomUUID();
    commandIds.push(commandId);
    const confirmation = await service.rpc("apply_automatic_senior_context", {
      p_command_id: commandId,
      p_senior_id: seniorIds[0],
      p_source_message_id: sourceMessageIds[1],
      p_payload_json: automaticPayload({
        content: "Prefers porridge for breakfast",
        evidence: "prefer porridge for breakfast",
        intent: "confirm",
      }),
    });
    const active = await service
      .from("senior_memories")
      .select("id, updated_at, source_message_id")
      .eq("senior_id", seniorIds[0])
      .eq("status", "active");

    expect(confirmation.error).toBeNull();
    expect(rpcResult(confirmation.data).event).toBe("confirmed");
    expect(active.data).toHaveLength(1);
    expect(active.data?.[0].id).toBe(activeContextId);
    expect(active.data?.[0].source_message_id).toBe(sourceMessageIds[1]);
    activeUpdatedAt = active.data![0].updated_at;
  });

  it("supersedes transactionally with one active replacement", async () => {
    const commandId = randomUUID();
    commandIds.push(commandId);
    const replacement = await service.rpc("apply_automatic_senior_context", {
      p_command_id: commandId,
      p_senior_id: seniorIds[0],
      p_source_message_id: sourceMessageIds[2],
      p_payload_json: automaticPayload({
        content: "Prefers toast for breakfast",
        evidence: "prefer toast for breakfast",
        intent: "replace",
        expectedUpdatedAt: activeUpdatedAt,
      }),
    });
    const rows = await service
      .from("senior_memories")
      .select("id, content, status, superseded_by_id, updated_at")
      .eq("senior_id", seniorIds[0])
      .eq("context_key", "breakfast_preference");
    const events = await service
      .from("senior_context_events")
      .select("event_type")
      .eq("command_id", commandId);

    expect(replacement.error).toBeNull();
    expect(rows.data?.filter((row) => row.status === "active")).toHaveLength(1);
    expect(rows.data?.filter((row) => row.status === "superseded")).toHaveLength(1);
    expect(events.data?.map((event) => event.event_type).sort()).toEqual([
      "proposal_accepted",
      "superseded",
    ]);
    const active = rows.data!.find((row) => row.status === "active")!;
    activeContextId = active.id;
    activeUpdatedAt = active.updated_at;
  });

  it("rejects stale correction with PT409 and no partial event or state", async () => {
    const staleVersion = activeUpdatedAt;
    const correctionCommand = randomUUID();
    commandIds.push(correctionCommand);
    const correction = await caregiverA.client.rpc("correct_senior_context", {
      p_command_id: correctionCommand,
      p_senior_id: seniorIds[0],
      p_store: "memory",
      p_context_id: activeContextId,
      p_expected_updated_at: activeUpdatedAt,
      p_replacement_json: {
        context_key: "breakfast_preference",
        memory_type: "food_preference",
        content: "Prefers soft toast for breakfast",
        confidence: 1,
        expires_at: new Date(Date.now() + 180 * 86_400_000).toISOString(),
        application_tags: ["practical_meal_prompt"],
      },
      p_reason: "Senior clarified the preferred breakfast texture.",
    });
    expect(correction.error).toBeNull();
    activeContextId = String(rpcResult(correction.data).context_id);

    const staleCommand = randomUUID();
    const stale = await caregiverB.client.rpc("correct_senior_context", {
      p_command_id: staleCommand,
      p_senior_id: seniorIds[0],
      p_store: "memory",
      p_context_id: activeContextId,
      p_expected_updated_at: staleVersion,
      p_replacement_json: {
        context_key: "breakfast_preference",
        memory_type: "food_preference",
        content: "Stale replacement must not persist",
        confidence: 1,
        expires_at: new Date(Date.now() + 180 * 86_400_000).toISOString(),
        application_tags: ["practical_meal_prompt"],
      },
      p_reason: "This command intentionally uses a stale context version.",
    });
    const [active, staleEvents] = await Promise.all([
      service
        .from("senior_memories")
        .select("id, content")
        .eq("senior_id", seniorIds[0])
        .eq("status", "active"),
      service.from("senior_context_events").select("id").eq("command_id", staleCommand),
    ]);

    expect(stale.error?.code).toBe("PT409");
    expect(active.data).toEqual([
      { id: activeContextId, content: "Prefers soft toast for breakfast" },
    ]);
    expect(staleEvents.data).toEqual([]);
  });

  it("keeps events immutable to authenticated caregivers", async () => {
    const event = await service
      .from("senior_context_events")
      .select("id")
      .eq("senior_id", seniorIds[0])
      .limit(1)
      .single();
    expect(event.error).toBeNull();

    const update = await caregiverA.client
      .from("senior_context_events")
      .update({ reason: "Authenticated mutation must be denied." })
      .eq("id", event.data!.id);
    const deletion = await caregiverA.client
      .from("senior_context_events")
      .delete()
      .eq("id", event.data!.id);

    expect(update.error).not.toBeNull();
    expect(deletion.error).not.toBeNull();
  });

  it("shares reads with authorized caregivers and isolates the unrelated caregiver", async () => {
    const [readA, readB, eventsA, eventsB, unrelatedSenior, unrelatedContext, unrelatedEvents] =
      await Promise.all([
        caregiverA.client.from("senior_memories").select("id").eq("senior_id", seniorIds[0]).eq("status", "active"),
        caregiverB.client.from("senior_memories").select("id").eq("senior_id", seniorIds[0]).eq("status", "active"),
        caregiverA.client.from("senior_context_events").select("id").eq("senior_id", seniorIds[0]),
        caregiverB.client.from("senior_context_events").select("id").eq("senior_id", seniorIds[0]),
        unrelated.client.from("seniors").select("id").eq("id", seniorIds[0]),
        unrelated.client.from("senior_memories").select("id").eq("senior_id", seniorIds[0]),
        unrelated.client.from("senior_context_events").select("id").eq("senior_id", seniorIds[0]),
      ]);
    const denied = await unrelated.client.rpc("correct_senior_context", {
      p_command_id: randomUUID(),
      p_senior_id: seniorIds[0],
      p_store: "memory",
      p_context_id: activeContextId,
      p_expected_updated_at: new Date().toISOString(),
      p_replacement_json: {
        context_key: "breakfast_preference",
        memory_type: "food_preference",
        content: "Unauthorized replacement",
        confidence: 1,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        application_tags: ["practical_meal_prompt"],
      },
      p_reason: "Unrelated caregiver must not change shared context.",
    });

    for (const result of [readA, readB, eventsA, eventsB]) {
      expect(result.error).toBeNull();
      expect(result.data?.length).toBeGreaterThan(0);
    }
    expect(unrelatedSenior.data).toEqual([]);
    expect(unrelatedContext.data).toEqual([]);
    expect(unrelatedEvents.data).toEqual([]);
    expect(denied.error?.code).toBe("42501");
  });
});
