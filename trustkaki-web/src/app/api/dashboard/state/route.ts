import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import {
  authJsonError,
  requireAuthenticatedCaregiver,
} from "@/lib/auth/session";
import { readDashboardState } from "@/lib/persistence/trustkakiRepository";

export const runtime = "nodejs";

function suppressTechnicalTraces(
  state: Awaited<ReturnType<typeof readDashboardState>>,
  exposeTechnicalTraces: boolean
) {
  if (exposeTechnicalTraces) return state;
  return {
    ...state,
    data: {
      ...state.data,
      activeSessions: state.data.activeSessions.map((session) => ({
        ...session,
        traces: [],
      })),
    },
    traces: [],
  };
}

export async function GET(request: Request) {
  const authResult = await requireAuthenticatedCaregiver(request);
  if (!authResult.ok) return authJsonError(authResult);

  try {
    const url = new URL(request.url);
    const seniorId = url.searchParams.get("seniorId");
    const state = await readDashboardState({
      auth: authResult.auth,
      seniorId: seniorId?.trim() || undefined,
    });
    return NextResponse.json(
      suppressTechnicalTraces(state, authResult.auth.role === "demo_admin")
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return jsonError("Failed to read dashboard state", { error, status: 500 });
  }
}
