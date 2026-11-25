"use client";

import { Check, Search } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useT } from "~/i18n/client";
import { cn } from "~/lib/cn";

export type ComboboxOption = {
  value: string;
  label: string;
  /** Optional extra searchable text (e.g. parent category name). */
  keywords?: string;
  disabled?: boolean;
};

/**
 * Searchable single-select combobox styled to match `Select`.
 * Supports keyboard filtering, ArrowUp/ArrowDown selection, Escape close, and optional
 * native FormData submission via a hidden input.
 */
export function Combobox({
  id,
  name,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  required = false,
  compact = false,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  compact?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const t = useT();
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label} ${o.keywords ?? ""}`.toLowerCase().includes(q),
    );
  }, [options, query]);

  // Start each opening with an empty filter on the selected option. This runs only when the
  // popover opens: parents often pass a fresh `options` array on every render, and resetting on
  // those would wipe what the user is typing.
  function setOpenState(next: boolean) {
    if (next && !open) {
      setQuery("");
      const idx = options.findIndex((o) => o.value === value && !o.disabled);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
    setOpen(next);
  }

  // Focus the filter before paint so the first keystrokes after opening land in it.
  useLayoutEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function selectOption(option: ComboboxOption) {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!filtered.length) return;
      setActiveIndex((prev) => (prev + 1) % filtered.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!filtered.length) return;
      setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const target = filtered[activeIndex];
      if (target && !target.disabled) selectOption(target);
    }
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      {name ? (
        <input
          type="hidden"
          name={name}
          value={value}
          required={required}
          readOnly
        />
      ) : null}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpenState(!open)}
        className={cn(
          "rounded-ctl border-line-2 bg-sunken text-ink select-chevron hover:border-ink-3 focus:border-brand disabled:bg-wash disabled:text-ink-3 flex w-full min-w-0 items-center truncate border pr-9 pl-3 text-left transition-[color,border-color,box-shadow] focus:shadow-[0_0_0_4px_var(--color-brand-soft)] focus:outline-none",
          compact ? "h-8 text-[12px]" : "h-10 text-sm",
          !selected?.value && "text-ink-3",
          className,
        )}
      >
        <span className="truncate">
          {selected?.label ?? placeholder ?? ""}
        </span>
      </button>
      {open ? (
        <div
          onKeyDown={handleKeyDown}
          className="paper border-line-2 rounded-ctl absolute right-0 left-0 z-40 mt-1 min-w-52 border shadow-xl"
        >
          <div className="border-line relative border-b p-1.5">
            <Search
              className="text-ink-3 pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              placeholder={t.common.combobox.searchPlaceholder}
              aria-label={t.common.combobox.searchPlaceholder}
              className="rounded-ctl bg-sunken border-line text-ink placeholder:text-ink-3 focus:border-brand h-8 w-full border pr-2 pl-7 text-[12px] focus:outline-none"
            />
          </div>
          <ul
            id={listId}
            role="listbox"
            className="max-h-60 overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <li className="text-ink-3 px-2.5 py-2 text-[12px]">
                {t.common.combobox.noMatches}
              </li>
            ) : (
              filtered.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <li
                    key={option.value || "__empty__"}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectOption(option);
                    }}
                    className={cn(
                      "rounded-ctl flex cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-[13px]",
                      isActive && "bg-wash",
                      isSelected && "font-semibold",
                      option.disabled && "text-ink-3 cursor-not-allowed opacity-60",
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected ? (
                      <Check className="size-3.5 shrink-0" aria-hidden="true" />
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
