"use client";

import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";

import { useT } from "~/i18n/client";
import { cn } from "~/lib/cn";
import { Button } from "./button";

/**
 * A link to hand over, with a copy button. The Clipboard API only exists on HTTPS and localhost,
 * so on a plain-HTTP LAN address this falls back to selecting the text for Ctrl+C.
 */
export function CopyField({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("No clipboard access");
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      input.current?.focus();
      input.current?.select();
      // Older API, still works on insecure origins in most browsers.
      const copied = document.execCommand?.("copy") ?? false;
      setState(copied ? "copied" : "manual");
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="border-brand bg-wash rounded-ctl flex flex-wrap items-center gap-3 border-2 p-3">
        <input
          ref={input}
          readOnly
          value={value}
          aria-label={t.common.fields.link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none"
        />
        <Button variant="secondary" size="sm" onClick={() => void copy()}>
          {state === "copied" ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {state === "copied"
            ? t.common.actions.copied
            : t.common.actions.copyLink}
        </Button>
      </div>
      {state === "manual" ? (
        <p className="text-ink-2 text-[13px]">{t.common.copyBlocked}</p>
      ) : null}
    </div>
  );
}
