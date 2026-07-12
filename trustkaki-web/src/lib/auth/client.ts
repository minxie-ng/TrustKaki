export function authHeader(token: string | null | undefined): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function publicUserRole(user: {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
} | null): string | null {
  const role = user?.app_metadata?.role;
  return typeof role === "string" ? role : null;
}

export function canShowDemoControls(user: { role?: string | null } | null): boolean {
  return user?.role === "demo_admin";
}
