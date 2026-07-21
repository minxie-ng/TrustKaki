"use client";

import { useRef, useState } from "react";
import { authHeader } from "@/lib/auth/client";
import type {
  SeniorContextActionCommand,
  SeniorContextReadItem,
  SeniorContextReadModel,
} from "@/lib/api/schemas";

export function contextPanelEndpoint(seniorId: string, admin: boolean) {
  const scope = admin ? "/api/admin/seniors" : "/api/seniors";
  return `${scope}/${encodeURIComponent(seniorId)}/context`;
}

export function reuseContextCommand(
  previous: { fingerprint: string; id: string } | null,
  fingerprint: string,
  createId: () => string
) {
  return previous?.fingerprint === fingerprint
    ? previous
    : { fingerprint, id: createId() };
}

function itemContent(item: SeniorContextReadItem): string {
  if (item.store === "memory") return item.content;
  if (item.store === "health_context") return item.description;
  return `${item.label}: ${item.usualPattern}`;
}

const contextGroups = [
  { store: "memory", label: "Preferences" },
  { store: "routine_baseline", label: "Usual routine" },
  { store: "health_context", label: "Observed operational context" },
] as const;

export function memoryPanelPresentation(
  items: SeniorContextReadItem[],
  isAdmin: boolean
) {
  return {
    visible: true,
    canManage: isAdmin,
    groups: contextGroups
      .map((group) => ({
        label: group.label,
        items: items
          .filter((item) => item.store === group.store)
          .map((item) => ({ id: item.id, content: itemContent(item) })),
      }))
      .filter((group) => group.items.length > 0),
  } as const;
}

interface Props {
  context: SeniorContextReadModel | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  seniorId: string | null;
  authToken: string;
  onChanged: (context: SeniorContextReadModel) => void;
  onUnauthorized: () => void;
}

function sourceLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function displayDate(value: string | null): string {
  if (!value) return "No expiry";
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function correctionCommand(
  item: SeniorContextReadItem,
  content: string,
  reason: string,
  commandId: string
): SeniorContextActionCommand {
  const common = {
    action: "correct" as const,
    commandId,
    contextId: item.id,
    expectedUpdatedAt: item.updatedAt,
    reason,
  };
  if (item.store === "memory") {
    return {
      ...common,
      store: "memory",
      replacement: {
        contextKey: item.contextKey,
        memoryType: item.memoryType,
        content,
        importance: item.importance,
        safeUseNotes: item.safeUseNotes,
        applicationTags: item.applicationTags,
        expiresAt: item.expiresAt,
      },
    };
  }
  if (item.store === "health_context") {
    return {
      ...common,
      store: "health_context",
      replacement: {
        contextKey: item.contextKey,
        contextType: item.contextType,
        description: content,
        safeUseNotes:
          item.safeUseNotes ??
          "Use only to guide follow-up questions; this is not a diagnosis.",
        applicationTags: item.applicationTags,
        expiresAt: item.expiresAt,
      },
    };
  }
  return {
    ...common,
    store: "routine_baseline",
    replacement: {
      contextKey: item.contextKey,
      baselineType: item.baselineType,
      label: item.label,
      usualPattern: content,
      scheduleJson:
        item.scheduleJson &&
        typeof item.scheduleJson === "object" &&
        !Array.isArray(item.scheduleJson)
          ? item.scheduleJson
          : {},
      safeUseNotes: item.safeUseNotes,
      applicationTags: item.applicationTags,
      expiresAt: item.expiresAt,
    },
  };
}

export function SeniorContextPanel(props: Props) {
  const items = props.context?.items ?? [];
  const view = memoryPanelPresentation(items, props.isAdmin);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingAction, setEditingAction] = useState<"correct" | "archive" | null>(
    null
  );
  const [content, setContent] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const commandRef = useRef<{ fingerprint: string; id: string } | null>(null);

  if (!props.seniorId || !view.visible) return null;

  function beginCorrection(item: SeniorContextReadItem) {
    setEditingId(item.id);
    setEditingAction("correct");
    setContent(
      item.store === "memory"
        ? item.content
        : item.store === "health_context"
          ? item.description
          : item.usualPattern
    );
    setReason("");
    setMessage(null);
    commandRef.current = null;
  }

  async function submit(item: SeniorContextReadItem, action: "correct" | "archive") {
    if (busy || reason.trim().length < 10) return;
    const commandWithoutId =
      action === "correct"
        ? correctionCommand(item, content.trim(), reason.trim(), "pending")
        : {
            action: "archive" as const,
            contextId: item.id,
            store: item.store,
            expectedUpdatedAt: item.updatedAt,
            reason: reason.trim(),
          };
    const fingerprint = JSON.stringify(commandWithoutId);
    const identity = reuseContextCommand(
      commandRef.current,
      fingerprint,
      () => crypto.randomUUID()
    );
    commandRef.current = identity;
    const command =
      action === "correct"
        ? correctionCommand(item, content.trim(), reason.trim(), identity.id)
        : { ...commandWithoutId, commandId: identity.id };
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(contextPanelEndpoint(props.seniorId!, true), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader(props.authToken),
        },
        body: JSON.stringify(command),
      });
      if (response.status === 401) props.onUnauthorized();
      if (!response.ok) {
        throw new Error(response.status === 409 ? "conflict" : "failed");
      }
      const result = (await response.json()) as {
        context: SeniorContextReadModel;
      };
      commandRef.current = null;
      setEditingId(null);
      setEditingAction(null);
      setReason("");
      setMessage(action === "correct" ? "Context corrected." : "Context archived.");
      props.onChanged(result.context);
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "conflict"
          ? "This context changed. Refresh and try again."
          : "Could not update context. Please retry."
      );
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
              Known context
            </div>
            <div className="mt-1 text-sm text-gray-700">
              {props.loading
                ? "Loading context..."
                : view.groups.length > 0
                  ? view.groups
                      .map((group) => `${group.label}: ${group.items.length}`)
                      .join(" | ")
                  : "No active context"}
            </div>
          </div>
          <span className="text-sm font-semibold text-gray-700">
            {open ? "Hide" : "View"}
          </span>
        </div>
      </summary>
      <div className="border-t border-gray-200 px-4 py-3">
        {props.error ? (
          <p className="text-sm text-red-700">{props.error}</p>
        ) : view.groups.length === 0 ? (
          <p className="text-sm text-gray-600">No active context is recorded.</p>
        ) : (
          <div className="space-y-5">
            {view.groups.map((group) => (
              <section key={group.label}>
                <h3 className="text-sm font-semibold text-gray-950">{group.label}</h3>
                <div className="mt-2 divide-y divide-gray-200 border-y border-gray-200">
                  {group.items.map((summary) => {
                    const item = items.find((candidate) => candidate.id === summary.id)!;
                    const editing = editingId === item.id;
                    return (
                      <div key={item.id} className="py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-900">{summary.content}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {sourceLabel(item.source)} | Confirmed {displayDate(item.lastConfirmedAt)} | {item.expiresAt ? `Expires ${displayDate(item.expiresAt)}` : "No expiry"}
                            </p>
                            {item.safeUseNotes && (
                              <p className="mt-1 text-xs text-gray-600">{item.safeUseNotes}</p>
                            )}
                          </div>
                          {view.canManage && !editing && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => beginCorrection(item)}
                                className="text-xs font-semibold text-[var(--care-brand)] hover:text-[var(--care-brand-hover)] disabled:opacity-50"
                              >
                                Confirm details
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setEditingId(item.id);
                                  setEditingAction("archive");
                                  setReason("");
                                  setMessage(null);
                                  commandRef.current = null;
                                }}
                                className="text-xs font-semibold text-red-700 disabled:opacity-50"
                              >
                                Archive
                              </button>
                            </div>
                          )}
                        </div>
                        {view.canManage && editing && (
                          <div className="mt-3 grid gap-3 border-l-2 border-emerald-600 pl-3">
                            {editingAction === "correct" && (
                              <label className="text-xs font-medium text-gray-700">
                                Corrected context
                                <textarea
                                  value={content}
                                  disabled={busy}
                                  onChange={(event) => setContent(event.target.value)}
                                  rows={2}
                                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                />
                              </label>
                            )}
                            <label className="text-xs font-medium text-gray-700">
                              Reason
                              <input
                                value={reason}
                                disabled={busy}
                                onChange={(event) => setReason(event.target.value)}
                                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                              />
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {editingAction === "correct" ? (
                                <button
                                  type="button"
                                  disabled={busy || content.trim().length === 0 || reason.trim().length < 10}
                                  onClick={() => void submit(item, "correct")}
                                  className="rounded-md bg-[var(--care-brand-strong)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--care-brand-hover)] disabled:opacity-50"
                                >
                                  Save correction
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy || reason.trim().length < 10}
                                  onClick={() => void submit(item, "archive")}
                                  className="rounded-md border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                                >
                                  Archive context
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setEditingId(null);
                                  setEditingAction(null);
                                }}
                                className="px-2 py-2 text-xs font-semibold text-gray-600 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
        {message && (
          <p className="mt-3 text-sm text-gray-700" role="status">
            {message}
          </p>
        )}
      </div>
    </details>
  );
}
