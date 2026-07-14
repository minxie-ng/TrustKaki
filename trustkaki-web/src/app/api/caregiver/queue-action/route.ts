import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { parseJsonBody, queueActionRequestSchema } from "@/lib/api/schemas";
import {
  authJsonError,
  requireAuthenticatedCaregiver,
} from "@/lib/auth/session";
import {
  CaregiverCaseConflictError,
  recordCaregiverQueueAction,
} from "@/lib/persistence/caregiverCaseRepository";

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
      commandId: body.commandId,
      expectedUpdatedAt: body.expectedUpdatedAt,
      actionType: body.actionType,
      outcomeType: body.outcomeType ?? null,
      note: body.note ?? null,
      assignedCaregiverId: body.assignedCaregiverId ?? null,
      snoozedUntil: body.snoozedUntil ?? null,
    });

    return NextResponse.json({ status: "ok", ...persistence });
  } catch (error) {
    if (error instanceof CaregiverCaseConflictError) {
      return NextResponse.json(
        {
          error: "This case was updated by another caregiver. Refresh and review the latest status.",
          code: "case_conflict",
        },
        { status: 409 }
      );
    }
    return jsonError("Failed to record caregiver action", { error, status: 500 });
  }
}
