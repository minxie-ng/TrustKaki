import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { contactMethodUpdateRequestSchema, parseJsonBody } from "@/lib/api/schemas";
import { authJsonError, requireDemoAdmin } from "@/lib/auth/session";
import { ContactPlanConflictError, contactPlanCommands } from "@/lib/persistence/contactPlanRepository";

export async function PATCH(request: Request, context: { params: Promise<{ methodId: string }> }) {
  const authResult = await requireDemoAdmin(request);
  if (!authResult.ok) return authJsonError(authResult);
  const parsed = await parseJsonBody(request, contactMethodUpdateRequestSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const { methodId } = await context.params;
  const body = parsed.data;
  try {
    const result = await contactPlanCommands.updateMethod(authResult.accessToken, {
      p_method_id: methodId, p_command_id: body.commandId,
      p_expected_updated_at: body.expectedUpdatedAt,
      p_channel: body.channel, p_destination_normalized: body.destination ?? null,
      p_verification_status: body.verificationStatus,
      p_verification_method: body.verificationMethod,
      p_verified_at: body.verifiedAt, p_method_priority: body.methodPriority,
      p_timezone: body.timezone, p_quiet_hours_start: body.quietHoursStart ?? null,
      p_quiet_hours_end: body.quietHoursEnd ?? null, p_active: body.active,
    });
    return NextResponse.json({ status: "ok", ...result });
  } catch (error) {
    if (error instanceof ContactPlanConflictError) return NextResponse.json({ error: "Contact plan changed", code: "contact_plan_conflict" }, { status: 409 });
    return jsonError("Failed to update contact method", { error, status: 500 });
  }
}
