import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { AmountsToggle } from "~/components/finance/privacy";
import { cardTools } from "~/components/ui/card-tools";

/** Top of a dashboard sheet: eyebrow, a link out and the headline figure over a rule. */
export function SheetHeader({
  eyebrow,
  title,
  href,
  linkLabel,
  settings,
}: {
  eyebrow: string;
  title: React.ReactNode;
  href: string;
  linkLabel: string;
  settings?: React.ReactNode;
}) {
  return (
    <div className="border-ink/80 border-b-2 pb-3">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">{eyebrow}</p>
        <div className={cardTools}>
          <Link
            href={href}
            className="text-ink-2 hover:text-ink mr-2.5 inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold"
          >
            {linkLabel}
            <ArrowUpRight className="size-3.5" />
          </Link>
          <AmountsToggle />
          {settings}
        </div>
      </div>
      <p className="font-poster figures mt-1.5 text-[clamp(26px,7vw,34px)] leading-none font-extrabold">
        <span className="sensitive">{title}</span>
      </p>
    </div>
  );
}
