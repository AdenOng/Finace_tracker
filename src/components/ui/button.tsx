import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "~/lib/cn";

const variants = {
  primary:
    "bg-brand text-on-brand border border-brand shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] hover:bg-brand-2 hover:border-brand-2 active:bg-brand-3",
  secondary:
    "bg-surface-2 text-ink border border-line-2 hover:bg-wash hover:border-ink-3 active:bg-brand-soft",
  ghost: "bg-transparent text-ink border border-transparent hover:bg-wash",
  danger:
    "bg-transparent text-loss border border-loss/50 hover:bg-loss-wash active:bg-loss active:text-white",
  inverse:
    "bg-ink text-canvas border border-ink hover:bg-ink-2 hover:border-ink-2",
} as const;

const sizes = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-[15px] gap-2",
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      size = "md",
      loading,
      disabled,
      children,
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled ?? loading}
        className={cn(
          "rounded-ctl relative inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold whitespace-nowrap transition-colors duration-100 select-none disabled:cursor-not-allowed disabled:opacity-45",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <span className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
            <span className="animate-slide block h-full w-1/3 bg-current opacity-60" />
          </span>
        ) : null}
        {children}
      </button>
    );
  },
);
