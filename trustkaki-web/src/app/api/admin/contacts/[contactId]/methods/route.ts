import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { contactMethodCreateRequestSchema, parseJsonBody } from "@/lib/api/schemas";
import { authJsonError, requireOrganisationAdmin } from "@/lib/auth/session";
import { ContactPlanForbiddenError, contactPlanCommands } from "@/lib/persistence/contactPlanRepository";

export async function POST(request: Request, context: { params: Promise<{ contactId: string }> }) {
  const authResult = await requireOrganisationAdmin(request);
  if (!authResult.ok) return authJsonError(authResult);
  const parsed = await parseJsonBody(request, contactMethodCreateRequestSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const { contactId } = await context.params;
  const body = parsed.data;
  try {
    const result = await contactPlanCommands.createMethod(authResult.accessToken, {
      p_contact_id: contactId, p_command_id: body.commandId,
      p_channel: body.channel, p_destination_normalized: body.destination,
      p_method_priority: body.methodPriority, p_timezone: body.timezone,
      p_quiet_hours_start: body.quietHoursStart ?? null,
      p_quiet_hours_end: body.quietHoursEnd ?? null,
    });
    return NextResponse.json({ status: "ok", ...result });
  } catch (error) {
    if (error instanceof ContactPlanForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return jsonError("Failed to create contact method", { error, status: 500 });
  }
}
