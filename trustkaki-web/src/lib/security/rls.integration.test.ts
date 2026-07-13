import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Json } from "@/lib/supabase/types";
import {
  createSupabaseRlsFixture,
  type SupabaseRlsFixture,
} from "./supabaseTestFixture";

const describeDatabase =
  process.env.TRUSTKAKI_RUN_DB_INTEGRATION === "1"
    ? describe.sequential
    : describe.skip;

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
    const { error } = await fixture.caregiverA.client.rpc(
      "record_caregiver_queue_action",
      {
        p_queue_item_id: fixture.privateQueueId,
        p_action_type: "mark_for_follow_up",
      }
    );
    const { count } = await fixture.serviceClient
      .from("caregiver_actions")
      .select("id", { count: "exact", head: true })
      .eq("queue_item_id", fixture.privateQueueId);

    expect(error).not.toBeNull();
    expect(count).toBe(0);
  });

  it("derives the actor from auth and shares the action with linked caregivers", async () => {
    const { data, error } = await fixture.caregiverA.client.rpc(
      "record_caregiver_queue_action",
      {
        p_queue_item_id: fixture.sharedQueueId,
        p_action_type: "mark_for_follow_up",
      }
    );
    const result = data as unknown as Record<string, Json>;
    const { data: sharedActions, error: readError } = await fixture.caregiverB.client
      .from("caregiver_actions")
      .select("caregiver_id, previous_status, resulting_status")
      .eq("queue_item_id", fixture.sharedQueueId);

    expect(error).toBeNull();
    expect(result.actor_caregiver_id).toBe(fixture.caregiverA.caregiverId);
    expect(sharedActions).toEqual([
      expect.objectContaining({
        caregiver_id: fixture.caregiverA.caregiverId,
        previous_status: "pending",
        resulting_status: "acknowledged",
      }),
    ]);
    expect(readError).toBeNull();
  });

  it("rolls back an invalid command and resolves the queue with all linked patterns", async () => {
    const { data: queueBefore } = await fixture.serviceClient
      .from("caregiver_queue_items")
      .select("status")
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
        p_outcome_type: "resolved",
        p_note: "short",
      }
    );
    const { data: queueAfterInvalid } = await fixture.serviceClient
      .from("caregiver_queue_items")
      .select("status")
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
        previous_status: "acknowledged",
        resulting_status: "resolved",
      }),
    ]);
  });
});
