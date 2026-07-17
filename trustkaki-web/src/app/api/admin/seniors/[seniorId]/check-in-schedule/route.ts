import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import {
  parseJsonBody,
  proactiveCheckInScheduleRequestSchema,
} from "@/lib/api/schemas";
import {
  authJsonError,
  canAdministerSenior,
  requireOrganisationAdmin,
} from "@/lib/auth/session";
import {
  ProactiveCheckInConflictError,
  readScheduleOverviewForSenior,
  saveScheduleCommand,
} from "@/lib/persistence/proactiveCheckInRepository";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ seniorId: string }> };

async function authorize(request: Request, context: RouteContext) {
  const authResult = await requireOrganisationAdmin(request);
  if (!authResult.ok) return { ok: false, response: authJsonError(authResult) } as const;
  const { seniorId } = await context.params;
  if (!canAdministerSenior(authResult.auth, seniorId)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as const;
  }
  return { ok: true, authResult, seniorId } as const;
}

export async function GET(request: Request, context: RouteContext) {
  const authorized = await authorize(request, context);
  if (!authorized.ok) return authorized.response;
  try {
    const schedule = await readScheduleOverviewForSenior({
      accessToken: authorized.authResult.accessToken,
      seniorId: authorized.seniorId,
    });
    return NextResponse.json({ status: "ok", schedule });
  } catch (error) {
    return jsonError("Failed to load check-in schedule", { error, status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const authorized = await authorize(request, context);
  if (!authorized.ok) return authorized.response;
  const parsed = await parseJsonBody(request, proactiveCheckInScheduleRequestSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  try {
    const result = await saveScheduleCommand(authorized.authResult.accessToken, {
      seniorId: authorized.seniorId,
      ...parsed.data,
      reason: parsed.data.reason ?? null,
      now: new Date().toISOString(),
    });
    return NextResponse.json({ status: "ok", result });
  } catch (error) {
    if (error instanceof ProactiveCheckInConflictError) {
      return NextResponse.json(
        { error: "The check-in schedule changed. Refresh and try again." },
        { status: 409 }
      );
    }
    return jsonError("Failed to update check-in schedule", { error, status: 500 });
  }
}
