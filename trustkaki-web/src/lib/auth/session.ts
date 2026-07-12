import "server-only";

import { NextResponse } from "next/server";
import { createTrustKakiServiceClient } from "@/lib/supabase/server";

interface CaregiverAuthRow {
  id: string;
  display_name: string;
}

interface SeniorAccessRow {
  senior_id: string;
}

export interface AuthenticatedCaregiver {
  userId: string;
  email: string | null;
  role: string | null;
  caregiverId: string;
  caregiverName: string;
  accessibleSeniorIds: string[];
}

export interface AuthFailure {
  ok: false;
  status: 401 | 403;
  error: string;
}

export interface AuthSuccess {
  ok: true;
  auth: AuthenticatedCaregiver;
}

export type AuthResult = AuthSuccess | AuthFailure;

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice("bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export function canAccessSenior(
  auth: AuthenticatedCaregiver,
  seniorId: string
): boolean {
  return auth.accessibleSeniorIds.includes(seniorId);
}

export function authJsonError(result: AuthFailure) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}

export async function requireAuthenticatedCaregiver(
  request: Request
): Promise<AuthResult> {
  const token = bearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const client = createTrustKakiServiceClient();
  if (!client) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: userData, error: userError } = await client.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const caregiverResult = await client
    .from("caregivers")
    .select("id, display_name")
    .eq("auth_user_id", user.id)
    .single();
  const { data: caregiver, error: caregiverError } = caregiverResult as {
    data: CaregiverAuthRow | null;
    error: { message?: string } | null;
  };

  if (caregiverError || !caregiver) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const seniorResult = await client
    .from("senior_caregivers")
    .select("senior_id")
    .eq("caregiver_id", caregiver.id);
  const { data: seniorRows, error: seniorError } = seniorResult as {
    data: SeniorAccessRow[] | null;
    error: { message?: string } | null;
  };

  if (seniorError) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const role =
    typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null;

  return {
    ok: true,
    auth: {
      userId: user.id,
      email: user.email ?? null,
      role,
      caregiverId: caregiver.id,
      caregiverName: caregiver.display_name,
      accessibleSeniorIds: (seniorRows ?? []).map((row) => row.senior_id),
    },
  };
}

export async function requireDemoAdmin(request: Request): Promise<AuthResult> {
  const result = await requireAuthenticatedCaregiver(request);
  if (!result.ok) return result;
  if (result.auth.role !== "demo_admin") {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return result;
}
