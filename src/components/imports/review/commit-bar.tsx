"use client";

import { Check } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "~/components/ui/button";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { Input } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { useT } from "~/i18n/client";
import { errorMessage } from "~/lib/errors";

export function ReviewCommitBar({
  acceptedCount,
  totalCount,
  undecidedCount,
  mismatchCount,
  needsDate,
  asOf,
  onAsOfChange,
  accountName,
  onDiscard,
  discardPending,
  onCommit,
  commitPending,
  commitDisabled,
  commitError,
  onHeightChange,
}: {
  acceptedCount: number;
  totalCount: number;
  undecidedCount: number;
  mismatchCount: number;
  needsDate: boolean;
  asOf: string;
  onAsOfChange: (value: string) => void;
  accountName: string | null;
  onDiscard: () => void;
  discardPending: boolean;
  onCommit: () => void;
  commitPending: boolean;
  commitDisabled: boolean;
  commitError: Parameters<typeof errorMessage>[0] | null;
  onHeightChange?: (height: number) => void;
}) {
  const t = useT();
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = barRef.current;
    if (!el || !onHeightChange) return;
    const update = () => onHeightChange(Math.ceil(el.getBoundingClientRect().height));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeightChange, commitError, needsDate]);

  return (
    <div
      ref={barRef}
      className="card fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-2.5 px-4 py-3 lg:sticky lg:inset-x-auto lg:bottom-4 lg:gap-3"
    >
      <p className="text-ink-2 mr-auto text-[13px]">
        {t.imports.importReview.selected(
          acceptedCount,
          totalCount,
          undecidedCount,
        )}
        {mismatchCount > 0 ? (
          <span className="text-warn">
            {t.imports.importReview.warnings(mismatchCount)}
          </span>
        ) : null}
      </p>
      {needsDate ? (
        <label className="flex items-center gap-2 text-[13px]">
          <span className="text-ink-2">{t.imports.importReview.asOf}</span>
          <Input
            type="date"
            value={asOf}
            onChange={(e) => onAsOfChange(e.target.value)}
            className="h-8 w-36 sm:w-40"
          />
        </label>
      ) : null}
      <ConfirmButton
        variant="ghost"
        size="sm"
        onConfirm={onDiscard}
        loading={discardPending}
      >
        {t.imports.importReview.discard}
      </ConfirmButton>
      <Button
        onClick={onCommit}
        loading={commitPending}
        disabled={commitDisabled}
      >
        <Check className="size-4" />
        {t.imports.importReview.saveTo(acceptedCount, accountName)}
      </Button>
      {commitError ? (
        <Notice tone="error" className="w-full">
          {errorMessage(commitError)}
        </Notice>
      ) : null}
    </div>
  );
}
