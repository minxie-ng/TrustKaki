import type { ReactNode } from "react";

type OperationalStateKind =
  | "loading"
  | "error"
  | "ready"
  | "refresh-error"
  | "success";

interface OperationalStateProps {
  kind: OperationalStateKind;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}

export default function OperationalState({
  kind,
  message,
  actionLabel,
  onAction,
  children,
}: OperationalStateProps) {
  if (kind === "loading") {
    return (
      <main
        aria-busy="true"
        className="h-full min-h-0 bg-[var(--care-mist)] text-[var(--care-ink)]"
      >
        <div
          data-workspace-grid="true"
          className="grid h-full min-h-80 grid-cols-1 bg-[var(--care-paper)] lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_245px]"
        >
          <div className="hidden border-r border-[var(--care-hairline)] bg-[var(--care-mist)] p-5 lg:block" />
          <div className="flex min-h-80 items-center justify-center p-6">
            <p className="text-sm font-semibold">{message}</p>
          </div>
          <div className="hidden border-l border-[var(--care-hairline)] bg-[var(--care-mist)] xl:block" />
        </div>
      </main>
    );
  }

  if (kind === "ready" || kind === "refresh-error" || kind === "success") {
    const hasMessage = kind !== "ready";
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div
          data-operational-message-slot="true"
          role={
            kind === "refresh-error"
              ? "alert"
              : kind === "success"
                ? "status"
                : undefined
          }
          aria-live={kind === "success" ? "polite" : undefined}
          aria-atomic={kind === "success" ? "true" : undefined}
          hidden={!hasMessage}
          className={`shrink-0 items-center justify-between gap-4 border-b px-4 py-3 text-sm ${
            hasMessage ? "flex" : "hidden"
          } ${
            kind === "refresh-error"
              ? "border-l-4 border-l-[var(--status-red)] bg-[var(--care-paper)]"
              : "border-l-4 border-l-[var(--status-green)] bg-[var(--care-paper)]"
          }`}
        >
          <span>{message}</span>
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="min-h-11 shrink-0 border border-[var(--care-evergreen)] px-3 py-2 font-semibold text-[var(--care-evergreen)]"
            >
              {actionLabel}
            </button>
          )}
        </div>
        <div key="content" className="min-h-0 flex-1">{children}</div>
      </div>
    );
  }

  return (
    <main className="flex h-full min-h-0 items-center justify-center bg-[var(--care-mist)] p-6">
      <div role="alert" className="w-full max-w-md border-l-4 border-l-[var(--status-red)] bg-[var(--care-paper)] p-5">
        <h1 className="font-display text-xl font-semibold">Dashboard unavailable</h1>
        <p className="mt-2 text-sm">{message}</p>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-4 min-h-11 bg-[var(--care-coral)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--care-coral-hover)]"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </main>
  );
}
