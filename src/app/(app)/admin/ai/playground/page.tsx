import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { AiTabs } from "~/components/admin/admin-tabs";
import { ExtractionPlayground } from "~/components/admin/extraction-playground";
import { PageHeader, Section } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Extraction playground" };

export default async function AdminAiPlaygroundPage() {
  await requireAdminSession();
  void api.admin.ai.list.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title="AI providers"
        description="Run a document through one or more providers and compare what comes back. Nothing is saved."
      />
      <AiTabs />
      <Section
        title="Extraction playground"
        description="Pick several providers to compare them side by side before switching the default."
      >
        <ExtractionPlayground />
      </Section>
    </HydrateClient>
  );
}
