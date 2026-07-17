import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { parseJsonBody, seniorContactUpdateRequestSchema } from "@/lib/api/schemas";
import { authJsonError, requireOrganisationAdmin } from "@/lib/auth/session";
import { ContactPlanConflictError, ContactPlanForbiddenError, contactPlanCommands } from "@/lib/persistence/contactPlanRepository";

export async function PATCH(request: Request, context: { params: Promise<{ contactId: string }> }) {
  const authResult = await requireOrganisationAdmin(request);
  if (!authResult.ok) return authJsonError(authResult);
  const parsed = await parseJsonBody(request, seniorContactUpdateRequestSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const { contactId } = await context.params;
  const body = parsed.data;
  try {
    const result = await contactPlanCommands.updateContact(authResult.accessToken, {
      p_contact_id: contactId, p_command_id: body.commandId,
      p_expected_updated_at: body.expectedUpdatedAt,
      p_display_name: body.displayName, p_relationship: body.relationship,
      p_contact_kind: body.contactKind, p_preferred_language: body.preferredLanguage,
      p_timezone: body.timezone, p_escalation_priority: body.escalationPriority,
      p_active: body.active,
    });
    return NextResponse.json({ status: "ok", ...result });
  } catch (error) {
    if (error instanceof ContactPlanForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (error instanceof ContactPlanConflictError) return NextResponse.json({ error: "Contact plan changed", code: "contact_plan_conflict" }, { status: 409 });
    return jsonError("Failed to update contact", { error, status: 500 });
  }
}
