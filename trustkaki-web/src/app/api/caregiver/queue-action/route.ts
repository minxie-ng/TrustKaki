import { NextResponse } from "next/server";
import { recordCaregiverQueueAction } from "@/lib/persistence/trustkakiRepository";
import type { CaregiverActionItem, ContactOutcome } from "@/lib/types";

const ACTIONS = new Set([
  "mark_for_follow_up",
  "assign",
  "record_outcome",
  "snooze",
  "resolve",
]);

const OUTCOMES = new Set([
  "reached_and_okay",
  "needs_follow_up",
  "referred_to_aac_staff",
  "unable_to_reach",
  "resolved",
]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      queueItemId?: unknown;
      actionType?: unknown;
      outcomeType?: unknown;
      note?: unknown;
      assignedCaregiverId?: unknown;
      snoozedUntil?: unknown;
    };

    if (
      typeof body.queueItemId !== "string" ||
      typeof body.actionType !== "string" ||
      !ACTIONS.has(body.actionType)
    ) {
      return NextResponse.json({ error: "Invalid queue action" }, { status: 400 });
    }

    const outcomeType =
      typeof body.outcomeType === "string" && OUTCOMES.has(body.outcomeType)
        ? (body.outcomeType as ContactOutcome)
        : null;

    const persistence = await recordCaregiverQueueAction({
      queueItemId: body.queueItemId,
      actionType: body.actionType as CaregiverActionItem["actionType"],
      outcomeType,
      note: typeof body.note === "string" ? body.note.slice(0, 500) : null,
      assignedCaregiverId:
        typeof body.assignedCaregiverId === "string"
          ? body.assignedCaregiverId
          : null,
      snoozedUntil:
        typeof body.snoozedUntil === "string" ? body.snoozedUntil : null,
    });

    return NextResponse.json({ status: "ok", persistence });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to record caregiver action", detail: message },
      { status: 500 }
    );
  }
}
