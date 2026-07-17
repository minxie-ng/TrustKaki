import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { contactConsentRequestSchema, parseJsonBody } from "@/lib/api/schemas";
import { authJsonError, requireOrganisationAdmin } from "@/lib/auth/session";
import { ContactPlanForbiddenError, contactPlanCommands } from "@/lib/persistence/contactPlanRepository";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ methodId: string }> }
) {
  const authResult = await requireOrganisationAdmin(request);
  if (!authResult.ok) return authJsonError(authResult);
  const parsed = await parseJsonBody(request, contactConsentRequestSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const { methodId } = await context.params;
  const body = parsed.data;
  try {
    const result = await contactPlanCommands.recordConsent(authResult.accessToken, {
      p_method_id: methodId,
      p_command_id: body.commandId,
      p_event_type: body.eventType,
      p_permitted_categories: body.categories,
      p_allow_urgent_quiet_hours: body.allowUrgentQuietHours,
      p_confirmation_method: body.confirmationMethod,
      p_confirmed_at: body.confirmedAt,
      p_expires_at: body.expiresAt ?? null,
      p_note: body.note ?? null,
    });
    return NextResponse.json({ status: "ok", ...result });
  } catch (error) {
    if (error instanceof ContactPlanForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return jsonError("Failed to record contact consent", { error, status: 500 });
  }
}
