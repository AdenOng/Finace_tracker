"use client";

import { useEffect, useState } from "react";

import { Button, type ButtonProps } from "./button";

/**
 * Two-click button for destructive actions: the first click arms it, the second runs `onConfirm`.
 * Disarms itself after a few seconds so a stray click later does nothing.
 */
export function ConfirmButton({
  onConfirm,
  confirmLabel = "Click again to confirm",
  children,
  ...props
}: Omit<ButtonProps, "onClick"> & {
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <Button
      {...props}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}
