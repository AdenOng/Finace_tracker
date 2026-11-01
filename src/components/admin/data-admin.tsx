"use client";

import { useT, useLocale } from "~/i18n/client";

import {
  CircleAlert,
  CircleCheck,
  Download,
  RefreshCw,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Checkbox, Field, Input, Select } from "~/components/ui/field";
import { EmptyState, Notice, Section, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { useFlash } from "~/components/ui/use-flash";
import { cn } from "~/lib/cn";
import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatRelative,
} from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

const integer = new Intl.NumberFormat("en-SG");

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
          <FlashNotice flash={flash} className="mb-3" />
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

export function MarketAdmin() {
  const locale = useLocale();
  const t = useT();
  const utils = api.useUtils();
  const [market] = api.admin.data.market.useSuspenseQuery();
  const { flash, success, error, clear } = useFlash(10_000);
  const refresh = api.admin.data.refreshRates.useMutation({
    onMutate: clear,
    onSuccess: async (r) => {
      if (r.failed.length)
        error(t.adminManage.data.ratesFetchFailed(r.failed.join(", ")));
      else
        success(
          r.stored
            ? t.adminManage.data.ratesStored(r.stored, r.currencies.join(", "))
            : t.adminManage.data.ratesCurrent(r.currencies.join(", ")),
        );
      await Promise.all([
        utils.admin.data.market.invalidate(),
        utils.admin.overview.attention.invalidate(),
      ]);
    },
    onError: error,
  });
  const prices = useFlash(15_000);
  const refreshPrices = api.admin.data.refreshPrices.useMutation({
    onMutate: prices.clear,
    onSuccess: async (r) => {
      const problems = [
        r.failed.length &&
          t.adminManage.data.noPriceFoundFor(r.failed.join(", ")),
        r.mismatched.length &&
          t.adminManage.data.quoteCurrencyMismatch(r.mismatched.join(", ")),
      ].filter(Boolean);
      const updated = t.adminManage.data.pricesUpdated(r.updated, r.checked);
      if (problems.length)
        prices.error(t.adminManage.data.skipped(updated, problems.join("; ")));
      else prices.success(updated);
      await utils.admin.data.market.invalidate();
    },
    onError: prices.error,
  });
  const setPriceQuotes = api.admin.data.setPriceQuotes.useMutation({
    onSuccess: () => utils.admin.data.market.invalidate(),
    onError: prices.error,
  });
  const today = new Date().toISOString().slice(0, 10);
  const staleBefore = new Date(Date.now() - 4 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <Section
        title={t.adminManage.data.exchangeRates}
        description={t.adminManage.data.referenceRatesHelp(market.fxSource)}
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            <RefreshCw className="size-3.5" />
            {t.adminManage.data.refreshNow}
          </Button>
        }
      >
        <FlashNotice flash={flash} className="mb-4" />
        {market.fx.length === 0 ? (
          <p className="text-ink-3 text-sm">
            {t.adminManage.data.noDisplayCurrenciesYet}
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t.adminManage.data.displayCurrency}</Th>
                <Th>{t.adminManage.data.latestRate}</Th>
                <Th className="text-right">{t.adminManage.data.storedRates}</Th>
              </tr>
            </thead>
            <tbody>
              {market.fx.map((f) => (
                <Tr key={f.currency}>
                  <Td className="font-semibold">{f.currency}</Td>
                  <Td>
                    {f.latest ? (
                      <span
                        className={cn(
                          f.latest < staleBefore && "text-warn font-semibold",
                        )}
                      >
                        {f.latest === today
                          ? t.adminManage.data.today
                          : formatDate(f.latest, locale)}
                      </span>
                    ) : (
                      <Tag tone="warn">{t.adminManage.data.noneStored}</Tag>
                    )}
                  </Td>
                  <Td className="figures text-right">
                    {integer.format(f.pairs)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="text-ink-3 mt-3 text-[13px]">
          {t.adminManage.data.currenciesInUse(
            market.accountCurrencies.join(", "),
          )}
        </p>
      </Section>

      <Section
        title={t.adminManage.data.securityPrices}
        description={t.adminManage.data.marketPricesHelp}
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={refreshPrices.isPending}
            disabled={!market.priceQuotes}
            onClick={() => refreshPrices.mutate()}
          >
            <RefreshCw className="size-3.5" />
            {t.adminManage.data.refreshNow}
          </Button>
        }
      >
        <Checkbox
          className="mb-5"
          label={t.adminManage.data.fetchMarketPrices}
          description={t.adminManage.data.marketPrivacyHelp}
          checked={market.priceQuotes}
          disabled={setPriceQuotes.isPending}
          onChange={(e) => setPriceQuotes.mutate({ enabled: e.target.checked })}
        />
        <FlashNotice flash={prices.flash} className="mb-4" />
        <dl className="mb-5 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {[
            [
              t.adminManage.data.securities,
              integer.format(market.quotes.securities),
            ],
            [
              t.adminManage.data.withAQuote,
              integer.format(market.quotes.quoted),
            ],
            [
              t.adminManage.data.newestQuote,
              market.quotes.newest
                ? formatRelative(market.quotes.newest, undefined, locale)
                : "—",
            ],
            [
              t.adminManage.data.dailyClosesUpTo,
              market.priceHistoryLatest
                ? formatDate(market.priceHistoryLatest, locale)
                : "—",
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-ink-2 text-[13px] font-semibold">{label}</dt>
              {/* "Newest quote" is relative to now, which moves between render and hydration. */}
              <dd
                className="figures font-display text-xl font-semibold"
                suppressHydrationWarning
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {market.unquoted.length ? (
          <>
            <h3 className="mb-2 text-sm font-semibold">
              {t.adminManage.data.statementValuations(market.unquoted.length)}
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {market.unquoted.map((s) => (
                <li key={s.id}>
                  <Tag tone="outline" className="h-6 px-2.5 text-[12px]">
                    {s.symbol}
                    {s.exchange ? (
                      <span className="text-ink-3 ml-1">{s.exchange}</span>
                    ) : null}
                  </Tag>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Section>
    </div>
  );
}

export function StorageAdmin() {
  const t = useT();
  const utils = api.useUtils();
  const [storage] = api.admin.data.storage.useSuspenseQuery();
  const [enabled, setEnabled] = useState(storage.retentionDays !== null);
  const [days, setDays] = useState(storage.retentionDays ?? 90);
  const preview = api.admin.data.retentionPreview.useQuery(
    { days },
    { enabled: enabled && days > 0 },
  );
  const { flash, success, error, clear } = useFlash(10_000);
  const invalidate = () => utils.admin.data.storage.invalidate();
  const save = api.admin.data.setRetention.useMutation({
    onMutate: clear,
    onSuccess: async (_, input) => {
      success(
        input.days
          ? t.adminManage.data.retentionSaved(input.days)
          : t.adminManage.data.statementFilesAreKeptForever,
      );
      await invalidate();
    },
    onError: error,
  });
  const purge = api.admin.data.purgeNow.useMutation({
    onMutate: clear,
    onSuccess: async (r) => {
      success(
        r.files
          ? t.adminManage.data.filesDeleted(r.files, formatBytes(r.bytes))
          : t.adminManage.data.nothingToCleanUp,
      );
      await invalidate();
    },
    onError: error,
  });
  const dirty = enabled
    ? storage.retentionDays !== days
    : storage.retentionDays !== null;

  return (
    <div className="space-y-6">
      <Section title={t.adminManage.data.storedStatements}>
        <dl className="grid grid-cols-3 gap-6">
          {[
            [t.adminManage.data.filesKept, integer.format(storage.stats.files)],
            [t.adminManage.data.spaceUsed, formatBytes(storage.stats.bytes)],
            [
              t.adminManage.data.alreadyCleanedUp,
              integer.format(storage.stats.purged),
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-ink-2 text-[13px] font-semibold">{label}</dt>
              <dd className="figures font-display text-2xl font-semibold">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        title={t.adminManage.data.retention}
        description={t.adminManage.data.retentionHelp}
      >
        <div className="space-y-4">
          <FlashNotice flash={flash} />
          <Checkbox
            label={t.adminManage.data.deleteCompletedFiles}
            description={t.adminManage.data.duplicateDetectionHelp}
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          {enabled ? (
            <div className="flex flex-wrap items-center gap-2 pl-6.5 text-sm">
              {t.adminManage.data.keepFor}
              <Input
                type="number"
                min={1}
                max={3650}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                aria-label={t.adminManage.data.daysToKeepFiles}
                className="h-9 w-24"
              />
              {t.adminManage.data.days}
              {preview.data ? (
                <span className="text-ink-3 ml-2">
                  {preview.data.files
                    ? t.adminManage.data.cleanupPreview(
                        preview.data.files,
                        formatBytes(preview.data.bytes),
                      )
                    : t.adminManage.data.nothingOldEnoughToDeleteYet}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!dirty || (enabled && !(days > 0))}
              loading={save.isPending}
              onClick={() => save.mutate({ days: enabled ? days : null })}
            >
              {t.common.actions.save}
            </Button>
            {storage.retentionDays && storage.eligible?.files ? (
              <ConfirmButton
                variant="danger"
                loading={purge.isPending}
                confirmLabel={t.adminManage.data.deleteFiles(
                  storage.eligible.files,
                )}
                onConfirm={() => purge.mutate()}
              >
                {t.adminManage.data.cleanUpNow}
              </ConfirmButton>
            ) : null}
          </div>
        </div>
      </Section>
    </div>
  );
}

type Diff = RouterOutputs["admin"]["data"]["presets"]["active"]["diff"];

function DiffSummary({ diff }: { diff: Diff }) {
  const t = useT();
  const parts = [
    diff.categories.missing.length &&
      t.adminManage.data.categoryCount(diff.categories.missing.length),
    diff.institutions.missing.length &&
      t.adminManage.data.institutionCount(diff.institutions.missing.length),
    diff.currencies.missing.length &&
      t.adminManage.data.currencyCount(diff.currencies.missing.length),
  ].filter(Boolean);
  const archived =
    diff.categories.archived.length + diff.institutions.archived.length;
  return (
    <p className="text-ink-2 text-sm">
      {parts.length
        ? t.adminManage.data.applyingAdds(parts.join(", "))
        : t.adminManage.data.packAlreadyPresent}
      {archived ? t.adminManage.data.archivedDefaultsHelp(archived) : ""}
    </p>
  );
}

export function PresetsAdmin() {
  const t = useT();
  const utils = api.useUtils();
  const [presets] = api.admin.data.presets.useSuspenseQuery();
  const { flash, success, error, clear } = useFlash(10_000);
  const fileInput = useRef<HTMLInputElement>(null);
  const [custom, setCustom] = useState<{ name: string; json: string } | null>(
    null,
  );
  const [builtIn, setBuiltIn] = useState(presets.builtIn[0]?.id ?? "");
  const preview = api.admin.data.previewPack.useMutation({ onError: error });
  const invalidate = () =>
    Promise.all([
      utils.admin.data.presets.invalidate(),
      utils.admin.categories.list.invalidate(),
      utils.admin.institutions.list.invalidate(),
    ]);
  const apply = api.admin.data.applyPack.useMutation({
    onMutate: clear,
    onSuccess: async (r) => {
      success(
        t.adminManage.data.packApplied(
          r.categories,
          r.institutions,
          r.currencies,
        ),
      );
      setCustom(null);
      preview.reset();
      await invalidate();
    },
    onError: error,
  });
  const setCpfSrs = api.admin.data.setCpfSrs.useMutation({
    onMutate: clear,
    onSuccess: async () => {
      success(t.adminManage.data.packSettingsSaved);
      await utils.admin.data.presets.invalidate();
    },
    onError: error,
  });
  const { active, cpfSrs } = presets;
  const source = custom ? { json: custom.json } : { builtIn };

  return (
    <div className="space-y-6">
      <FlashNotice flash={flash} />
      <Section
        title={t.adminManage.data.activePack(active.name)}
        description={
          active.source === "file"
            ? t.adminManage.data.customPackHelp(active.file)
            : t.adminManage.data.builtinPackHelp(active.id)
        }
      >
        <dl className="mb-4 grid grid-cols-3 gap-6">
          {[
            [t.adminManage.data.categories, active.counts.categories],
            [t.adminManage.data.institutions, active.counts.institutions],
            [t.adminManage.data.currencies, active.counts.currencies],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-ink-2 text-[13px] font-semibold">{label}</dt>
              <dd className="figures font-display text-2xl font-semibold">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <DiffSummary diff={active.diff} />
        <p className="text-ink-3 mt-2 text-[13px]">
          {t.adminManage.data.defaultPackHelp}
        </p>
      </Section>

      <Section
        title={t.adminManage.data.cpfSrsAccounts}
        description={t.adminManage.data.cpfSrsHelp}
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field
            label={t.adminManage.data.availableToEveryone}
            htmlFor="cpf-srs"
            className="w-64"
          >
            <Select
              id="cpf-srs"
              value={
                cpfSrs.override === null
                  ? "pack"
                  : cpfSrs.override
                    ? "on"
                    : "off"
              }
              onChange={(e) =>
                setCpfSrs.mutate({
                  enabled:
                    e.target.value === "pack" ? null : e.target.value === "on",
                })
              }
            >
              <option value="pack">
                {t.adminManage.data.followPack(active.features.cpfSrs)}
              </option>
              <option value="on">{t.adminManage.data.on}</option>
              <option value="off">{t.adminManage.data.off}</option>
            </Select>
          </Field>
          <p className="text-ink-3 pb-2 text-[13px]">
            {t.adminManage.data.cpfCurrent(cpfSrs.effective)}
          </p>
        </div>
      </Section>

      <Section
        title={t.adminManage.data.applyAPack}
        description={t.adminManage.data.applyPackHelp}
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field
            label={t.adminManage.data.builtinPack}
            htmlFor="pack-builtin"
            className="w-64"
          >
            <Select
              id="pack-builtin"
              value={custom ? "" : builtIn}
              onChange={(e) => {
                setCustom(null);
                setBuiltIn(e.target.value);
                preview.reset();
              }}
            >
              {custom ? (
                <option value="">
                  {t.adminManage.data.customFile(custom.name)}
                </option>
              ) : null}
              {presets.builtIn.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="ghost" onClick={() => fileInput.current?.click()}>
            <Upload className="size-4" />
            {t.adminManage.data.useAJSONPack}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void file.text().then((json) => {
                setCustom({ name: file.name, json });
                preview.mutate({ json });
              });
            }}
          />
          <Button
            variant="secondary"
            loading={preview.isPending}
            onClick={() => preview.mutate(source)}
          >
            {t.adminManage.data.preview}
          </Button>
        </div>
        {preview.data ? (
          <div className="mt-5 space-y-3">
            <Notice tone="info">
              <strong>{preview.data.name}</strong>
              <DiffSummary diff={preview.data.diff} />
            </Notice>
            <ConfirmButton
              disabled={
                !preview.data.diff.categories.missing.length &&
                !preview.data.diff.institutions.missing.length &&
                !preview.data.diff.currencies.missing.length
              }
              loading={apply.isPending}
              confirmLabel={t.adminManage.data.addTheseDefaults}
              onConfirm={() => apply.mutate(source)}
            >
              {t.adminManage.data.applyPack}
            </ConfirmButton>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
