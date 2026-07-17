import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import {
  parseJsonBody,
  seniorContextActionRequestSchema,
} from "@/lib/api/schemas";
import {
  authJsonError,
  canAdministerSenior,
  requireOrganisationAdmin,
} from "@/lib/auth/session";
import {
  ContextConflictError,
  mutateSeniorContext,
  readSeniorContext,
} from "@/lib/persistence/memoryRepository";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ seniorId: string }> }
) {
  const authResult = await requireOrganisationAdmin(request);
  if (!authResult.ok) return authJsonError(authResult);
  const { seniorId } = await context.params;
  if (!canAdministerSenior(authResult.auth, seniorId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = await parseJsonBody(request, seniorContextActionRequestSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  try {
    await mutateSeniorContext({
      accessToken: authResult.accessToken,
      seniorId,
      command: parsed.data,
    });
    const seniorContext = await readSeniorContext({
      accessToken: authResult.accessToken,
      seniorId,
      now: new Date().toISOString(),
    });
    return NextResponse.json({ context: seniorContext });
  } catch (error) {
    if (error instanceof ContextConflictError) {
      return NextResponse.json(
        { error: "Senior context changed. Refresh and try again." },
        { status: 409 }
      );
    }
    return jsonError("Failed to update senior context", { error, status: 500 });
  }
}
