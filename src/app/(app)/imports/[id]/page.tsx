import { getT } from "~/i18n/server";
import { TRPCError } from "@trpc/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ImportReview } from "~/components/imports/import-review";
import { requireEnrolledSession } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.imports.reviewPage.reviewImport };
}

export default async function ImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireEnrolledSession();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const job = await api.imports.get({ id }).catch((error: unknown) => {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  void api.catalog.categories.prefetch();
  return (
    <HydrateClient>
      <ImportReview id={id} initialJob={job} />
    </HydrateClient>
  );
}
