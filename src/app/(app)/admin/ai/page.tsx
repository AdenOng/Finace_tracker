import type { Metadata } from "next";

import { AiProvidersAdmin } from "~/components/admin/ai-providers-admin";
import { ExtractionPlayground } from "~/components/admin/extraction-playground";
import { PageHeader, Section } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "AI providers" };

export default async function AdminAiPage() {
  void api.admin.ai.list.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title="AI providers"
        description="Models that read statements into structured data. The default provider is used for every import."
      />
      <div className="space-y-14">
        <Section title="Providers">
          <AiProvidersAdmin />
        </Section>
        <Section
          title="Extraction playground"
          description="Run a document through a provider and inspect what comes back. Use it to compare models before switching the default."
        >
          <ExtractionPlayground />
        </Section>
      </div>
    </HydrateClient>
  );
}
