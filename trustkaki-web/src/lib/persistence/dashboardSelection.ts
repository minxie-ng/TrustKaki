export function selectDashboardSeniorId(args: {
  accessibleSeniorIds: string[];
  requestedSeniorId?: string | null;
  preferredSeniorId: string;
}): string {
  const requested = args.requestedSeniorId?.trim();
  if (requested) {
    if (!args.accessibleSeniorIds.includes(requested)) {
      throw new Error("Forbidden");
    }
    return requested;
  }

  if (args.accessibleSeniorIds.includes(args.preferredSeniorId)) {
    return args.preferredSeniorId;
  }

  const first = args.accessibleSeniorIds[0];
  if (!first) throw new Error("Forbidden");
  return first;
}
