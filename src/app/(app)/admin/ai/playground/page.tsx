import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { AiTabs } from "~/components/admin/admin-tabs";
import { ExtractionPlayground } from "~/components/admin/extraction-playground";
import { PageHeader, Section } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.admin.playgroundPage.extractionPlayground };
}

export default async function AdminAiPlaygroundPage() {
  const t = await getT();
  await requireAdminSession();
  void api.admin.ai.list.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title={t.admin.playgroundPage.aiProviders}
        description={
          t.admin.playgroundPage
            .runADocumentThroughOneOrMoreProvidersAndCompareWhatComesBackNothingIsSaved
        }
      />
      <AiTabs />
      <Section
        title={t.admin.playgroundPage.extractionPlayground}
        description={
          t.admin.playgroundPage
            .pickSeveralProvidersToCompareThemSideBySideBeforeSwitchingTheDefault
        }
      >
        <ExtractionPlayground />
      </Section>
    </HydrateClient>
  );
}
