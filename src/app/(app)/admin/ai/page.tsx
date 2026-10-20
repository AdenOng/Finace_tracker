import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { AiTabs } from "~/components/admin/admin-tabs";
import { AiProvidersAdmin } from "~/components/admin/ai-providers-admin";
import { PageHeader, Section } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "AI providers" };

export default async function AdminAiPage() {
  await requireAdminSession();
  void api.admin.ai.list.prefetch();
  void api.admin.ai.healthChecks.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title="AI providers"
        description="Models that read statements into structured data. Imports use the default, and the fallback if the default fails."
      />
      <AiTabs />
      <Section title="Providers">
        <AiProvidersAdmin />
      </Section>
    </HydrateClient>
  );
}
