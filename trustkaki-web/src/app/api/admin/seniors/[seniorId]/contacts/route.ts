import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { parseJsonBody, seniorContactCreateRequestSchema } from "@/lib/api/schemas";
import { authJsonError, canAdministerSenior, requireOrganisationAdmin } from "@/lib/auth/session";
import { contactPlanCommands } from "@/lib/persistence/contactPlanRepository";

export async function POST(request: Request, context: { params: Promise<{ seniorId: string }> }) {
  const authResult = await requireOrganisationAdmin(request);
  if (!authResult.ok) return authJsonError(authResult);
  const { seniorId } = await context.params;
  if (!canAdministerSenior(authResult.auth, seniorId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = await parseJsonBody(request, seniorContactCreateRequestSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.data;
  try {
    const result = await contactPlanCommands.createContact(authResult.accessToken, {
      p_senior_id: seniorId, p_command_id: body.commandId,
      p_display_name: body.displayName, p_relationship: body.relationship,
      p_contact_kind: body.contactKind, p_preferred_language: body.preferredLanguage,
      p_timezone: body.timezone, p_escalation_priority: body.escalationPriority,
    });
    return NextResponse.json({ status: "ok", ...result });
  } catch (error) {
    return jsonError("Failed to create contact", { error, status: 500 });
  }
}
