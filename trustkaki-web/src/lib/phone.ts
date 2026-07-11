export function normalizePhoneNumber(value: string | null | undefined): string | null {
  if (!value) return null;

  const digits = value.replace(/\D/g, "");
  return digits || null;
}
