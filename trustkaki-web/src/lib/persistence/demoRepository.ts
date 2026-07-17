import "server-only";

import { uncleTan } from "@/data/demo";
import type {
  AgentRunContext,
  AgentRunResult,
  TriageOutput,
  TriageTimelineOutput,
} from "@/lib/agents/contracts";
import { normalizePhoneNumber } from "@/lib/phone";
import { createTrustKakiUserClient } from "@/lib/supabase/server";
import {
  DEMO_AAC_VOLUNTEER_ID,
  DEMO_CAREGIVER_ID,
  DEMO_SENIOR_ID,
  type PersistenceMeta,
} from "./orchestration";
import {
  getOrCreateActiveCheckIn,
  upsertAgentRuns,
} from "./orchestrationRepository";
import { runPatternWatchForSenior } from "./patternRepository";
import {
  getClient,
  localDemoMeta,
  supabaseMeta,
  type TrustKakiClient,
  throwIfError,
} from "./persistenceSupport";

const DEMO_ORGANISATION_ID = "00000000-0000-4000-8000-000000000006";

export async function resetDemoPersistence(args: {
  accessToken: string;
}): Promise<PersistenceMeta> {
  const client = createTrustKakiUserClient(args.accessToken);
  if (!client) {
    return {
      mode: "local_demo",
      configured: false,
      persisted: false,
      reason: "Supabase env vars are not configured. Demo data was not reset.",
    };
  }

  const { error } = await client.rpc("reset_trustkaki_demo");
  if (error) throw new Error("reset TrustKaki demo failed");
  return { mode: "supabase", configured: true, persisted: true };
}
async function ensureDemoPeople(client: TrustKakiClient, context?: AgentRunContext) {
  const senior = context?.senior;
  const demoSeniorPhone = normalizePhoneNumber(process.env.TRUSTKAKI_DEMO_SENIOR_PHONE);

  const { error: seniorError } = await client.from("seniors").upsert(
    {
      id: DEMO_SENIOR_ID,
      external_ref: "demo_uncle_tan",
      display_name: senior?.name ?? uncleTan.name,
      organisation_id: DEMO_ORGANISATION_ID,
      age: senior?.age ?? uncleTan.age,
      living_situation: senior?.livingSituation ?? uncleTan.livingSituation,
      phone_e164: demoSeniorPhone,
    },
    { onConflict: "id" }
  );
  throwIfError(seniorError, "upsert demo senior");

  const { error: caregiversError } = await client.from("caregivers").upsert(
    [
      {
        id: DEMO_CAREGIVER_ID,
        external_ref: "demo_rachel_tan",
        display_name: senior?.caregiver ?? uncleTan.caregiver,
        relationship: "daughter",
      },
      {
        id: DEMO_AAC_VOLUNTEER_ID,
        external_ref: "demo_mei_ling",
        display_name: senior?.aacVolunteer ?? uncleTan.aacVolunteer,
        relationship: "AAC volunteer",
      },
    ],
    { onConflict: "id" }
  );
  throwIfError(caregiversError, "upsert demo caregivers");

  const { error: relationshipError } = await client
    .from("senior_caregivers")
    .upsert(
      [
        {
          senior_id: DEMO_SENIOR_ID,
          caregiver_id: DEMO_CAREGIVER_ID,
          role: "caregiver",
        },
        {
          senior_id: DEMO_SENIOR_ID,
          caregiver_id: DEMO_AAC_VOLUNTEER_ID,
          role: "aac_volunteer",
        },
      ],
      { onConflict: "senior_id,caregiver_id,role" }
    );
  throwIfError(relationshipError, "upsert demo relationships");
}

export async function persistQuickDemoTriageResult(args: {
  seniorId: string;
  messageId: string;
  message: string;
  timestamp: string;
  context: AgentRunContext;
  result: AgentRunResult<TriageOutput>;
}): Promise<PersistenceMeta> {
  const client = getClient();
  if (!client) return localDemoMeta();

  await ensureDemoPeople(client, args.context);
  const checkIn = await getOrCreateActiveCheckIn(client, args.seniorId, args.context);

  const { error: messageError } = await client.from("messages").upsert(
    {
      check_in_id: checkIn.id,
      senior_id: args.seniorId,
      sender: "senior",
      text: args.message,
      client_message_id: args.messageId,
      created_at: args.timestamp,
    },
    { onConflict: "client_message_id", ignoreDuplicates: true }
  );
  throwIfError(messageError, "upsert quick demo message");

  const agentRuns = await upsertAgentRuns(client, checkIn.id, [
    {
      agentId: args.result.agentId,
      agentName: args.result.agentName,
      traceId: args.result.traceId,
      input: args.result.input,
      reasoning: args.result.reasoning,
      output: args.result.output,
      outputJson: args.result.data,
      tags: args.result.tags,
      durationMs: args.result.durationMs,
      modelUsed: args.result.modelUsed,
      fallback: args.result.fallback,
      inputSummary: args.result.inputSummary,
      outputSummary: args.result.outputSummary,
      stateChanges: args.result.stateChanges,
      errorMessage: args.result.errorMessage ?? null,
    },
  ]);

  const triageRunId =
    agentRuns.find((run) => run.agent_id === "triage")?.id ?? null;
  if (args.result.data.signals.length > 0) {
    const { error } = await client.from("detected_signals").insert(
      args.result.data.signals.map((signal) => ({
        check_in_id: checkIn.id,
        signal_type: signal.type,
        description: signal.description,
        severity: signal.severity,
        source_agent_run_id: triageRunId,
        observed_at: args.timestamp,
      }))
    );
    throwIfError(error, "insert quick demo detected signals");
  }

  const { error: checkInError } = await client
    .from("check_ins")
    .update({
      risk_after: args.result.data.riskLevel,
      summary: args.result.data.summary,
    })
    .eq("id", checkIn.id);
  throwIfError(checkInError, "update quick demo check-in");

  const { error: seniorError } = await client
    .from("seniors")
    .update({
      risk_level: args.result.data.riskLevel,
      last_check_in_at: args.timestamp,
    })
    .eq("id", args.seniorId);
  throwIfError(seniorError, "update quick demo senior");

  await runPatternWatchForSenior(client, args.seniorId);
  return supabaseMeta();
}

export async function persistQuickDemoTimelineResult(args: {
  seniorId: string;
  messages: Array<{ id: string; text: string; timestamp: string }>;
  context: AgentRunContext;
  result: AgentRunResult<TriageTimelineOutput>;
}): Promise<PersistenceMeta> {
  const client = getClient();
  if (!client) return localDemoMeta();

  await ensureDemoPeople(client, args.context);
  const checkIn = await getOrCreateActiveCheckIn(client, args.seniorId, args.context);

  const { error: messagesError } = await client.from("messages").upsert(
    args.messages.map((message) => ({
      check_in_id: checkIn.id,
      senior_id: args.seniorId,
      sender: "senior" as const,
      text: message.text,
      client_message_id: message.id,
      created_at: message.timestamp,
    })),
    { onConflict: "client_message_id", ignoreDuplicates: true }
  );
  throwIfError(messagesError, "upsert quick demo timeline messages");

  const agentRuns = await upsertAgentRuns(client, checkIn.id, [
    {
      agentId: args.result.agentId,
      agentName: args.result.agentName,
      traceId: args.result.traceId,
      input: args.result.input,
      reasoning: args.result.reasoning,
      output: args.result.output,
      outputJson: args.result.data,
      tags: args.result.tags,
      durationMs: args.result.durationMs,
      modelUsed: args.result.modelUsed,
      fallback: args.result.fallback,
      inputSummary: args.result.inputSummary,
      outputSummary: args.result.outputSummary,
      stateChanges: args.result.stateChanges,
      errorMessage: args.result.errorMessage ?? null,
    },
  ]);

  const messageById = new Map(args.messages.map((message) => [message.id, message]));
  const triageRunId =
    agentRuns.find((run) => run.agent_id === "triage")?.id ?? null;
  const detectedSignals = args.result.data.messages.flatMap((analysis) => {
    const sourceMessage = messageById.get(analysis.messageId);
    if (!sourceMessage) return [];
    return analysis.signals.map((signal) => ({
      check_in_id: checkIn.id,
      signal_type: signal.type,
      description: signal.description,
      severity: signal.severity,
      source_agent_run_id: triageRunId,
      observed_at: sourceMessage.timestamp,
    }));
  });

  if (detectedSignals.length > 0) {
    const { error } = await client.from("detected_signals").insert(detectedSignals);
    throwIfError(error, "insert quick demo timeline detected signals");
  }

  const latestMessage = args.messages[args.messages.length - 1];
  const { error: checkInError } = await client
    .from("check_ins")
    .update({
      risk_after: args.result.data.overallRiskLevel,
      summary: args.result.data.summary,
    })
    .eq("id", checkIn.id);
  throwIfError(checkInError, "update quick demo timeline check-in");

  const { error: seniorError } = await client
    .from("seniors")
    .update({
      risk_level: args.result.data.overallRiskLevel,
      last_check_in_at: latestMessage?.timestamp ?? new Date().toISOString(),
    })
    .eq("id", args.seniorId);
  throwIfError(seniorError, "update quick demo timeline senior");

  await runPatternWatchForSenior(client, args.seniorId);
  return supabaseMeta();
}
