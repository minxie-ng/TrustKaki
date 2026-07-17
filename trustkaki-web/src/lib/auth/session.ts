import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createTrustKakiServiceClient,
  createTrustKakiUserClient,
} from "@/lib/supabase/server";
import type { OrganisationMembershipRole } from "@/lib/supabase/types";

const caregiverAuthRowSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().min(1),
});

const membershipRowsSchema = z.array(
  z.object({
    organisation_id: z.string().uuid(),
    role: z.enum(["org_admin", "staff", "volunteer"]),
  })
);

const seniorRowsSchema = z.array(
  z.object({
    id: z.string().uuid(),
    organisation_id: z.string().uuid(),
  })
);

export interface AuthenticatedCaregiver {
  userId: string;
  email: string | null;
  role: string | null;
  caregiverId: string;
  caregiverName: string;
  organisationMemberships: Array<{
    organisationId: string;
    role: OrganisationMembershipRole;
  }>;
  accessibleSeniorIds: string[];
  administrableSeniorIds: string[];
}

export interface AuthFailure {
  ok: false;
  status: 401 | 403;
  error: string;
}

export interface AuthSuccess {
  ok: true;
  auth: AuthenticatedCaregiver;
  accessToken: string;
}

export type AuthResult = AuthSuccess | AuthFailure;

async function capture<T>(operation: () => PromiseLike<T> | T): Promise<
  | { ok: true; value: T }
  | { ok: false }
> {
  try {
    return { ok: true, value: await operation() };
  } catch {
    return { ok: false };
  }
}

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

export function canAdministerSenior(
  auth: AuthenticatedCaregiver,
  seniorId: string
): boolean {
  return auth.administrableSeniorIds.includes(seniorId);
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

  const userResult = await capture(() => client.auth.getUser(token));
  if (!userResult.ok) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const { data: userData, error: userError } = userResult.value;
  const user = userData.user;
  if (userError || !user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const caregiverResult = await capture(() =>
    client
      .from("caregivers")
      .select("id, display_name")
      .eq("auth_user_id", user.id)
      .single()
  );
  if (!caregiverResult.ok || caregiverResult.value.error) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  const caregiver = caregiverAuthRowSchema.safeParse(caregiverResult.value.data);
  if (!caregiver.success) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const userClientResult = await capture(() => createTrustKakiUserClient(token));
  if (!userClientResult.ok || !userClientResult.value) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  const userClient = userClientResult.value;
  const accessResults = await capture(() =>
    Promise.all([
      userClient
        .from("organisation_memberships")
        .select("organisation_id, role")
        .eq("caregiver_id", caregiver.data.id)
        .eq("active", true),
      userClient.from("seniors").select("id, organisation_id"),
    ])
  );
  if (!accessResults.ok) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  const [membershipResult, seniorResult] = accessResults.value;

  if (membershipResult.error || seniorResult.error) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  const membershipRows = membershipRowsSchema.safeParse(membershipResult.data);
  const seniorRows = seniorRowsSchema.safeParse(seniorResult.data);
  if (!membershipRows.success || !seniorRows.success) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const organisationMemberships = membershipRows.data
    .map((membership) => ({
      organisationId: membership.organisation_id,
      role: membership.role,
    }))
    .sort(
      (left, right) =>
        left.organisationId.localeCompare(right.organisationId) ||
        left.role.localeCompare(right.role)
    );
  const adminOrganisationIds = new Set(
    organisationMemberships
      .filter((membership) => membership.role === "org_admin")
      .map((membership) => membership.organisationId)
  );
  const accessibleSeniorIds = seniorRows.data
    .map((senior) => senior.id)
    .sort();
  const administrableSeniorIds = seniorRows.data
    .filter((senior) => adminOrganisationIds.has(senior.organisation_id))
    .map((senior) => senior.id)
    .sort();

  const role =
    typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null;

  return {
    ok: true,
    accessToken: token,
    auth: {
      userId: user.id,
      email: user.email ?? null,
      role,
      caregiverId: caregiver.data.id,
      caregiverName: caregiver.data.display_name,
      organisationMemberships,
      accessibleSeniorIds,
      administrableSeniorIds,
    },
  };
}

export async function requireOrganisationAdmin(
  request: Request
): Promise<AuthResult> {
  const result = await requireAuthenticatedCaregiver(request);
  if (!result.ok) return result;
  if (
    !result.auth.organisationMemberships.some(
      (membership) => membership.role === "org_admin"
    )
  ) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return result;
}

export async function requireDemoAdmin(request: Request): Promise<AuthResult> {
  const result = await requireAuthenticatedCaregiver(request);
  if (!result.ok) return result;
  if (result.auth.role !== "demo_admin") {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return result;
}
