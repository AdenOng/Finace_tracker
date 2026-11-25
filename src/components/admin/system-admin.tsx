"use client";

import { useT, useLocale } from "~/i18n/client";

import { CircleAlert, CircleCheck } from "lucide-react";

import { Button } from "~/components/ui/button";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Section } from "~/components/ui/panel";
import { useFlash } from "~/components/ui/use-flash";
import { cn } from "~/lib/cn";
import { formatBytes, formatDateTime, formatRelative } from "~/lib/format";
import { api } from "~/trpc/react";

const integer = new Intl.NumberFormat("en-SG");

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-3">{label}</dt>
          <dd className="min-w-0 font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CircleCheck : CircleAlert;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className={cn("size-4", ok ? "text-gain" : "text-warn")} />
      {children}
    </span>
  );
}

export function SystemAdmin() {
  const locale = useLocale();
  const t = useT();
  const [info] = api.admin.system.info.useSuspenseQuery();
  const { flash, success, error, clear } = useFlash(10_000);
  const testEmail = api.admin.system.testEmail.useMutation({
    onMutate: clear,
    onSuccess: (r) => success(t.adminManage.system.testEmailSent(r.to)),
    onError: error,
  });
  const { migrations } = info.database;
  const migrationsOk =
    migrations.applied !== null && migrations.applied >= migrations.expected;

  return (
    <div className="space-y-6">
      <Section title={t.adminManage.system.app}>
        <Rows
          rows={[
            [t.adminManage.system.version, info.app.version],
            [
              t.adminManage.system.runningSince,
              `${formatRelative(info.app.startedAt, undefined, locale)} (${formatDateTime(info.app.startedAt, locale)})`,
            ],
            [
              t.adminManage.system.node,
              `${info.app.node} · ${info.app.platform}`,
            ],
            [t.adminManage.system.mode, info.app.environment],
            [t.adminManage.system.publicUrl, info.config.baseUrl],
          ]}
        />
      </Section>

      <Section title={t.adminManage.system.database}>
        <Rows
          rows={[
            [t.adminManage.system.postgresql, info.database.version],
            [t.adminManage.system.size, formatBytes(info.database.sizeBytes)],
            [
              t.adminManage.system.migrations,
              <Check key="m" ok={migrationsOk}>
                {migrations.applied === null
                  ? t.adminManage.system.migrationsUnavailable
                  : t.adminManage.system.migrationsApplied(
                      migrations.applied,
                      migrations.expected,
                    )}
                {migrations.latestTag ? (
                  <span className="text-ink-3 font-normal">
                    {" "}
                    {t.adminManage.system.latestMigration(migrations.latestTag)}
                  </span>
                ) : null}
              </Check>,
            ],
            [
              t.adminManage.system.rows,
              [
                t.adminManage.system.userCount(
                  integer.format(info.database.counts.users),
                ),
                t.adminManage.system.accountCount(
                  integer.format(info.database.counts.accounts),
                ),
                t.adminManage.system.transactionCount(
                  integer.format(info.database.counts.transactions),
                ),
                t.adminManage.system.uploadCount(
                  integer.format(info.database.counts.documents),
                ),
              ].join(" · "),
            ],
          ]}
        />
      </Section>

      <Section title={t.adminManage.system.storage}>
        <Rows
          rows={[
            [
              t.adminManage.system.uploadedStatements,
              t.adminManage.system.storageSummary(
                formatBytes(info.storage.uploads.bytes),
                `${integer.format(info.storage.uploads.files)}${info.storage.uploads.truncated ? "+" : ""}`,
                info.storage.uploads.directory,
              ),
            ],
            [
              t.adminManage.system.backups,
              t.adminManage.system.storageSummary(
                formatBytes(info.storage.backups.bytes),
                integer.format(info.storage.backups.files),
                info.storage.backups.directory,
              ),
            ],
          ]}
        />
      </Section>

      <Section
        title={t.adminManage.system.configuration}
        description={t.adminManage.system.configurationPrivacyHelp}
      >
        <Rows
          rows={[
            [t.adminManage.system.dataPack, info.config.preset],
            [
              t.adminManage.system.environmentTwoStep,
              info.config.requireTwoFactor
                ? t.adminManage.system.environmentTwoStepEnabled
                : t.adminManage.system.environmentTwoStepDisabled,
            ],
            [
              t.adminManage.system.encryptionKey,
              <Check key="k" ok={info.config.encryptionKeySet}>
                {info.config.encryptionKeySet
                  ? t.adminManage.system.set
                  : t.adminManage.system.missing}
              </Check>,
            ],
            [
              t.adminManage.system.opencodeServer,
              <span key="o">
                {info.config.opencodeUrl}
                <span className="text-ink-3 font-normal">
                  {" "}
                  {t.adminManage.system.passwordStatus(
                    info.config.opencodePasswordSet,
                  )}
                </span>
              </span>,
            ],
          ]}
        />
      </Section>

      <Section
        title={t.common.fields.email}
        description={t.adminManage.system.emailHelp}
        actions={
          info.config.email.configured ? (
            <Button
              variant="secondary"
              size="sm"
              loading={testEmail.isPending}
              onClick={() => testEmail.mutate()}
            >
              {t.adminManage.system.sendMeATestEmail}
            </Button>
          ) : null
        }
      >
        <FlashNotice flash={flash} onDismiss={clear} className="mb-3" />
        <Check ok={info.config.email.configured}>
          <span className="text-sm">
            {info.config.email.configured
              ? t.adminManage.system.sendingThrough(info.config.email.host)
              : t.adminManage.system.emailNotConfigured}
          </span>
        </Check>
      </Section>
    </div>
  );
}
