"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { useT } from "~/i18n/client";
import { cn } from "~/lib/cn";

import { Button } from "./button";

/**
 * Native <dialog> wrapper: focus trapping, Esc and backdrop come from the browser. Opens as a
 * right-hand drawer, which keeps the table it edits visible on wide screens.
 *
 * Typing into any field marks the drawer as edited; Esc, the close button and backdrop clicks
 * then ask before discarding. Footer buttons that call `onClose` directly are explicit and
 * skip the check. A form reset (after an in-place save) clears the edited mark.
 * Drawers whose controls save immediately can disable the check with `confirmDiscard`.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  dirty = false,
  confirmDiscard = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Edits made without native input/change events, such as removing a holding. */
  dirty?: boolean;
  /** Disable for controls that save immediately, without an unsaved draft. */
  confirmDiscard?: boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const edited = useRef(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    edited.current = false;
    setConfirmingDiscard(false);
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (confirmingDiscard) keepEditingRef.current?.focus();
  }, [confirmingDiscard]);

  /** Close unless there are edits, in which case ask first. */
  function requestClose() {
    if (confirmDiscard && (edited.current || dirty)) setConfirmingDiscard(true);
    else onClose();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onInput={() => {
        edited.current = true;
      }}
      onChange={() => {
        edited.current = true;
      }}
      onReset={() => {
        edited.current = false;
      }}
      onKeyDown={(event) => {
        // Handled here rather than in `cancel`: browsers skip a cancel event that was
        // prevented without user activation in between, and Esc doesn't count as activation.
        if (
          event.key !== "Escape" ||
          !confirmDiscard ||
          !(edited.current || dirty)
        )
          return;
        event.preventDefault();
        setConfirmingDiscard((confirming) => !confirming);
      }}
      onCancel={(event) => {
        if (!confirmDiscard || !(edited.current || dirty)) return;
        event.preventDefault();
        setConfirmingDiscard(true);
      }}
      onClick={(event) => {
        if (event.target === ref.current) requestClose();
      }}
      className={cn(
        "paper border-line-2 text-ink open:animate-drawer fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-lg border-l p-0 shadow-[-24px_0_80px_rgb(0_0_0/0.6)]",
        className,
      )}
    >
      {open ? (
        <div className="flex h-full flex-col">
          <div className="border-line flex items-start justify-between gap-4 border-b px-6 py-5">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="font-display text-2xl font-semibold break-words"
              >
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="text-ink-2 mt-1 text-sm">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label={t.common.actions.close}
              className="rounded-ctl hover:bg-wash -mr-2 grid size-9 shrink-0 place-items-center"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
          {confirmingDiscard ? (
            <div
              role="alert"
              className="border-line bg-loss-wash flex flex-wrap items-center justify-end gap-2 border-t px-6 py-4"
            >
              <p className="mr-auto text-sm font-semibold">
                {t.common.discardChanges.prompt}
              </p>
              <Button
                ref={keepEditingRef}
                variant="ghost"
                onClick={() => setConfirmingDiscard(false)}
              >
                {t.common.discardChanges.keepEditing}
              </Button>
              <Button variant="danger" onClick={onClose}>
                {t.common.discardChanges.discard}
              </Button>
            </div>
          ) : footer ? (
            <div className="border-line flex flex-wrap justify-end gap-2 border-t px-6 py-4">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
