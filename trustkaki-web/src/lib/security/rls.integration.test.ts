import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Json } from "@/lib/supabase/types";
import {
  createSupabaseRlsFixture,
  type SupabaseRlsFixture,
} from "./supabaseTestFixture";

const describeDatabase =
  process.env.TRUSTKAKI_RUN_DB_INTEGRATION === "1"
    ? describe.sequential
    : describe.skip;

async function bounded<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), 10_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

  it("notifies another authorized caregiver when the shared case changes", async () => {
    const channel = fixture.caregiverB.client.channel(
      `gate1-shared-case-${randomUUID()}`
    );
    const receivedUpdate = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Realtime shared case update timed out")),
        10_000
      );
      channel.on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "caregiver_queue_items",
          filter: `id=eq.${fixture.sharedQueueId}`,
        },
        () => {
          clearTimeout(timer);
          resolve();
        }
      );
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Realtime subscription timed out")),
          10_000
        );
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            clearTimeout(timer);
            resolve();
          }
        });
      });
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
      await receivedUpdate;
    } finally {
      await fixture.caregiverB.client.removeChannel(channel);
    }
  }, 20_000);

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
