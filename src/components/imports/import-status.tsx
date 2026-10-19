import { cn } from "~/lib/cn";

type Status =
  "queued" | "running" | "needs_review" | "completed" | "failed" | "cancelled";

const LABELS: Record<Status, string> = {
  queued: "Waiting",
  running: "Reading",
  needs_review: "Ready to review",
  completed: "Imported",
  failed: "Couldn't read",
  cancelled: "Cancelled",
};

/** A job's state as a small ink stamp; the reading states pulse. */
export function ImportStatus({
  status,
  stale = false,
}: {
  status: Status;
  stale?: boolean;
}) {
  const shown = stale ? "failed" : status;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold tracking-wide whitespace-nowrap",
        shown === "needs_review" && "bg-art-mustard text-paper-ink",
        shown === "completed" && "bg-art-green text-white",
        shown === "failed" && "bg-loss-wash text-loss",
        (shown === "queued" || shown === "running") && "bg-wash text-ink-2",
        shown === "cancelled" && "bg-wash text-ink-3",
      )}
    >
      {shown === "queued" || shown === "running" ? (
        <span className="bg-art-cobalt size-1.5 animate-pulse rounded-full" />
      ) : null}
      {stale ? "Interrupted" : LABELS[shown]}
    </span>
  );
}

export const isReading = (status: string, stale = false) =>
  !stale && (status === "queued" || status === "running");
