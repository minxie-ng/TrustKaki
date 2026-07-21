"use client";

import { useRef, useState } from "react";
import { authHeader } from "@/lib/auth/client";
import type { ProactiveCheckInScheduleOverview } from "@/lib/checkins/contracts";

export function proactiveScheduleEndpoint(seniorId: string) {
  return `/api/admin/seniors/${encodeURIComponent(seniorId)}/check-in-schedule`;
}

const statusLabels: Record<ProactiveCheckInScheduleOverview["state"], string> = {
  not_configured: "Not configured",
  scheduled: "Scheduled",
  paused: "Paused",
  pending_initial_send: "Preparing check-in",
  awaiting_initial_response: "Waiting for reply",
  pending_retry_send: "Retry due",
  awaiting_retry_response: "Waiting after retry",
  responded: "Reply received",
  escalated: "Follow-up created",
  cancelled: "Cancelled",
  failed: "Needs attention",
};

export function proactiveCheckInPresentation(
  overview: ProactiveCheckInScheduleOverview | null,
  isAdmin: boolean
) {
  if (!isAdmin) return { visible: false } as const;
  const schedule = overview?.schedule ?? null;
  const paused = Boolean(schedule?.pausedAt);
  return {
    visible: true,
    status: statusLabels[overview?.state ?? "not_configured"],
    canRunNow: Boolean(schedule && !paused),
    canPause: Boolean(schedule && !paused),
    canResume: Boolean(schedule && paused),
  } as const;
}

interface Props {
  overview: ProactiveCheckInScheduleOverview | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  seniorId: string | null;
  authToken: string;
  onSaved: () => void;
  onUnauthorized: () => void;
}

type ScheduleAction = "configure" | "pause" | "resume" | "manual_run";

function displayTime(value: string | null | undefined) {
  if (!value) return "None yet";
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ProactiveCheckInPanel(props: Props) {
  const view = proactiveCheckInPresentation(props.overview, props.isAdmin);
  const schedule = props.overview?.schedule ?? null;
  const [localSendTime, setLocalSendTime] = useState(schedule?.localSendTime ?? "09:00");
  const [pauseReason, setPauseReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const commandRef = useRef<{ fingerprint: string; id: string } | null>(null);

  if (!view.visible) return null;

  async function submit(action: ScheduleAction) {
    if (!props.seniorId || busy) return;
    const body = {
      action,
      platform: schedule?.platform ?? "telegram",
      localSendTime,
      timezone: schedule?.timezone ?? "Asia/Singapore",
      activeWeekdays: schedule?.activeWeekdays ?? [1, 2, 3, 4, 5, 6, 7],
      initialResponseMinutes: schedule?.initialResponseMinutes ?? 120,
      retryResponseMinutes: schedule?.retryResponseMinutes ?? 60,
      initialMessageTemplate:
        schedule?.initialMessageTemplate ?? "Good morning. How are you today?",
      retryMessageTemplate:
        schedule?.retryMessageTemplate ?? "Just checking again. Reply when convenient.",
      reason: action === "pause" ? pauseReason.trim() : null,
    };
    const fingerprint = JSON.stringify(body);
    const commandId = commandRef.current?.fingerprint === fingerprint
      ? commandRef.current.id
      : crypto.randomUUID();
    commandRef.current = { fingerprint, id: commandId };
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(proactiveScheduleEndpoint(props.seniorId), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader(props.authToken) },
        body: JSON.stringify({ commandId, ...body }),
      });
      if (response.status === 401) props.onUnauthorized();
      if (!response.ok) throw new Error(response.status === 409 ? "conflict" : "failed");
      commandRef.current = null;
      if (action === "pause") setPauseReason("");
      setMessage(action === "manual_run" ? "Check-in queued." : "Schedule updated.");
      props.onSaved();
    } catch (error) {
      setMessage(error instanceof Error && error.message === "conflict"
        ? "The schedule changed. Refresh and try again."
        : "Could not update the schedule. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details
      className="group overflow-hidden rounded-lg border border-[var(--care-line)] border-l-[3px] border-l-[var(--care-brand)] bg-white shadow-[0_3px_12px_rgba(23,33,29,0.04)] transition-colors hover:border-[var(--care-teal-line)] hover:border-l-[var(--care-brand)]"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer list-none bg-[var(--care-surface-muted)] px-4 py-3 transition-colors hover:bg-[var(--care-soft-teal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--care-brand)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-[var(--care-brand)]">
              Proactive check-in
            </div>
            <div className="mt-1 font-semibold text-gray-950">
              {props.loading ? "Loading schedule..." : view.status}
            </div>
          </div>
          <span className="text-sm font-semibold text-gray-700">
            {open ? "Hide" : "Manage"}
          </span>
        </div>
      </summary>
      <div className="border-t border-gray-200 px-4 py-3">
        {props.error ? (
          <p className="text-sm text-red-700">{props.error}</p>
        ) : (
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div><span className="block text-xs text-gray-500">Next check-in</span>{displayTime(schedule?.nextRunAt)}</div>
            <div><span className="block text-xs text-gray-500">Last sent</span>{displayTime(props.overview?.lastSendAt)}</div>
            <div><span className="block text-xs text-gray-500">Last issue</span>{props.overview?.lastFailure ? displayTime(props.overview.lastFailure.occurredAt) : "None"}</div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-gray-800">
            Daily time
            <input
              type="time"
              value={localSendTime}
              disabled={busy}
              onChange={(event) => setLocalSendTime(event.target.value)}
              className="mt-1 block rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <button type="button" disabled={busy} onClick={() => void submit("configure")}
            className="rounded-lg bg-[var(--care-brand-strong)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--care-brand-hover)] disabled:opacity-50">
            {schedule ? "Update time" : "Set schedule"}
          </button>
          {view.canRunNow && (
            <button type="button" disabled={busy} onClick={() => void submit("manual_run")}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-50">
              Run now
            </button>
          )}
          {view.canResume && (
            <button type="button" disabled={busy} onClick={() => void submit("resume")}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-50">
              Resume
            </button>
          )}
        </div>

        {view.canPause && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-64 flex-1 text-sm font-medium text-gray-800">
              Reason for pausing
              <input
                value={pauseReason}
                disabled={busy}
                onChange={(event) => setPauseReason(event.target.value)}
                placeholder="Example: Senior is away with family"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <button type="button" disabled={busy || pauseReason.trim().length < 10}
              onClick={() => void submit("pause")}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-50">
              Pause
            </button>
          </div>
        )}
        {message && <p className="mt-3 text-sm text-gray-700" role="status">{message}</p>}
      </div>
    </details>
  );
}
