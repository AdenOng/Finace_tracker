"use client";

import { useEffect, useState } from "react";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Seconds since mount, advancing every frame and starting from `from`. When motion is reduced
 * the clock stays at `still`.
 */
export function useClock(still = 6, from = still) {
  const reduced = useReducedMotion();
  const [t, setT] = useState(from);
  useEffect(() => {
    if (reduced) {
      setT(still);
      return;
    }
    let frame = 0;
    const start = performance.now() - from * 1000;
    const tick = (now: number) => {
      setT((now - start) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, still, from]);
  return { t, reduced };
}
