import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { authJsonError, requireDemoAdmin } from "@/lib/auth/session";
import { resetDemoPersistence } from "@/lib/persistence/demoRepository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authResult = await requireDemoAdmin(request);
  if (!authResult.ok) return authJsonError(authResult);

  try {
    const persistence = await resetDemoPersistence({
      accessToken: authResult.accessToken,
    });
    return NextResponse.json({ persistence });
  } catch (error) {
    return jsonError("Failed to reset demo data", { error, status: 500 });
  }
}
