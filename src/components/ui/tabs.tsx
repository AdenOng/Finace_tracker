"use client";

import { cn } from "~/lib/cn";

/** Underline tabs used as filters. */
export function FilterTabs<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
  label: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "bg-sunken border-line flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border p-1",
        className,
      )}
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
              "flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-surface-2 text-ink shadow-[inset_0_0_0_1px_var(--color-line-2)]"
                : "text-ink-3 hover:text-ink",
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
