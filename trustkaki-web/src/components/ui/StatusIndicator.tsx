export type StatusTone = "stable" | "attention" | "urgent" | "neutral";

const dotClass: Record<StatusTone, string> = {
  stable: "bg-[var(--status-green)]",
  attention: "bg-[var(--status-amber)]",
  urgent: "bg-[var(--status-red)]",
  neutral: "bg-[var(--care-hairline)]",
};

export function StatusIndicator({
  tone,
  label,
  className = "",
}: {
  tone: StatusTone;
  label: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 text-sm ${className}`}>
      <span
        data-status-dot="true"
        className={`h-2 w-2 shrink-0 rounded-full ${dotClass[tone]}`}
        aria-hidden="true"
      />
      <span>{label}</span>
    </span>
  );
}
