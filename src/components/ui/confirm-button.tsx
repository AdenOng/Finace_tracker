"use client";

import { useEffect, useState } from "react";

import { useT } from "~/i18n/client";

import { Button, type ButtonProps } from "./button";

/**
 * Two-click button for destructive actions: the first click arms it, the second runs `onConfirm`.
 * Disarms itself after a few seconds, on Escape, or when focus leaves it, so a stray click later
 * does nothing and moving away cancels.
 */
export function ConfirmButton({
  onConfirm,
  confirmLabel,
  children,
  ...props
}: Omit<ButtonProps, "onClick"> & {
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  const t = useT();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <Button
      {...props}
      aria-live="polite"
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
      onBlur={(event) => {
        setArmed(false);
        props.onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (armed && event.key === "Escape") {
          event.stopPropagation();
          setArmed(false);
        }
        props.onKeyDown?.(event);
      }}
    >
      {armed ? (confirmLabel ?? t.common.actions.confirmAgain) : children}
    </Button>
  );
}
