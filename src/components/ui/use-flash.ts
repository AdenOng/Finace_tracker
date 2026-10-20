"use client";

import { useCallback, useEffect, useState } from "react";

export type Flash = {
  tone: "success" | "error" | "warn" | "info";
  message: string;
};

/**
 * One status message for a screen. Each new message replaces the last, so an old error never
 * sits next to a newer success, and successes clear themselves after a few seconds. Errors stay
 * until the next action.
 */
export function useFlash(timeoutMs = 6000) {
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    if (!flash || flash.tone === "error") return;
    const timer = setTimeout(() => setFlash(null), timeoutMs);
    return () => clearTimeout(timer);
  }, [flash, timeoutMs]);

  const success = useCallback(
    (message: string) => setFlash({ tone: "success", message }),
    [],
  );
  const error = useCallback(
    (err: { message: string } | string) =>
      setFlash({
        tone: "error",
        message: typeof err === "string" ? err : err.message,
      }),
    [],
  );
  const clear = useCallback(() => setFlash(null), []);

  return { flash, setFlash, success, error, clear };
}
