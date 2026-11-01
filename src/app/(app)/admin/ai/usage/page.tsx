import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { AiTabs } from "~/components/admin/admin-tabs";
import { AiUsage } from "~/components/admin/ai-usage";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.admin.usagePage.aiUsage };
}

export default async function AdminAiUsagePage() {
  const t = await getT();
  await requireAdminSession();
  void api.admin.ai.usage.prefetch({ days: 30 });
  return (
    <HydrateClient>
      <PageHeader
        title={t.admin.usagePage.aiProviders}
        description={
          t.admin.usagePage
            .tokensUsedByStatementImportsEstimatedCostAndMonthlyLimits
        }
      />
      <AiTabs />
      <AiUsage />
    </HydrateClient>
  );
}
