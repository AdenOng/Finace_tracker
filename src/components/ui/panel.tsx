import type { ReactNode } from "react";

import { cn } from "~/lib/cn";

/** Page title block: serif headline, optional actions on the right. */
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
    <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="font-display text-[34px] leading-[1.05] font-semibold sm:text-[44px]">
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

/** Content section on a raised card surface. */
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
  children?: ReactNode;
  className?: string;
}) {
  const hasBody = children !== undefined && children !== null;
  return (
    <section className={cn("card min-w-0 p-5 sm:p-6", className)}>
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-3",
          hasBody && "mb-5",
        )}
      >
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="text-ink-2 mt-0.5 text-sm">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
            {actions}
          </div>
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
    info: "border-line-2 bg-wash text-ink",
    error: "border-loss/40 bg-loss-wash text-ink",
    warn: "border-warn/40 bg-warn-wash text-ink",
    success: "border-gain/40 bg-gain/10 text-ink",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-ctl border px-4 py-3 text-sm",
        tones[tone],
        className,
      )}
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
  tone?: "neutral" | "brand" | "soft" | "loss" | "warn" | "outline";
  className?: string;
}) {
  const tones = {
    neutral: "bg-wash text-ink-2",
    brand: "bg-brand text-on-brand",
    soft: "bg-brand-soft text-brand-2",
    loss: "bg-loss-wash text-loss",
    warn: "bg-warn-wash text-warn",
    outline: "border border-line-2 text-ink-2",
  };
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold tracking-wide",
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
    <div className="border-line-2 rounded-card border border-dashed px-6 py-10">
      <p className="font-display text-2xl font-semibold">{title}</p>
      {children ? (
        <div className="text-ink-2 mt-1 max-w-lg text-sm">{children}</div>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
