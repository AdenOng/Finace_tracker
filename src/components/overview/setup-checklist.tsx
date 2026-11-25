import { Check, Minus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { CommonMessages } from "~/i18n/messages";
import { cn } from "~/lib/cn";

const link =
  "font-semibold underline decoration-current/30 underline-offset-4 hover:decoration-current";

function ChecklistItem({
  done,
  children,
}: {
  done: boolean;
  children: ReactNode;
}) {
  // Only what is left to do is listed; the count shows the progress.
  if (done) return null;
  return (
    <li className="flex items-center gap-2.5 text-[13px]">
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full",
          done
            ? "bg-brand text-on-brand"
            : "border-line-2 text-ink-3 border border-dashed",
        )}
      >
        {done ? (
          <Check className="size-3" strokeWidth={3.5} />
        ) : (
          <Minus className="size-3" />
        )}
      </span>
      <span className={done ? "text-ink-3 line-through" : undefined}>
        {children}
      </span>
    </li>
  );
}

export function SetupChecklist({
  t,
  twoFactorEnabled,
  admin,
  hasDefaultProvider,
  hasInvestments,
  hasBanking,
}: {
  t: CommonMessages;
  twoFactorEnabled: boolean;
  admin: boolean;
  hasDefaultProvider: boolean;
  hasInvestments: boolean;
  hasBanking: boolean;
}) {
  const checklist = [
    { done: twoFactorEnabled, key: "2fa" },
    ...(admin ? [{ done: hasDefaultProvider, key: "ai" }] : []),
    { done: hasInvestments, key: "invest" },
    { done: hasBanking, key: "bank" },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  if (doneCount >= checklist.length) return null;

  return (
    <section className="card mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4 sm:px-10">
      <p className="eyebrow">
        {t.overview.page.setup(doneCount, checklist.length)}
      </p>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        <ChecklistItem done={twoFactorEnabled}>
          <Link href="/settings" className={link}>
            {t.overview.page.twostepSignin}
          </Link>
        </ChecklistItem>
        {admin ? (
          <ChecklistItem done={hasDefaultProvider}>
            <Link href="/admin/ai" className={link}>
              {t.overview.page.defaultAIProvider}
            </Link>
          </ChecklistItem>
        ) : null}
        <ChecklistItem done={hasInvestments}>
          <Link href="/accounts?add=investments" className={link}>
            {t.overview.page.anInvestmentAccount}
          </Link>
        </ChecklistItem>
        <ChecklistItem done={hasBanking}>
          <Link href="/accounts?add=banking" className={link}>
            {t.overview.page.aBankAccountOrCard}
          </Link>
        </ChecklistItem>
      </ul>
    </section>
  );
}
