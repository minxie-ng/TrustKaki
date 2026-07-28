import type { FollowUpQueueItem, RiskLevel, SeniorListItem } from "@/lib/types";
import type { StatusTone } from "@/components/ui/StatusIndicator";
import { riskHeadlineLabel } from "./presentation";

export type CareUrgency = "urgent" | "today" | "monitoring" | "stable";
export type MobileCareWorkspaceView = "queue" | "people" | "context";

export const mobileCareWorkspaceViews: ReadonlyArray<{
  id: MobileCareWorkspaceView;
  label: string;
}> = [
  { id: "queue", label: "Queue" },
  { id: "people", label: "People" },
  { id: "context", label: "Context" },
];

export function nextMobileCareWorkspaceView(
  current: MobileCareWorkspaceView,
  key: string
): MobileCareWorkspaceView | null {
  if (key === "Home") return mobileCareWorkspaceViews[0].id;
  if (key === "End") return mobileCareWorkspaceViews.at(-1)?.id ?? current;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;

  const currentIndex = mobileCareWorkspaceViews.findIndex(
    (view) => view.id === current
  );
  const direction = key === "ArrowRight" ? 1 : -1;
  const nextIndex =
    (currentIndex + direction + mobileCareWorkspaceViews.length) %
    mobileCareWorkspaceViews.length;
  return mobileCareWorkspaceViews[nextIndex].id;
}

export const careUrgencyTone: Record<CareUrgency, StatusTone> = {
  urgent: "urgent",
  today: "attention",
  monitoring: "neutral",
  stable: "stable",
};

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
  "mr tan ah hock": "/seniors/mr-tan-ah-hock-photo.webp",
  "mdm lim siew lan": "/seniors/mdm-lim-siew-lan-photo.webp",
  "mdm siti fatimah binte rahman": "/seniors/mdm-siti-fatimah-photo.webp",
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
  const candidates = words[1]?.toLowerCase() === "ah" ? [words[0], words.at(-1)!] : words.slice(0, 2);
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
      reason: activeItem
        ? compactCoverageReason(
            riskHeadlineLabel(activeItem.headline, activeItem.riskLevel)
          )
        : null,
      portraitSrc: portraitForSenior(senior.name),
      initials: initialsForSenior(senior.name),
    }));
}
