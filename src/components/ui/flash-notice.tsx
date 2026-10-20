import type { Flash } from "./use-flash";
import { Notice } from "./panel";

/** Renders the current `useFlash` message, or nothing. */
export function FlashNotice({
  flash,
  className,
}: {
  flash: Flash | null;
  className?: string;
}) {
  if (!flash) return null;
  return (
    <Notice tone={flash.tone} className={className}>
      {flash.message}
    </Notice>
  );
}
