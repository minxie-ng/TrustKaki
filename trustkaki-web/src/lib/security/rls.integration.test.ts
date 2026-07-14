import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Json } from "@/lib/supabase/types";
import {
  createSupabaseRlsFixture,
  type SupabaseRlsFixture,
} from "./supabaseTestFixture";

const describeDatabase =
  process.env.TRUSTKAKI_RUN_DB_INTEGRATION === "1"
    ? describe.sequential
    : describe.skip;

async function bounded<T>(
  promise: PromiseLike<T>,
  label: string,
  timeoutMs = 10_000
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function subscribeWithDiagnostics(
  channel: RealtimeChannel,
  statuses: string[]
): Promise<void> {
  try {
    await bounded(
      new Promise<void>((resolve, reject) => {
        channel.subscribe((status, error) => {
          statuses.push(error ? `${status}:${error.message}` : status);
          if (status === "SUBSCRIBED") resolve();
          if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
            reject(new Error(`Realtime subscription entered ${status}`));
          }
        });
      }),
      "Realtime subscription"
    );
  } catch (error) {
    throw new Error(
      `Realtime subscription failure; statuses=${statuses.join(",") || "none"}`,
      { cause: error }
    );
  }
}

async function pollQueueVersion(args: {
  fixture: SupabaseRlsFixture;
  previousUpdatedAt: string;
  timeoutMs?: number;
}): Promise<string> {
  const deadline = Date.now() + (args.timeoutMs ?? 5_000);
  do {
    const { data, error } = await args.fixture.caregiverB.client
      .from("caregiver_queue_items")
      .select("updated_at")
      .eq("id", args.fixture.sharedQueueId)
      .single();
    if (error) throw new Error("Polling fallback read failed");
    if (data.updated_at !== args.previousUpdatedAt) return data.updated_at;
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (Date.now() < deadline);

  throw new Error("Polling fallback did not observe the committed update");
}

describeDatabase("TrustKaki caregiver RLS integration", () => {
  let fixture: SupabaseRlsFixture;

  beforeAll(async () => {
    fixture = await createSupabaseRlsFixture();
  });

  afterAll(async () => {
    await fixture?.cleanup();
  });

  it("isolates private seniors while exposing a shared senior to both caregivers", async () => {
    const [{ data: aRows, error: aError }, { data: bRows, error: bError }] =
      await Promise.all([
        fixture.caregiverA.client.from("seniors").select("id"),
        fixture.caregiverB.client.from("seniors").select("id"),
      ]);

    expect(aError).toBeNull();
    expect(bError).toBeNull();
    expect(aRows?.map((row) => row.id)).toEqual([fixture.sharedSeniorId]);
    expect(bRows?.map((row) => row.id)).toEqual(
      expect.arrayContaining([fixture.sharedSeniorId, fixture.privateSeniorId])
    );
  });

  it("rejects a private queue mutation without creating a partial action", async () => {
    const { data: privateQueue } = await fixture.serviceClient
      .from("caregiver_queue_items")
      .select("updated_at")
      .eq("id", fixture.privateQueueId)
      .single();
    const { error } = await fixture.caregiverA.client.rpc(
      "record_caregiver_queue_action",
      {
        p_queue_item_id: fixture.privateQueueId,
        p_action_type: "mark_for_follow_up",
        p_command_id: randomUUID(),
        p_expected_updated_at: privateQueue?.updated_at ?? "",
      }
    );
    const { count } = await fixture.serviceClient
      .from("caregiver_actions")
      .select("id", { count: "exact", head: true })
      .eq("queue_item_id", fixture.privateQueueId);

    expect(error).not.toBeNull();
    expect(count).toBe(0);
  });

  it("derives the actor from auth while keeping the assignment target separate", async () => {
    const { data: queueBefore } = await fixture.serviceClient
      .from("caregiver_queue_items")
      .select("updated_at")
      .eq("id", fixture.sharedQueueId)
      .single();
    const commandId = randomUUID();
    const { data, error } = await fixture.caregiverA.client.rpc(
      "record_caregiver_queue_action",
      {
        p_queue_item_id: fixture.sharedQueueId,
        p_action_type: "assign",
        p_command_id: commandId,
        p_expected_updated_at: queueBefore?.updated_at ?? "",
        p_assigned_caregiver_id: fixture.caregiverB.caregiverId,
      }
    );
    const { data: duplicateData, error: duplicateError } =
      await fixture.caregiverA.client.rpc("record_caregiver_queue_action", {
        p_queue_item_id: fixture.sharedQueueId,
        p_action_type: "assign",
        p_command_id: commandId,
        p_expected_updated_at: queueBefore?.updated_at ?? "",
        p_assigned_caregiver_id: fixture.caregiverB.caregiverId,
      });
    const duplicateResult = duplicateData as unknown as Record<string, Json>;
    const result = data as unknown as Record<string, Json>;
    const { data: sharedActions, error: readError } = await fixture.caregiverB.client
      .from("caregiver_actions")
      .select("caregiver_id, previous_status, resulting_status")
      .eq("queue_item_id", fixture.sharedQueueId);
    const { data: assignedQueue } = await fixture.caregiverB.client
      .from("caregiver_queue_items")
      .select("assigned_caregiver_id")
      .eq("id", fixture.sharedQueueId)
      .single();

    expect(error).toBeNull();
    expect(duplicateError).toBeNull();
    expect(duplicateResult.duplicate).toBe(true);
    expect(result.actor_caregiver_id).toBe(fixture.caregiverA.caregiverId);
    expect(result.assigned_caregiver_id).toBe(fixture.caregiverB.caregiverId);
    expect(assignedQueue?.assigned_caregiver_id).toBe(
      fixture.caregiverB.caregiverId
    );
    expect(sharedActions).toEqual([
      expect.objectContaining({
        caregiver_id: fixture.caregiverA.caregiverId,
        previous_status: "pending",
        resulting_status: "acknowledged",
      }),
    ]);
    expect(readError).toBeNull();
  });

  it("keeps valid acknowledged case actions unchanged", async () => {
    const { data: queueBefore } = await fixture.serviceClient
      .from("caregiver_queue_items")
      .select("updated_at")
      .eq("id", fixture.sharedQueueId)
      .single();
    const { data, error } = await fixture.caregiverA.client.rpc(
      "record_caregiver_queue_action",
      {
        p_queue_item_id: fixture.sharedQueueId,
        p_action_type: "mark_for_follow_up",
        p_command_id: randomUUID(),
        p_expected_updated_at: queueBefore?.updated_at ?? "",
      }
    );
    const result = data as unknown as Record<string, Json>;

    expect(error).toBeNull();
    expect(result.previous_status).toBe("acknowledged");
    expect(result.resulting_status).toBe("acknowledged");
  });

  it("notifies another authorized caregiver when the shared case changes", async () => {
    const channel = fixture.caregiverB.client.channel(
      `gate1-shared-case-${randomUUID()}`
    );
    let notifyUpdate: (() => void) | undefined;
    const statuses: string[] = [];
    let eventReceivedAt: number | null = null;
    const receivedUpdate = new Promise<void>((resolve) => {
      notifyUpdate = () => {
        eventReceivedAt = Date.now();
        resolve();
      };
    });
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "caregiver_queue_items",
        filter: `id=eq.${fixture.sharedQueueId}`,
      },
      () => notifyUpdate?.()
    );

    try {
      await subscribeWithDiagnostics(channel, statuses);
      const { data: queue } = await fixture.serviceClient
        .from("caregiver_queue_items")
        .select("updated_at")
        .eq("id", fixture.sharedQueueId)
        .single();
      const result = await fixture.caregiverA.client.rpc(
        "record_caregiver_queue_action",
        {
          p_queue_item_id: fixture.sharedQueueId,
          p_action_type: "record_outcome",
          p_command_id: randomUUID(),
          p_expected_updated_at: queue?.updated_at ?? "",
          p_outcome_type: "needs_follow_up",
          p_note: "Shared caregiver Realtime verification update.",
        }
      );

      expect(result.error).toBeNull();
      try {
        await bounded(receivedUpdate, "Realtime shared case update", 4_000);
      } catch (initialError) {
        await pollQueueVersion({
          fixture,
          previousUpdatedAt: queue?.updated_at ?? "",
        });
        try {
          await bounded(receivedUpdate, "Delayed Realtime shared case update", 6_000);
        } catch (missedError) {
          throw new Error(
            `Realtime missed event after polling observed the update; statuses=${statuses.join(",")}; eventReceivedAt=none`,
            { cause: missedError }
          );
        }
        throw new Error(
          `Realtime delayed event after polling observed the update; statuses=${statuses.join(",")}; eventReceivedAt=${eventReceivedAt}`,
          { cause: initialError }
        );
      }
    } finally {
      await fixture.caregiverB.client.removeChannel(channel);
    }
  }, 20_000);

  it("observes a shared update through the bounded polling fallback", async () => {
    const { data: queue } = await fixture.serviceClient
      .from("caregiver_queue_items")
      .select("updated_at")
      .eq("id", fixture.sharedQueueId)
      .single();
    const result = await fixture.caregiverA.client.rpc(
      "record_caregiver_queue_action",
      {
        p_queue_item_id: fixture.sharedQueueId,
        p_action_type: "record_outcome",
        p_command_id: randomUUID(),
        p_expected_updated_at: queue?.updated_at ?? "",
        p_outcome_type: "needs_follow_up",
        p_note: "Polling fallback verification update for the shared caregiver.",
      }
    );

    expect(result.error).toBeNull();
    await expect(
      pollQueueVersion({
        fixture,
        previousUpdatedAt: queue?.updated_at ?? "",
      })
    ).resolves.not.toBe(queue?.updated_at);
  });

  it("records one visible escalation while keeping the shared case active", async () => {
    const { data: queueBefore } = await fixture.serviceClient
      .from("caregiver_queue_items")
      .select("updated_at")
      .eq("id", fixture.sharedQueueId)
      .single();
    const commandId = randomUUID();
    const payload = {
      p_queue_item_id: fixture.sharedQueueId,
      p_command_id: commandId,
      p_expected_updated_at: queueBefore?.updated_at ?? "",
      p_escalation_destination: "aac_supervisor",
      p_note: "Two unsuccessful calls require an AAC supervisor review today.",
    } as const;

    const first = await fixture.caregiverA.client.rpc(
      "escalate_caregiver_queue_case",
      payload
    );
    const duplicate = await fixture.caregiverA.client.rpc(
      "escalate_caregiver_queue_case",
      payload
    );
    const firstResult = first.data as unknown as Record<string, Json>;
    const duplicateResult = duplicate.data as unknown as Record<string, Json>;
    const { data: queueSeenByB, error: queueReadError } =
      await fixture.caregiverB.client
        .from("caregiver_queue_items")
        .select("status")
        .eq("id", fixture.sharedQueueId)
        .single();
    const { data: actionsSeenByB, error: actionReadError } =
      await fixture.caregiverB.client
        .from("caregiver_actions")
        .select("action_type, escalation_destination, note")
        .eq("command_id", commandId);

    expect(first.error).toBeNull();
    expect(duplicate.error).toBeNull();
    expect(firstResult.resulting_status).toBe("escalated");
    expect(duplicateResult.duplicate).toBe(true);
    expect(queueReadError).toBeNull();
    expect(queueSeenByB?.status).toBe("escalated");
    expect(actionReadError).toBeNull();
    expect(actionsSeenByB).toEqual([
      expect.objectContaining({
        action_type: "escalate",
        escalation_destination: "aac_supervisor",
      }),
    ]);
  });

  it("rejects acknowledgment and preserves escalation when assigning", async () => {
    const { data: escalatedQueue } = await fixture.serviceClient
      .from("caregiver_queue_items")
      .select("status, updated_at")
      .eq("id", fixture.sharedQueueId)
      .single();
    const { count: actionsBefore } = await fixture.serviceClient
      .from("caregiver_actions")
      .select("id", { count: "exact", head: true })
      .eq("queue_item_id", fixture.sharedQueueId);

    const acknowledge = await fixture.caregiverA.client.rpc(
      "record_caregiver_queue_action",
      {
        p_queue_item_id: fixture.sharedQueueId,
        p_action_type: "mark_for_follow_up",
        p_command_id: randomUUID(),
        p_expected_updated_at: escalatedQueue?.updated_at ?? "",
      }
    );
    const { data: queueAfterAcknowledge } = await fixture.serviceClient
      .from("caregiver_queue_items")
      .select("status, updated_at")
      .eq("id", fixture.sharedQueueId)
      .single();
    const { count: actionsAfterAcknowledge } = await fixture.serviceClient
      .from("caregiver_actions")
      .select("id", { count: "exact", head: true })
      .eq("queue_item_id", fixture.sharedQueueId);

    expect(acknowledge.error).not.toBeNull();
    expect(queueAfterAcknowledge).toEqual(escalatedQueue);
    expect(actionsAfterAcknowledge).toBe(actionsBefore);

    const { data: assignmentData, error: assignmentError } =
      await fixture.caregiverA.client.rpc("record_caregiver_queue_action", {
        p_queue_item_id: fixture.sharedQueueId,
        p_action_type: "assign",
        p_command_id: randomUUID(),
        p_expected_updated_at: queueAfterAcknowledge?.updated_at ?? "",
        p_assigned_caregiver_id: fixture.caregiverB.caregiverId,
      });
    const assignment = assignmentData as unknown as Record<string, Json>;
    const { data: queueAfterAssignment } = await fixture.serviceClient
      .from("caregiver_queue_items")
      .select("status, assigned_caregiver_id")
      .eq("id", fixture.sharedQueueId)
      .single();

    expect(assignmentError).toBeNull();
    expect(assignment.previous_status).toBe("escalated");
    expect(assignment.resulting_status).toBe("escalated");
    expect(queueAfterAssignment).toEqual({
      status: "escalated",
      assigned_caregiver_id: fixture.caregiverB.caregiverId,
    });
  });

  it("rolls back an invalid command and resolves the queue with all linked patterns", async () => {
    const { data: queueBefore } = await fixture.serviceClient
      .from("caregiver_queue_items")
      .select("status, updated_at")
      .eq("id", fixture.sharedQueueId)
      .single();
    const { data: patternsBefore } = await fixture.serviceClient
      .from("patterns")
      .select("id, status")
      .in("id", fixture.sharedPatternIds);
    const { count: actionCountBefore } = await fixture.serviceClient
      .from("caregiver_actions")
      .select("id", { count: "exact", head: true })
      .eq("queue_item_id", fixture.sharedQueueId);

    const { error: invalidError } = await fixture.caregiverA.client.rpc(
      "record_caregiver_queue_action",
      {
        p_queue_item_id: fixture.sharedQueueId,
        p_action_type: "resolve",
        p_command_id: randomUUID(),
        p_expected_updated_at: queueBefore?.updated_at ?? "",
        p_outcome_type: "resolved",
        p_note: "short",
      }
    );
    const { data: queueAfterInvalid } = await fixture.serviceClient
      .from("caregiver_queue_items")
      .select("status, updated_at")
      .eq("id", fixture.sharedQueueId)
      .single();
    const { data: patternsAfterInvalid } = await fixture.serviceClient
      .from("patterns")
      .select("id, status")
      .in("id", fixture.sharedPatternIds);
    const { count: actionCountAfterInvalid } = await fixture.serviceClient
      .from("caregiver_actions")
      .select("id", { count: "exact", head: true })
      .eq("queue_item_id", fixture.sharedQueueId);

    expect(invalidError).not.toBeNull();
    expect(queueAfterInvalid).toEqual(queueBefore);
    expect(patternsAfterInvalid).toEqual(patternsBefore);
    expect(actionCountAfterInvalid).toBe(actionCountBefore);

    const { data: resolveData, error: resolveError } =
      await fixture.caregiverA.client.rpc("record_caregiver_queue_action", {
        p_queue_item_id: fixture.sharedQueueId,
        p_action_type: "resolve",
        p_command_id: randomUUID(),
        p_expected_updated_at: queueBefore?.updated_at ?? "",
        p_outcome_type: "resolved",
        p_note: "Caregiver confirmed the follow-up is complete.",
      });
    const resolveResult = resolveData as unknown as Record<string, Json>;
    const { data: resolvedQueue } = await fixture.serviceClient
      .from("caregiver_queue_items")
      .select("status")
      .eq("id", fixture.sharedQueueId)
      .single();
    const { data: resolvedPatterns } = await fixture.serviceClient
      .from("patterns")
      .select("status")
      .in("id", fixture.sharedPatternIds);
    const { data: resolveActions } = await fixture.serviceClient
      .from("caregiver_actions")
      .select("caregiver_id, action_type, previous_status, resulting_status")
      .eq("queue_item_id", fixture.sharedQueueId)
      .eq("action_type", "resolve");

    expect(resolveError).toBeNull();
    expect(resolveResult.actor_caregiver_id).toBe(fixture.caregiverA.caregiverId);
    expect(resolvedQueue?.status).toBe("resolved");
    expect(resolvedPatterns?.map((row) => row.status)).toEqual([
      "resolved",
      "resolved",
    ]);
    expect(resolveActions).toEqual([
      expect.objectContaining({
        caregiver_id: fixture.caregiverA.caregiverId,
        previous_status: "escalated",
        resulting_status: "resolved",
      }),
    ]);
  });

  it("rejects a stale command without writing another action", async () => {
    const { data: queue } = await fixture.serviceClient
      .from("caregiver_queue_items")
      .select("updated_at")
      .eq("id", fixture.privateQueueId)
      .single();
    const staleVersion = queue?.updated_at ?? "";

    const first = await bounded(fixture.caregiverB.client.rpc(
      "record_caregiver_queue_action",
      {
        p_queue_item_id: fixture.privateQueueId,
        p_action_type: "mark_for_follow_up",
        p_command_id: randomUUID(),
        p_expected_updated_at: staleVersion,
      }
    ), "fresh caregiver command");
    const stale = await bounded(fixture.caregiverB.client.rpc(
      "record_caregiver_queue_action",
      {
        p_queue_item_id: fixture.privateQueueId,
        p_action_type: "assign",
        p_command_id: randomUUID(),
        p_expected_updated_at: staleVersion,
        p_assigned_caregiver_id: fixture.caregiverB.caregiverId,
      }
    ), "stale caregiver command");
    const { count } = await fixture.serviceClient
      .from("caregiver_actions")
      .select("id", { count: "exact", head: true })
      .eq("queue_item_id", fixture.privateQueueId);

    expect(first.error).toBeNull();
    expect(stale.error?.code).toBe("PT409");
    expect(count).toBe(1);
  }, 25_000);
});
