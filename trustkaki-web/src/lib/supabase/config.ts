export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

export interface SupabaseServerConfig extends SupabasePublicConfig {
  serviceRoleKey: string;
}

export interface PersistenceStatus {
  mode: "supabase" | "local_demo";
  configured: boolean;
  reason?: string;
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function getSupabaseServerConfig(): SupabaseServerConfig | null {
  const publicConfig = getSupabasePublicConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!publicConfig || !serviceRoleKey) return null;
  return { ...publicConfig, serviceRoleKey };
}

export function getPersistenceStatus(): PersistenceStatus {
  return getSupabaseServerConfig()
    ? { mode: "supabase", configured: true }
    : {
        mode: "local_demo",
        configured: false,
        reason:
          "Supabase env vars are not configured. Running in non-persistent local demo mode.",
      };
}
