"use client";

import { X } from "lucide-react";

import { useT } from "~/i18n/client";

import { Notice } from "./panel";
import type { Flash } from "./use-flash";

/** Renders the current `useFlash` message with an optional dismiss button, or nothing. */
export function FlashNotice({
  flash,
  onDismiss,
  className,
}: {
  flash: Flash | null;
  onDismiss?: () => void;
  className?: string;
}) {
  const t = useT();
  if (!flash) return null;
  return (
    <Notice tone={flash.tone} className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {flash.message}
          {flash.action ? <> {flash.action}</> : null}
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t.common.actions.dismiss}
            className="rounded-ctl text-ink-2 hover:bg-wash hover:text-ink -my-1 -mr-1.5 grid size-7 shrink-0 place-items-center transition-colors"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </Notice>
  );
}
