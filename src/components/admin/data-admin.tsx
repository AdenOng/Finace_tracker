"use client";

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
          ? "Backup requested. The backup service picks it up within a minute."
          : "Backup requested, but the backup service is not running, so nothing will happen until it starts.",
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
        title="Backup service"
        description={`Nightly pg_dump into ${service.directory}, kept for ${service.retentionDays} days.`}
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={request.isPending}
            disabled={!!service.requestedAt || !!service.inProgressSince}
            onClick={() => request.mutate()}
          >
            {service.inProgressSince
              ? "Backing up…"
              : service.requestedAt
                ? "Backup pending…"
                : "Back up now"}
          </Button>
        }
      >
        <div className="space-y-2">
          <FlashNotice flash={flash} className="mb-3" />
          <StatusLine ok={service.running}>
            {service.running
              ? `Running — last checked in ${formatRelative(service.heartbeat!)}.`
              : service.heartbeat
                ? `Not running — last seen ${formatRelative(service.heartbeat)}.`
                : "Not running. Start it with docker compose up -d backup."}
          </StatusLine>
          {service.inProgressSince ? (
            <StatusLine ok={null}>
              Backup in progress since {formatRelative(service.inProgressSince)}
              .
            </StatusLine>
          ) : null}
          {service.lastRun ? (
            <StatusLine ok={service.lastRun.ok}>
              Last backup {service.lastRun.ok ? "succeeded" : "failed"}
              {service.lastRun.at
                ? ` ${formatRelative(service.lastRun.at)} (${formatDateTime(service.lastRun.at)})`
                : ""}
              .
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
              Newest dump is from {formatRelative(latest.createdAt)}.
            </StatusLine>
          ) : null}
        </div>
      </Section>

      <Section
        title="Dumps"
        description="Each file holds every user's data. Downloads are recorded in the activity log; keep copies somewhere safe and private."
      >
        {!data.available ? (
          <EmptyState title="Backup folder not found">
            Nothing is mounted at {service.directory}. In Docker, the app needs
            the ./backups folder mounted (see docker-compose.yml).
          </EmptyState>
        ) : data.backups.length === 0 ? (
          <EmptyState title="No backups yet">
            The first one is made when the backup service starts.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Made</Th>
                <Th>File</Th>
                <Th className="text-right">Size</Th>
                <Th className="text-right">
                  <span className="sr-only">Download</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {data.backups.map((b) => (
                <Tr key={b.name}>
                  <Td
                    className="whitespace-nowrap"
                    title={formatDateTime(b.createdAt)}
                  >
                    {formatRelative(b.createdAt)}
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
                      Download
                    </a>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <details className="mt-5 text-sm">
          <summary className="text-ink-2 cursor-pointer font-semibold">
            How to restore
          </summary>
          <div className="text-ink-2 mt-2 space-y-2">
            <p>Stop the app, then restore into the database container:</p>
            <pre className="bg-sunken border-line rounded-ctl overflow-x-auto border p-3 text-[12px]">
              {`docker compose stop app
docker compose exec -T db pg_restore --clean --if-exists \\
  -U finfolio -d finfolio < backups/finfolio-YYYYMMDD-HHMMSS.dump
docker compose start app`}
            </pre>
            <p>
              The dump does not include APP_ENCRYPTION_KEY. Keep your .env with
              it, or stored API keys cannot be read after a restore.
            </p>
          </div>
        </details>
      </Section>
    </div>
  );
}

export function MarketAdmin() {
  const utils = api.useUtils();
  const [market] = api.admin.data.market.useSuspenseQuery();
  const { flash, success, error, clear } = useFlash(10_000);
  const refresh = api.admin.data.refreshRates.useMutation({
    onMutate: clear,
    onSuccess: async (r) => {
      if (r.failed.length)
        error(
          `Could not fetch rates for ${r.failed.join(", ")}. The rate service may be down; the last stored rates are still used.`,
        );
      else
        success(
          r.stored
            ? `Stored ${r.stored} new rate${r.stored === 1 ? "" : "s"} for ${r.currencies.join(", ")}.`
            : `Rates for ${r.currencies.join(", ")} are already up to date.`,
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
        r.failed.length && `no price found for ${r.failed.join(", ")}`,
        r.mismatched.length &&
          `${r.mismatched.join(", ")} quoted in a different currency than recorded`,
      ].filter(Boolean);
      const updated = `Updated ${r.updated} of ${r.checked} price${r.checked === 1 ? "" : "s"}.`;
      if (problems.length)
        prices.error(`${updated} Skipped: ${problems.join("; ")}.`);
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
        title="Exchange rates"
        description={`Daily reference rates${market.fxSource ? ` from ${market.fxSource}` : ""}, fetched for each currency people view totals in. Refreshed every 12 hours.`}
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            <RefreshCw className="size-3.5" />
            Refresh now
          </Button>
        }
      >
        <FlashNotice flash={flash} className="mb-4" />
        {market.fx.length === 0 ? (
          <p className="text-ink-3 text-sm">No display currencies yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Display currency</Th>
                <Th>Latest rate</Th>
                <Th className="text-right">Stored rates</Th>
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
                        {f.latest === today ? "Today" : formatDate(f.latest)}
                      </span>
                    ) : (
                      <Tag tone="warn">None stored</Tag>
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
          Account currencies in use:{" "}
          {market.accountCurrencies.join(", ") || "none"}.
        </p>
      </Section>

      <Section
        title="Security prices"
        description="Stocks, ETFs and crypto are priced hourly from Yahoo Finance. Other holdings keep their statement price."
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={refreshPrices.isPending}
            disabled={!market.priceQuotes}
            onClick={() => refreshPrices.mutate()}
          >
            <RefreshCw className="size-3.5" />
            Refresh now
          </Button>
        }
      >
        <Checkbox
          className="mb-5"
          label="Fetch market prices"
          description="Only ticker symbols are sent to Yahoo, never quantities or account details."
          checked={market.priceQuotes}
          disabled={setPriceQuotes.isPending}
          onChange={(e) => setPriceQuotes.mutate({ enabled: e.target.checked })}
        />
        <FlashNotice flash={prices.flash} className="mb-4" />
        <dl className="mb-5 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {[
            ["Securities", integer.format(market.quotes.securities)],
            ["With a quote", integer.format(market.quotes.quoted)],
            [
              "Newest quote",
              market.quotes.newest ? formatRelative(market.quotes.newest) : "—",
            ],
            [
              "Daily closes up to",
              market.priceHistoryLatest
                ? formatDate(market.priceHistoryLatest)
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
              Valued from statements ({market.unquoted.length}
              {market.unquoted.length === 50 ? "+" : ""})
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
          ? `Statement files are now deleted ${input.days} days after their import finishes. The daily clean-up runs automatically.`
          : "Statement files are kept forever.",
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
          ? `Deleted ${r.files} file${r.files === 1 ? "" : "s"}, freeing ${formatBytes(r.bytes)}.`
          : "Nothing to clean up.",
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
      <Section title="Stored statements">
        <dl className="grid grid-cols-3 gap-6">
          {[
            ["Files kept", integer.format(storage.stats.files)],
            ["Space used", formatBytes(storage.stats.bytes)],
            ["Already cleaned up", integer.format(storage.stats.purged)],
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
        title="Retention"
        description="Once a statement is imported, its transactions live in the database; the uploaded file is only needed to read it again. Failed and unreviewed imports always keep their file."
      >
        <div className="space-y-4">
          <FlashNotice flash={flash} />
          <Checkbox
            label="Delete uploaded files after their import is finished"
            description="The record of the upload stays, so the same file is still recognised as a duplicate."
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          {enabled ? (
            <div className="flex flex-wrap items-center gap-2 pl-6.5 text-sm">
              Keep for
              <Input
                type="number"
                min={1}
                max={3650}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                aria-label="Days to keep files"
                className="h-9 w-24"
              />
              days
              {preview.data ? (
                <span className="text-ink-3 ml-2">
                  {preview.data.files
                    ? `${preview.data.files} file${preview.data.files === 1 ? "" : "s"} (${formatBytes(preview.data.bytes)}) would be deleted now`
                    : "Nothing old enough to delete yet"}
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
              Save
            </Button>
            {storage.retentionDays && storage.eligible?.files ? (
              <ConfirmButton
                variant="danger"
                loading={purge.isPending}
                confirmLabel={`Delete ${storage.eligible.files} files?`}
                onConfirm={() => purge.mutate()}
              >
                Clean up now
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
  const parts = [
    diff.categories.missing.length &&
      `${diff.categories.missing.length} categor${diff.categories.missing.length === 1 ? "y" : "ies"}`,
    diff.institutions.missing.length &&
      `${diff.institutions.missing.length} institution${diff.institutions.missing.length === 1 ? "" : "s"}`,
    diff.currencies.missing.length &&
      `${diff.currencies.missing.length} currenc${diff.currencies.missing.length === 1 ? "y" : "ies"}`,
  ].filter(Boolean);
  const archived =
    diff.categories.archived.length + diff.institutions.archived.length;
  return (
    <p className="text-ink-2 text-sm">
      {parts.length
        ? `Applying adds ${parts.join(", ")}.`
        : "Everything in this pack is already here."}
      {archived
        ? ` ${archived} of its defaults are archived; restore those from Categories or Brokers & banks.`
        : ""}
    </p>
  );
}

export function PresetsAdmin() {
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
        `Added ${r.categories} categories, ${r.institutions} institutions and ${r.currencies} currencies. Existing rows were left alone.`,
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
      success("Saved. People see the change on their next page load.");
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
        title={`Active pack: ${active.name}`}
        description={
          active.source === "file"
            ? `Loaded from PRESET_FILE (${active.file}). Seeded on every start-up; only missing rows are added.`
            : `Built-in pack "${active.id}" (DATA_PRESET). Seeded on every start-up; only missing rows are added.`
        }
      >
        <dl className="mb-4 grid grid-cols-3 gap-6">
          {[
            ["Categories", active.counts.categories],
            ["Institutions", active.counts.institutions],
            ["Currencies", active.counts.currencies],
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
          To switch the pack new installs start from, change DATA_PRESET or
          PRESET_FILE in .env. Applying a pack below adds its defaults to this
          instance now.
        </p>
      </Section>

      <Section
        title="CPF & SRS accounts"
        description="Singapore's retirement accounts: their own account types, the CPF buckets, and a toggle for counting them in net worth."
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field
            label="Available to everyone"
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
                Follow the pack ({active.features.cpfSrs ? "on" : "off"})
              </option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </Select>
          </Field>
          <p className="text-ink-3 pb-2 text-[13px]">
            Currently {cpfSrs.effective ? "on" : "off"}. Turning it off hides
            the account types; existing CPF and SRS accounts are kept.
          </p>
        </div>
      </Section>

      <Section
        title="Apply a pack"
        description="Adds another pack's categories, institutions and currencies. Insert-only: nothing you have edited is overwritten."
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Built-in pack" htmlFor="pack-builtin" className="w-64">
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
                <option value="">Custom file: {custom.name}</option>
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
            Use a JSON pack
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
            Preview
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
              confirmLabel="Add these defaults?"
              onConfirm={() => apply.mutate(source)}
            >
              Apply pack
            </ConfirmButton>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
