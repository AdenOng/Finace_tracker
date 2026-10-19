"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "~/lib/cn";

/**
 * Native <dialog> wrapper: focus trapping, Esc and backdrop come from the browser. Opens as a
 * right-hand drawer, which keeps the table it edits visible on wide screens.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "paper border-line-2 text-ink open:animate-drawer fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-lg border-l p-0 shadow-[-24px_0_80px_rgb(0_0_0/0.6)]",
        className,
      )}
    >
      {open ? (
        <div className="flex h-full flex-col">
          <div className="border-line flex items-start justify-between gap-4 border-b px-6 py-5">
            <div>
              <h2 className="font-display text-2xl font-semibold">{title}</h2>
              {description ? (
                <p className="text-ink-2 mt-1 text-sm">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-ctl hover:bg-wash -mr-2 grid size-9 place-items-center"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
          {footer ? (
            <div className="border-line flex justify-end gap-2 border-t px-6 py-4">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
