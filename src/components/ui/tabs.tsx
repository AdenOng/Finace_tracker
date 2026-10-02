"use client";

import { cn } from "~/lib/cn";

/** Underline tabs used as filters. */
export function FilterTabs<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="border-line flex gap-6 overflow-x-auto border-b"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "-mb-px flex h-10 items-center gap-1.5 border-b-[3px] text-sm font-semibold whitespace-nowrap transition-colors",
              active
                ? "border-forest text-ink"
                : "text-ink-3 hover:text-ink border-transparent",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="figures text-ink-3 text-[12px] font-medium">
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
