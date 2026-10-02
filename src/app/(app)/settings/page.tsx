import type { Metadata } from "next";
import { Suspense } from "react";

import { CurrencySelect } from "~/components/settings/currency-select";
import { PasskeysCard } from "~/components/settings/passkeys-card";
import { TwoFactorCard } from "~/components/settings/two-factor-card";
import { Notice, PageHeader, Section } from "~/components/ui/panel";
import { needsTwoFactorEnrollment, requireSession } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; enroll?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const mustEnrol = needsTwoFactorEnrollment(session.user);
  void api.catalog.currencies.prefetch();
  void api.settings.get.prefetch();

  return (
    <HydrateClient>
      <PageHeader
        title="Settings"
        description="Your preferences and how you sign in."
      />

      {mustEnrol ? (
        <Notice tone="warn" className="mb-10">
          {params.welcome ? "Welcome aboard. " : ""}This instance requires
          two-step sign-in. Set up an authenticator app below to unlock the rest
          of the app.
        </Notice>
      ) : null}

      <div className="space-y-14">
        <Section
          title="Display currency"
          description="Totals and charts are converted into this currency. Each record keeps its original currency."
        >
          <Suspense fallback={<div className="bg-wash h-10 w-64" />}>
            <CurrencySelect className="w-72" />
          </Suspense>
        </Section>

        <Section
          title="Two-step sign-in"
          description="A time-based code from an authenticator app, asked for after your password."
        >
          <TwoFactorCard enabled={!!session.user.twoFactorEnabled} />
        </Section>

        <Section
          title="Passkeys"
          description="Sign in without a password using your device's biometrics or security key."
        >
          <PasskeysCard />
        </Section>
      </div>
    </HydrateClient>
  );
}
