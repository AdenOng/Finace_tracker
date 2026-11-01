import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";

import { CurrencySelect } from "~/components/settings/currency-select";
import { HideAmounts } from "~/components/settings/hide-amounts";
import { LanguageSwitch } from "~/components/shell/language-switch";
import { PasskeysCard } from "~/components/settings/passkeys-card";
import { PasswordCard } from "~/components/settings/password-card";
import { ProfileCard } from "~/components/settings/profile-card";
import { SessionsCard } from "~/components/settings/sessions-card";
import { TwoFactorCard } from "~/components/settings/two-factor-card";
import { Notice, PageHeader, Section } from "~/components/ui/panel";
import { getT } from "~/i18n/server";
import { needsTwoFactorEnrollment, requireSession } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.settings.page.settings };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; enroll?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const mustEnrol = needsTwoFactorEnrollment(session.user);
  const t = await getT();
  void api.catalog.currencies.prefetch();
  void api.settings.get.prefetch();

  return (
    <HydrateClient>
      <PageHeader
        title={t.settings.page.settings}
        description={t.settings.page.yourPreferencesAndHowYou}
      />

      {mustEnrol ? (
        <Notice tone="warn" className="mb-10">
          {t.settings.page.enrolment(!!params.welcome)}
        </Notice>
      ) : null}

      <div className="space-y-14">
        {!mustEnrol ? (
          <Section
            title={t.settings.page.profile}
            description={t.settings.page.howYouAppearToOthers}
          >
            <ProfileCard name={session.user.name} email={session.user.email} />
          </Section>
        ) : null}
        {!mustEnrol ? (
          <Section
            title={t.settings.page.sharedWorkspaces}
            description={t.settings.page.createAFamilyOrFund}
          >
            <Link
              className="font-semibold underline underline-offset-4"
              href="/workspaces"
            >
              {t.settings.page.manageWorkspaces}
            </Link>
          </Section>
        ) : null}
        <Section
          title={t.common.language.label}
          description={t.common.language.description}
        >
          <LanguageSwitch />
        </Section>

        <Section
          title={t.settings.page.displayCurrency}
          description={t.settings.page.totalsAndChartsAreConverted}
        >
          <Suspense fallback={<div className="bg-wash h-10 w-64" />}>
            <CurrencySelect className="w-72" />
          </Suspense>
        </Section>

        {!mustEnrol ? (
          <Section
            title={t.settings.page.privacy}
            description={t.settings.page.keepYourNumbersOffScreen}
          >
            <HideAmounts />
          </Section>
        ) : null}

        <Section
          title={t.settings.page.twostepSignin}
          description={t.settings.page.aTimebasedCodeFromAn}
        >
          <TwoFactorCard enabled={!!session.user.twoFactorEnabled} />
        </Section>

        {!mustEnrol ? (
          <Section
            title={t.settings.page.password}
            description={t.settings.page.changeThePasswordYouSign}
          >
            <PasswordCard />
          </Section>
        ) : null}

        <Section
          title={t.settings.page.passkeys}
          description={t.settings.page.signInWithoutAPassword}
        >
          <PasskeysCard />
        </Section>

        {!mustEnrol ? (
          <Section
            title={t.settings.page.signedinDevices}
            description={t.settings.page.whereYourAccountIsSigned}
          >
            <SessionsCard />
          </Section>
        ) : null}
      </div>
    </HydrateClient>
  );
}
