import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { parseJsonBody, queueActionRequestSchema } from "@/lib/api/schemas";
import {
  authJsonError,
  requireAuthenticatedCaregiver,
} from "@/lib/auth/session";
import { recordCaregiverQueueAction } from "@/lib/persistence/caregiverCaseRepository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authResult = await requireAuthenticatedCaregiver(request);
  if (!authResult.ok) return authJsonError(authResult);

  try {
    const parsed = await parseJsonBody(request, queueActionRequestSchema);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }
    const body = parsed.data;

    const persistence = await recordCaregiverQueueAction({
      accessToken: authResult.accessToken,
      queueItemId: body.queueItemId,
      actionType: body.actionType,
      outcomeType: body.outcomeType ?? null,
      note: body.note ?? null,
      assignedCaregiverId: body.assignedCaregiverId ?? null,
      snoozedUntil: body.snoozedUntil ?? null,
    });

    return NextResponse.json({ status: "ok", ...persistence });
  } catch (error) {
    return jsonError("Failed to record caregiver action", { error, status: 500 });
  }
}
