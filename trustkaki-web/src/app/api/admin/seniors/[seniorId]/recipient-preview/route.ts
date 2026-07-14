import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { parseJsonBody, recipientPreviewRequestSchema } from "@/lib/api/schemas";
import { authJsonError, canAccessSenior, requireDemoAdmin } from "@/lib/auth/session";
import { previewRecipient } from "@/lib/persistence/contactPlanRepository";

export async function POST(request: Request, context: { params: Promise<{ seniorId: string }> }) {
  const authResult = await requireDemoAdmin(request);
  if (!authResult.ok) return authJsonError(authResult);
  const { seniorId } = await context.params;
  if (!canAccessSenior(authResult.auth, seniorId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = await parseJsonBody(request, recipientPreviewRequestSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  try {
    const result = await previewRecipient({ accessToken: authResult.accessToken, seniorId, ...parsed.data });
    return NextResponse.json({ status: "ok", recipientDecision: result, delivered: false });
  } catch (error) {
    return jsonError("Failed to preview recipient", { error, status: 500 });
  }
}
