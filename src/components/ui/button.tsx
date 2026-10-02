import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "~/lib/cn";

const variants = {
  primary:
    "bg-forest text-white border border-forest hover:bg-forest-2 hover:border-forest-2 active:bg-forest-3",
  secondary:
    "bg-canvas text-ink border border-ink hover:bg-wash active:bg-mint-soft",
  ghost: "bg-transparent text-ink border border-transparent hover:bg-wash",
  danger:
    "bg-canvas text-loss border border-loss hover:bg-loss-wash active:bg-loss active:text-white",
  inverse:
    "bg-mint text-forest-3 border border-mint hover:bg-mint-soft hover:border-mint-soft",
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
          "rounded-ctl relative inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-colors duration-100 select-none disabled:cursor-not-allowed disabled:opacity-45",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <span className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
            <span className="animate-slide bg-mint block h-full w-1/3" />
          </span>
        ) : null}
        {children}
      </button>
    );
  },
);
