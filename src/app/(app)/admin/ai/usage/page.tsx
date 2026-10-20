import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { AiTabs } from "~/components/admin/admin-tabs";
import { AiUsage } from "~/components/admin/ai-usage";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "AI usage" };

export default async function AdminAiUsagePage() {
  await requireAdminSession();
  void api.admin.ai.usage.prefetch({ days: 30 });
  return (
    <HydrateClient>
      <PageHeader
        title="AI providers"
        description="Tokens used by statement imports, estimated cost and monthly limits."
      />
      <AiTabs />
      <AiUsage />
    </HydrateClient>
  );
}
