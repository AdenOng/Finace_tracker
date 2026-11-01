"use client";

import type { Messages } from "~/i18n/messages";
import { useT } from "~/i18n/client";
import { cn } from "~/lib/cn";

type Status =
  "queued" | "running" | "needs_review" | "completed" | "failed" | "cancelled";

const labels = (t: Messages): Record<Status, string> => ({
  queued: t.imports.importStatus.waiting,
  running: t.imports.importStatus.reading,
  needs_review: t.imports.importStatus.readyToReview,
  completed: t.imports.importStatus.imported,
  failed: t.imports.importStatus.couldntRead,
  cancelled: t.imports.importStatus.cancelled,
});

/** A job's state as a small ink stamp; the reading states pulse. */
export function ImportStatus({
  status,
  stale = false,
}: {
  status: Status;
  stale?: boolean;
}) {
  const t = useT();
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
      {stale ? t.imports.importStatus.interrupted : labels(t)[shown]}
    </span>
  );
}

export const isReading = (status: string, stale = false) =>
  !stale && (status === "queued" || status === "running");
