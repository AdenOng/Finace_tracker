"use client";

import { Languages } from "lucide-react";

import { useLocale, useSetLocale, useT } from "~/i18n/client";
import { type Locale, localeNames, locales } from "~/i18n/config";
import { useId } from "react";

import { cn } from "~/lib/cn";

/** Short marks for the compact switch; each language is named in itself so either reader finds it. */
const marks: Record<Locale, string> = { en: "EN", zh: "中文" };

/**
 * Two-way language switch. `compact` shows short marks (EN · 中文) for the sidebar and header;
 * otherwise each option carries its full name, for Settings.
 */
export function LanguageSwitch({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const locale = useLocale();
  const t = useT();
  const [setLocale, pending] = useSetLocale();
  const groupName = useId();
  return (
    <div
      role="radiogroup"
      aria-label={t.common.language.label}
      aria-busy={pending || undefined}
      className={cn(
        "border-line-2 inline-flex items-center gap-0.5 rounded-full border p-0.5",
        className,
      )}
    >
      {compact ? (
        <Languages
          aria-hidden
          className="text-ink-3 mx-1.5 size-3.5 shrink-0"
          strokeWidth={1.75}
        />
      ) : null}
      {locales.map((option) => {
        const active = option === locale;
        return (
          <label
            key={option}
            lang={option === "zh" ? "zh-Hans" : "en"}
            title={localeNames[option]}
            className={cn(
              "has-[:focus-visible]:outline-brand inline-flex cursor-pointer items-center rounded-full font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
              compact ? "h-7 px-2.5 text-[12px]" : "h-9 px-4 text-[13px]",
              active
                ? "bg-ink text-canvas"
                : "text-ink-2 hover:bg-wash hover:text-ink",
            )}
          >
            <input
              type="radio"
              name={groupName}
              value={option}
              checked={active}
              onChange={() => setLocale(option)}
              className="sr-only"
            />
            {compact ? marks[option] : localeNames[option]}
          </label>
        );
      })}
    </div>
  );
}
