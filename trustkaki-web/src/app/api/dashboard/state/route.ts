import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import {
  authJsonError,
  requireAuthenticatedCaregiver,
} from "@/lib/auth/session";
import { readDashboardState } from "@/lib/persistence/trustkakiRepository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authResult = await requireAuthenticatedCaregiver(request);
  if (!authResult.ok) return authJsonError(authResult);

  try {
    const state = await readDashboardState({ auth: authResult.auth });
    return NextResponse.json(state);
  } catch (error) {
    return jsonError("Failed to read dashboard state", { error, status: 500 });
  }
}
