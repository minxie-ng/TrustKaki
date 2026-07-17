import type { FollowUpQueueItem, RiskLevel, SeniorListItem } from "@/lib/types";

export type CareUrgency = "urgent" | "today" | "monitoring" | "stable";

export interface SeniorCoverageView {
  senior: SeniorListItem;
  position: number;
  urgency: CareUrgency;
  reason: string | null;
  portraitSrc: string | null;
  initials: string;
  activeItem: FollowUpQueueItem | null;
}

const portraits: Record<string, string> = {
  "mr tan ah hock": "/seniors/mr-tan-ah-hock.webp",
  "mdm lim siew lan": "/seniors/mdm-lim-siew-lan.webp",
  "mdm siti fatimah binte rahman": "/seniors/mdm-siti-fatimah.webp",
};

const riskOrder: Record<RiskLevel, number> = { red: 0, yellow: 1, green: 2 };

export function compactCoverageReason(value: string, max = 48): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

export function portraitForSenior(name: string): string | null {
  return portraits[name.trim().toLowerCase()] ?? null;
}

export function initialsForSenior(name: string): string {
  const ignored = new Set(["mr", "mdm", "mrs", "ms", "dr"]);
  const words = name.trim().split(/\s+/).filter((word) => word && !ignored.has(word.toLowerCase()));
  if (words.length === 0) return "TK";
  const candidates = words.slice(0, 2);
  return candidates.map((word) => word[0]?.toUpperCase() ?? "").join("").slice(0, 2) || "TK";
}

function activeItemForSenior(queue: FollowUpQueueItem[], seniorId: string): FollowUpQueueItem | null {
  return queue
    .filter((item) => item.seniorId === seniorId && item.status !== "resolved")
    .sort((a, b) => a.priority - b.priority || b.lastUpdatedAt.localeCompare(a.lastUpdatedAt))[0] ?? null;
}

function urgencyFor(senior: SeniorListItem, item: FollowUpQueueItem | null): CareUrgency {
  if (item && (senior.riskLevel === "red" || item.status === "escalated")) return "urgent";
  if (item) return "today";
  return senior.riskLevel === "green" ? "stable" : "monitoring";
}

export function buildSeniorCoverage(
  seniors: SeniorListItem[],
  queue: FollowUpQueueItem[]
): SeniorCoverageView[] {
  return seniors
    .map((senior) => ({ senior, activeItem: activeItemForSenior(queue, senior.id) }))
    .sort((a, b) => {
      if (Boolean(a.activeItem) !== Boolean(b.activeItem)) return a.activeItem ? -1 : 1;
      if (a.activeItem && b.activeItem) {
        const priority = a.activeItem.priority - b.activeItem.priority;
        if (priority !== 0) return priority;
      }
      const risk = riskOrder[a.senior.riskLevel] - riskOrder[b.senior.riskLevel];
      if (risk !== 0) return risk;
      const activity = new Date(b.senior.lastCheckIn ?? 0).getTime() -
        new Date(a.senior.lastCheckIn ?? 0).getTime();
      return activity || a.senior.name.localeCompare(b.senior.name, "en-SG");
    })
    .map(({ senior, activeItem }, index) => ({
      senior,
      activeItem,
      position: index + 1,
      urgency: urgencyFor(senior, activeItem),
      reason: activeItem ? compactCoverageReason(activeItem.headline) : null,
      portraitSrc: portraitForSenior(senior.name),
      initials: initialsForSenior(senior.name),
    }));
}
