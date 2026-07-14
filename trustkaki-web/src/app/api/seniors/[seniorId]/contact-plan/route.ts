import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import {
  authJsonError,
  canAccessSenior,
  requireAuthenticatedCaregiver,
} from "@/lib/auth/session";
import { readMaskedContactPlan } from "@/lib/persistence/contactPlanRepository";

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
    return NextResponse.json({
      contactPlan: await readMaskedContactPlan({ seniorId }),
    });
  } catch (error) {
    return jsonError("Failed to load contact plan", { error, status: 500 });
  }
}
