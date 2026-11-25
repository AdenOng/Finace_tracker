"use client";

import { useT, useLocale } from "~/i18n/client";
import { CircleAlert, CircleCheck, Download } from "lucide-react";
import { Button } from "~/components/ui/button";
import { FlashNotice } from "~/components/ui/flash-notice";
import { EmptyState, Section } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { useFlash } from "~/components/ui/use-flash";
import { cn } from "~/lib/cn";
import { formatBytes, formatDateTime, formatRelative } from "~/lib/format";
import { api } from "~/trpc/react";

function StatusLine({
  ok,
  children,
}: {
  ok: boolean | null;
  children: React.ReactNode;
}) {
  const Icon = ok ? CircleCheck : CircleAlert;
  return (
    <p
      className={cn(
        "flex items-start gap-2 text-sm",
        ok === null ? "text-ink-2" : ok ? "text-gain" : "text-warn",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span className="text-ink">{children}</span>
    </p>
  );
}

export function BackupsAdmin() {
  const locale = useLocale();
  const t = useT();
  const utils = api.useUtils();
  const [data] = api.admin.data.backups.useSuspenseQuery(undefined, {
    // While a backup is requested or running, check back until it finishes.
    refetchInterval: (q) =>
      q.state.data?.service.requestedAt || q.state.data?.service.inProgressSince
        ? 10_000
        : false,
  });
  const { flash, success, error, clear } = useFlash(10_000);
  const request = api.admin.data.requestBackup.useMutation({
    onMutate: clear,
    onSuccess: async () => {
      success(
        data.service.running
          ? t.adminManage.data.backupRequested
          : t.adminManage.data.backupServiceUnavailable,
      );
      await utils.admin.data.backups.invalidate();
    },
    onError: error,
  });
  const { service } = data;
  const latest = data.backups[0];

  return (
    <div className="space-y-6">
      <Section
        title={t.adminManage.data.backupService}
        description={t.adminManage.data.backupSchedule(
          service.directory,
          service.retentionDays,
        )}
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={request.isPending}
            disabled={!!service.requestedAt || !!service.inProgressSince}
            onClick={() => request.mutate()}
          >
            {service.inProgressSince
              ? t.adminManage.data.backingUp
              : service.requestedAt
                ? t.adminManage.data.backupPending
                : t.adminManage.data.backUpNow}
          </Button>
        }
      >
        <div className="space-y-2">
          <FlashNotice flash={flash} onDismiss={clear} className="mb-3" />
          <StatusLine ok={service.running}>
            {service.running
              ? t.adminManage.data.serviceHeartbeat(
                  formatRelative(service.heartbeat!, undefined, locale),
                )
              : service.heartbeat
                ? t.adminManage.data.serviceLastSeen(
                    formatRelative(service.heartbeat, undefined, locale),
                  )
                : t.adminManage.data.startBackupServiceHelp}
          </StatusLine>
          {service.inProgressSince ? (
            <StatusLine ok={null}>
              {t.adminManage.data.backupInProgress(
                formatRelative(service.inProgressSince, undefined, locale),
              )}
            </StatusLine>
          ) : null}
          {service.lastRun ? (
            <StatusLine ok={service.lastRun.ok}>
              {t.adminManage.data.lastBackup(
                service.lastRun.ok,
                service.lastRun.at
                  ? ` ${formatRelative(service.lastRun.at, undefined, locale)} (${formatDateTime(service.lastRun.at, locale)})`
                  : "",
              )}
            </StatusLine>
          ) : null}
          {service.lastRun?.error ? (
            <pre className="bg-sunken border-line rounded-ctl overflow-x-auto border p-3 text-[12px] whitespace-pre-wrap">
              {service.lastRun.error}
            </pre>
          ) : null}
          {latest ? (
            <StatusLine
              ok={Date.now() - latest.createdAt.getTime() < 2 * 86_400_000}
            >
              {t.adminManage.data.newestDump(
                formatRelative(latest.createdAt, undefined, locale),
              )}
            </StatusLine>
          ) : null}
        </div>
      </Section>

      <Section
        title={t.adminManage.data.dumps}
        description={t.adminManage.data.backupPrivacyHelp}
      >
        {!data.available ? (
          <EmptyState title={t.adminManage.data.backupFolderNotFound}>
            {t.adminManage.data.missingMount(service.directory)}
          </EmptyState>
        ) : data.backups.length === 0 ? (
          <EmptyState title={t.adminManage.data.noBackupsYet}>
            {t.adminManage.data.firstBackupHelp}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t.adminManage.data.made}</Th>
                <Th>{t.adminManage.data.file}</Th>
                <Th className="text-right">{t.adminManage.data.size}</Th>
                <Th className="text-right">
                  <span className="sr-only">{t.common.actions.download}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {data.backups.map((b) => (
                <Tr key={b.name}>
                  <Td
                    className="whitespace-nowrap"
                    title={formatDateTime(b.createdAt, locale)}
                  >
                    {formatRelative(b.createdAt, undefined, locale)}
                  </Td>
                  <Td className="text-ink-2 font-mono text-[12px]">{b.name}</Td>
                  <Td className="figures text-right">
                    {formatBytes(b.sizeBytes)}
                  </Td>
                  <Td className="text-right">
                    <a
                      href={`/api/admin/backups/${b.name}`}
                      className="text-brand inline-flex items-center gap-1 text-[13px] font-semibold underline-offset-4 hover:underline"
                    >
                      <Download className="size-3.5" />
                      {t.common.actions.download}
                    </a>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <details className="mt-5 text-sm">
          <summary className="text-ink-2 cursor-pointer font-semibold">
            {t.adminManage.data.howToRestore}
          </summary>
          <div className="text-ink-2 mt-2 space-y-2">
            <p>{t.adminManage.data.restoreHelp}</p>
            <pre className="bg-sunken border-line rounded-ctl overflow-x-auto border p-3 text-[12px]">
              {`docker compose stop app
docker compose exec -T db pg_restore --clean --if-exists \\
  -U finfolio -d finfolio < backups/finfolio-YYYYMMDD-HHMMSS.dump
docker compose start app`}
            </pre>
            <p>{t.adminManage.data.encryptionKeyHelp}</p>
          </div>
        </details>
      </Section>
    </div>
  );
}
