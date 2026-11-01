import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { AiTabs } from "~/components/admin/admin-tabs";
import { AiProvidersAdmin } from "~/components/admin/ai-providers-admin";
import { PageHeader, Section } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.admin.providersPage.aiProviders };
}

export default async function AdminAiPage() {
  const t = await getT();
  await requireAdminSession();
  void api.admin.ai.list.prefetch();
  void api.admin.ai.healthChecks.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title={t.admin.providersPage.aiProviders}
        description={
          t.admin.providersPage
            .modelsThatReadStatementsIntoStructuredDataImportsUseTheDefaultAndTheFallbackIfTheDefaultFails
        }
      />
      <AiTabs />
      <Section title={t.admin.providersPage.providers}>
        <AiProvidersAdmin />
      </Section>
    </HydrateClient>
  );
}
