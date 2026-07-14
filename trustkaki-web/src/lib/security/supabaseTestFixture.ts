import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerConfig } from "@/lib/supabase/config";

type TrustKakiClient = SupabaseClient;

interface TestIdentity {
  userId: string;
  caregiverId: string;
  client: TrustKakiClient;
}

export interface SupabaseRlsFixture {
  serviceClient: TrustKakiClient;
  caregiverA: TestIdentity;
  caregiverB: TestIdentity;
  sharedSeniorId: string;
  privateSeniorId: string;
  sharedQueueId: string;
  privateQueueId: string;
  sharedPatternIds: string[];
  cleanup: () => Promise<void>;
}

function requireNoError(
  operation: string,
  error: { message: string; code?: string; status?: number } | null
): void {
  if (error) {
    const classification = error.code ?? error.status ?? "unclassified";
    throw new Error(
      `Supabase test fixture ${operation} failed (${classification})`
    );
  }
}

function createAuthenticatedClient(
  url: string,
  anonKey: string,
  accessToken: string
): TrustKakiClient {
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  void client.realtime.setAuth(accessToken);
  return client;
}

export async function createSupabaseRlsFixture(): Promise<SupabaseRlsFixture> {
  const config = getSupabaseServerConfig();
  if (!config) throw new Error("Supabase integration configuration is missing");

  const serviceClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const createdUserIds: string[] = [];
  const caregiverIds = [randomUUID(), randomUUID()];
  const seniorIds = [randomUUID(), randomUUID()];
  const sharedPatternIds = [randomUUID(), randomUUID()];
  const privatePatternId = randomUUID();
  const sharedQueueId = randomUUID();
  const privateQueueId = randomUUID();
  const runId = randomUUID();

  const cleanup = async () => {
    const failedOperations: string[] = [];
    if (seniorIds.length > 0) {
      const { error } = await serviceClient
        .from("seniors")
        .delete()
        .in("id", seniorIds);
      if (error) failedOperations.push("senior cleanup");
    }
    if (caregiverIds.length > 0) {
      const { error } = await serviceClient
        .from("caregivers")
        .delete()
        .in("id", caregiverIds);
      if (error) failedOperations.push("caregiver cleanup");
    }
    for (const userId of createdUserIds) {
      const { error } = await serviceClient.auth.admin.deleteUser(userId);
      if (error) failedOperations.push("Auth user cleanup");
    }
    if (failedOperations.length > 0) {
      throw new Error(
        `Supabase test fixture cleanup failed: ${failedOperations.join(", ")}`
      );
    }
  };

  try {
    const credentials = [0, 1].map((index) => ({
      email: `trustkaki-gate0-${runId}-${index}@example.com`,
      password: `Tk-${randomUUID()}`,
    }));

    for (const credential of credentials) {
      const { data, error } = await serviceClient.auth.admin.createUser({
        email: credential.email,
        password: credential.password,
        email_confirm: true,
      });
      requireNoError("auth user creation", error);
      if (!data.user) throw new Error("Supabase test fixture auth user creation failed");
      createdUserIds.push(data.user.id);
    }

    const { error: caregiverError } = await serviceClient.from("caregivers").insert([
      {
        id: caregiverIds[0],
        external_ref: `gate0-caregiver-a-${runId}`,
        display_name: "Gate 0 Caregiver A",
        relationship: "test caregiver",
        auth_user_id: createdUserIds[0],
      },
      {
        id: caregiverIds[1],
        external_ref: `gate0-caregiver-b-${runId}`,
        display_name: "Gate 0 Caregiver B",
        relationship: "test caregiver",
        auth_user_id: createdUserIds[1],
      },
    ]);
    requireNoError("caregiver creation", caregiverError);

    const { error: seniorError } = await serviceClient.from("seniors").insert([
      {
        id: seniorIds[0],
        external_ref: `gate0-shared-senior-${runId}`,
        display_name: "Gate 0 Shared Senior",
        risk_level: "yellow",
      },
      {
        id: seniorIds[1],
        external_ref: `gate0-private-senior-${runId}`,
        display_name: "Gate 0 Private Senior",
        risk_level: "yellow",
      },
    ]);
    requireNoError("senior creation", seniorError);

    const { error: relationshipError } = await serviceClient
      .from("senior_caregivers")
      .insert([
        { senior_id: seniorIds[0], caregiver_id: caregiverIds[0], role: "caregiver" },
        { senior_id: seniorIds[0], caregiver_id: caregiverIds[1], role: "caregiver" },
        { senior_id: seniorIds[1], caregiver_id: caregiverIds[1], role: "caregiver" },
      ]);
    requireNoError("caregiver relationship creation", relationshipError);

    const observedAt = new Date().toISOString();
    const { error: patternError } = await serviceClient.from("patterns").insert([
      {
        id: sharedPatternIds[0],
        senior_id: seniorIds[0],
        pattern_type: "combined_wellbeing_decline",
        status: "active",
        severity: "medium",
        first_observed_at: observedAt,
        latest_observed_at: observedAt,
        concise_summary: "Shared wellbeing test pattern",
        recommended_action: "Contact the shared senior",
      },
      {
        id: sharedPatternIds[1],
        senior_id: seniorIds[0],
        pattern_type: "mobility_and_frailty",
        status: "active",
        severity: "medium",
        first_observed_at: observedAt,
        latest_observed_at: observedAt,
        concise_summary: "Shared mobility test pattern",
        recommended_action: "Check mobility support",
      },
      {
        id: privatePatternId,
        senior_id: seniorIds[1],
        pattern_type: "social_withdrawal",
        status: "active",
        severity: "medium",
        first_observed_at: observedAt,
        latest_observed_at: observedAt,
        concise_summary: "Private social test pattern",
        recommended_action: "Contact the private senior",
      },
    ]);
    requireNoError("pattern creation", patternError);

    const { error: queueError } = await serviceClient
      .from("caregiver_queue_items")
      .insert([
        {
          id: sharedQueueId,
          senior_id: seniorIds[0],
          pattern_id: sharedPatternIds[0],
          status: "pending",
          reason: "Shared senior needs follow-up",
          change_from_usual: "Test change from routine",
          recommended_action: "Contact the shared senior",
          episode_key: `gate0-shared-${runId}`,
          related_pattern_ids: sharedPatternIds,
          related_pattern_types: [
            "combined_wellbeing_decline",
            "mobility_and_frailty",
          ],
          last_evidence_at: observedAt,
        },
        {
          id: privateQueueId,
          senior_id: seniorIds[1],
          pattern_id: privatePatternId,
          status: "pending",
          reason: "Private senior needs follow-up",
          change_from_usual: "Private test change from routine",
          recommended_action: "Contact the private senior",
          episode_key: `gate0-private-${runId}`,
          related_pattern_ids: [privatePatternId],
          related_pattern_types: ["social_withdrawal"],
          last_evidence_at: observedAt,
        },
      ]);
    requireNoError("queue creation", queueError);

    const signedInClients: TrustKakiClient[] = [];
    for (const credential of credentials) {
      const signInClient = createClient(config.url, config.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await signInClient.auth.signInWithPassword(credential);
      requireNoError("test user sign-in", error);
      if (!data.session) throw new Error("Supabase test fixture sign-in failed");
      signedInClients.push(
        createAuthenticatedClient(config.url, config.anonKey, data.session.access_token)
      );
    }

    return {
      serviceClient,
      caregiverA: {
        userId: createdUserIds[0],
        caregiverId: caregiverIds[0],
        client: signedInClients[0],
      },
      caregiverB: {
        userId: createdUserIds[1],
        caregiverId: caregiverIds[1],
        client: signedInClients[1],
      },
      sharedSeniorId: seniorIds[0],
      privateSeniorId: seniorIds[1],
      sharedQueueId,
      privateQueueId,
      sharedPatternIds,
      cleanup,
    };
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Supabase test fixture setup and cleanup failed"
      );
    }
    throw error;
  }
}
