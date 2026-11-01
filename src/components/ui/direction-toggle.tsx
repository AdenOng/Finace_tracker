"use client";

import { useId } from "react";

import { cn } from "~/lib/cn";

export type Direction = "out" | "in";

/** Money out / Money in switch. Amounts are typed positive; this sets the sign. */
export function DirectionToggle({
  value,
  onChange,
  label,
  outLabel,
  inLabel,
  disabled,
}: {
  value: Direction;
  onChange: (value: Direction) => void;
  label: string;
  outLabel: string;
  inLabel: string;
  disabled?: boolean;
}) {
  const groupName = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="border-line grid grid-cols-2 border"
    >
      {(
        [
          ["out", outLabel],
          ["in", inLabel],
        ] as const
      ).map(([option, text]) => (
        <label
          key={option}
          className={cn(
            "has-[:focus-visible]:outline-brand flex h-10 cursor-pointer items-center justify-center text-sm font-semibold transition-colors has-[:disabled]:cursor-not-allowed has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
            value === option
              ? "bg-brand text-on-brand"
              : "text-ink-2 hover:bg-wash",
          )}
        >
          <input
            type="radio"
            name={groupName}
            value={option}
            checked={value === option}
            disabled={disabled}
            onChange={() => onChange(option)}
            className="sr-only"
          />
          {text}
        </label>
      ))}
    </div>
  );
}

/** Applies a direction to a positive amount typed by the user. */
export function signedAmount(direction: Direction, magnitude: string) {
  return direction === "out" ? `-${magnitude}` : magnitude;
}
