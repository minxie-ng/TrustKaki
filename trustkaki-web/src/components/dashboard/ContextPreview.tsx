"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { SeniorContextReadItem, SeniorContextReadModel } from "@/lib/api/schemas";

export function previewContextItems(
  context: SeniorContextReadModel | null,
  seniorId: string | null,
  now: number,
): SeniorContextReadItem[] {
  if (!seniorId || context?.seniorId !== seniorId) return [];
  return context.items
    .filter((item) => !item.expiresAt || Date.parse(item.expiresAt) > now)
    .sort((a, b) => Number(b.store === "memory") - Number(a.store === "memory"))
    .slice(0, 3);
}

export function ContextPreview({ context, seniorId, loading, error, children }: {
  context: SeniorContextReadModel | null;
  seniorId: string | null;
  loading: boolean;
  error: string | null;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const items = previewContextItems(context, seniorId, now);
  return (
    <section aria-label="What we know">
      <h2 className="text-base font-semibold text-[var(--care-ink)]">What we know</h2>
      <p className="mt-1 text-sm leading-5 text-gray-600">Personal context to guide this check-in.</p>
      {loading ? <p role="status" className="mt-4 text-sm text-gray-600">Loading context…</p>
        : error ? <p role="status" className="mt-4 text-sm text-gray-700">Context unavailable. Open full context for details.</p>
        : items.length === 0 ? <p className="mt-4 text-sm text-gray-600">No current personal context recorded.</p>
        : <ul className="mt-3 divide-y divide-[var(--care-line)] border-y border-[var(--care-line)]">
          {items.map((item) => <li key={item.id} className="py-4">
            <p className="break-words text-base leading-6 text-[var(--care-ink)]">{item.store === "memory" ? item.content : item.store === "health_context" ? item.description : `${item.label}: ${item.usualPattern}`}</p>
            <p className="mt-2 break-words text-sm leading-5 text-gray-600">{item.source.replaceAll("_", " ")}</p>
            <p className="text-sm text-gray-600">Confirmed {new Date(item.lastConfirmedAt).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}</p>
          </li>)}
        </ul>}
      {seniorId && <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="mt-2 min-h-11 text-sm font-semibold text-[var(--care-brand)] hover:underline">
        {expanded ? "Hide full context" : "View all context"}
      </button>}
      {expanded && children}
    </section>
  );
}
