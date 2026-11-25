import type { Metadata } from "next";
import { z } from "zod";

import { SpendingView } from "~/components/spending/spending-view";
import { getT } from "~/i18n/server";
import { currentMonth } from "~/lib/dates";
import { requireEnrolledSession } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.spending.meta.spending };
}

const monthParam = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<{
    account?: string;
    category?: string;
    uncategorised?: string;
    month?: string;
    q?: string;
  }>;
}) {
  await requireEnrolledSession();
  const { account, category, uncategorised, month, q } = await searchParams;
  const parsedMonth = monthParam.safeParse(month);
  void api.accounts.list.prefetch();
  void api.catalog.categories.prefetch();
  void api.catalog.currencies.prefetch();
  return (
    <HydrateClient>
      <SpendingView
        initialMonth={parsedMonth.success ? parsedMonth.data : currentMonth()}
        hasExplicitMonth={parsedMonth.success}
        initialAccountId={
          z.uuid().safeParse(account).success ? account! : null
        }
        initialCategoryId={
          z.uuid().safeParse(category).success ? category! : null
        }
        initialUncategorised={uncategorised === "1"}
        initialSearch={typeof q === "string" ? q.slice(0, 100) : ""}
      />
    </HydrateClient>
  );
}
