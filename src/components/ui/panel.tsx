import type { ReactNode } from "react";

import { cn } from "~/lib/cn";

/** Page title block: expanded headline over a heavy rule, optional actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="border-line mb-8 flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div className="max-w-2xl">
        <h1 className="font-wide text-[28px] leading-tight font-bold sm:text-[34px]">
          {title}
        </h1>
        {description ? (
          <p className="text-ink-2 mt-2 text-[15px]">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

/** Content section with a ruled heading. No card chrome — the rule does the separating. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("ruled", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {description ? (
            <p className="text-ink-2 mt-0.5 text-sm">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "error" | "warn" | "success";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-forest bg-wash text-ink",
    error: "border-loss bg-loss-wash text-ink",
    warn: "border-warn bg-warn-wash text-ink",
    success: "border-gain bg-wash text-ink",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("border-l-4 px-4 py-3 text-sm", tones[tone], className)}
    >
      {children}
    </div>
  );
}

export function Tag({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "forest" | "mint" | "loss" | "warn" | "outline";
  className?: string;
}) {
  const tones = {
    neutral: "bg-wash text-ink-2",
    forest: "bg-forest text-white",
    mint: "bg-mint-soft text-forest-3",
    loss: "bg-loss-wash text-loss",
    warn: "bg-warn-wash text-warn",
    outline: "border border-line text-ink-2",
  };
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center px-1.5 text-[11px] font-semibold tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="border-ink-3 border border-dashed px-6 py-10">
      <p className="font-wide text-lg font-bold">{title}</p>
      {children ? (
        <div className="text-ink-2 mt-1 max-w-lg text-sm">{children}</div>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
