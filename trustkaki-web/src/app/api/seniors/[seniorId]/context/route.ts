import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import {
  authJsonError,
  canAccessSenior,
  requireAuthenticatedCaregiver,
} from "@/lib/auth/session";
import { readSeniorContext } from "@/lib/persistence/memoryRepository";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ seniorId: string }> }
) {
  const authResult = await requireAuthenticatedCaregiver(request);
  if (!authResult.ok) return authJsonError(authResult);
  const { seniorId } = await context.params;
  if (!canAccessSenior(authResult.auth, seniorId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const seniorContext = await readSeniorContext({
      accessToken: authResult.accessToken,
      seniorId,
      now: new Date().toISOString(),
    });
    return NextResponse.json({ context: seniorContext });
  } catch (error) {
    return jsonError("Failed to load senior context", { error, status: 500 });
  }
}
