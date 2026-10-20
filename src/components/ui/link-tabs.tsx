"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "~/lib/cn";

/** Same look as FilterTabs, but each tab is its own page. */
export function LinkTabs({
  tabs,
  label,
  className,
}: {
  tabs: { href: string; label: string; count?: number }[];
  label: string;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className={cn(
        "bg-sunken border-line mb-8 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border p-1",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-surface-2 text-ink shadow-[inset_0_0_0_1px_var(--color-line-2)]"
                : "text-ink-3 hover:text-ink",
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className="figures text-ink-3 text-[12px] font-medium">
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
