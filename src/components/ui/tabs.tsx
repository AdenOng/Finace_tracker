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
      onKeyDown={(event) => {
        const buttons = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
            '[role="tab"]',
          ),
        ];
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        let next: number;
        switch (event.key) {
          case "ArrowRight":
            next = (index + 1) % buttons.length;
            break;
          case "ArrowLeft":
            next = (index - 1 + buttons.length) % buttons.length;
            break;
          case "Home":
            next = 0;
            break;
          case "End":
            next = buttons.length - 1;
            break;
          default:
            return;
        }
        event.preventDefault();
        buttons[next]?.focus();
        buttons[next]?.click();
      }}
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
            tabIndex={active ? 0 : -1}
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
