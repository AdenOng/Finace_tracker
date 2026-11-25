"use client";

import { useT, useLocale } from "~/i18n/client";
import { CircleCheck, CircleHelp, CircleX, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Checkbox } from "~/components/ui/field";
import { EmptyState, Tag } from "~/components/ui/panel";
import { useFlash } from "~/components/ui/use-flash";
import { cn } from "~/lib/cn";
import { formatDateTime, formatRelative } from "~/lib/format";
import { api } from "~/trpc/react";
import { ProviderDrawer, kindMeta } from "./ai-provider-drawer";
import type { Provider } from "./ai-provider-types";

const compact = new Intl.NumberFormat("en", { notation: "compact" });

function Health({ provider }: { provider: Provider }) {
  const t = useT();
  const locale = useLocale();
  if (!provider.lastTestedAt) {
    return (
      <p className="text-ink-3 mt-3 flex items-center gap-2 text-[13px]">
        <CircleHelp className="size-4 shrink-0" />
        {t.admin.providers.notCheckedYet}
      </p>
    );
  }
  const ok = provider.lastTestOk;
  return (
    <p
      className={cn(
        "mt-3 flex items-start gap-2 text-[13px]",
        ok ? "text-gain" : "text-loss",
      )}
      title={formatDateTime(provider.lastTestedAt, locale)}
    >
      {ok ? (
        <CircleCheck className="mt-px size-4 shrink-0" />
      ) : (
        <CircleX className="mt-px size-4 shrink-0" />
      )}
      <span className="break-words">
        {ok
          ? t.admin.providers.working(
              ((provider.lastTestLatencyMs ?? 0) / 1000).toFixed(1),
            )
          : t.admin.providers.failed(
              provider.lastTestError ?? t.admin.providers.unexpectedAnswer,
            )}
        <span className="text-ink-3">
          {" "}
          {t.admin.providers.checked(
            formatRelative(provider.lastTestedAt, new Date(), locale),
          )}
        </span>
      </span>
    </p>
  );
}

function LimitBar({ provider }: { provider: Provider }) {
  const t = useT();
  if (!provider.monthlyTokenLimit) {
    return provider.tokensThisMonth ? (
      <p className="text-ink-3 mt-2 text-[13px]">
        {t.admin.providers.noLimit(compact.format(provider.tokensThisMonth))}
      </p>
    ) : null;
  }
  const share = Math.min(
    1,
    provider.tokensThisMonth / provider.monthlyTokenLimit,
  );
  return (
    <div className="mt-3 max-w-sm">
      <div className="bg-sunken border-line h-2 overflow-hidden rounded-full border">
        <div
          className={cn(
            "h-full",
            share >= 1 ? "bg-loss" : share >= 0.8 ? "bg-warn" : "bg-brand",
          )}
          style={{ width: `${share * 100}%` }}
        />
      </div>
      <p className="text-ink-3 mt-1 text-[12px]">
        {t.admin.providers.limitUsage(
          compact.format(provider.tokensThisMonth),
          compact.format(provider.monthlyTokenLimit),
          provider.limitReached,
          provider.pauseAtLimit,
        )}
      </p>
    </div>
  );
}

export function AiProvidersAdmin() {
  const t = useT();
  const utils = api.useUtils();
  const [providers] = api.admin.ai.list.useSuspenseQuery();
  const [healthChecks] = api.admin.ai.healthChecks.useSuspenseQuery();
  const [editing, setEditing] = useState<Provider | "new" | null>(null);
  const { flash, success, error, clear } = useFlash();

  const invalidate = () =>
    Promise.all([
      utils.admin.ai.list.invalidate(),
      utils.admin.overview.attention.invalidate(),
    ]);
  const setDefault = api.admin.ai.setDefault.useMutation({
    onMutate: clear,
    onSuccess: async () => {
      success(t.admin.providers.defaultProviderChangedNewImportsUseItFromNowOn);
      await invalidate();
    },
    onError: error,
  });
  const setFallback = api.admin.ai.setFallback.useMutation({
    onMutate: clear,
    onSuccess: async (_, input) => {
      success(
        input.id
          ? t.admin.providers.fallbackProviderSet
          : t.admin.providers.fallbackRemoved,
      );
      await invalidate();
    },
    onError: error,
  });
  const test = api.admin.ai.test.useMutation({
    onMutate: clear,
    onSuccess: invalidate,
    onError: error,
  });
  const setHealthChecks = api.admin.ai.setHealthChecks.useMutation({
    onSuccess: () => utils.admin.ai.healthChecks.invalidate(),
    onError: error,
  });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Checkbox
          label={t.admin.providers.checkEveryEnabledProviderEvery6Hours}
          description={
            t.admin.providers
              .failuresShowUpOnTheStatusPageBeforeAnImportHitsThem
          }
          checked={healthChecks}
          disabled={setHealthChecks.isPending}
          onChange={(e) =>
            setHealthChecks.mutate({ enabled: e.target.checked })
          }
        />
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          {t.admin.providers.addProvider}
        </Button>
      </div>
      <FlashNotice flash={flash} onDismiss={clear} className="mb-6" />

      {providers.length === 0 ? (
        <EmptyState title={t.admin.providers.noAiProviders}>
          {t.admin.providers.addOneSoStatementsCanBeRead}
        </EmptyState>
      ) : (
        <ul className="border-ink border-t-2">
          {providers.map((p) => {
            const testing = test.isPending && test.variables?.id === p.id;
            return (
              <li
                key={p.id}
                className="border-line grid gap-4 border-b py-5 md:grid-cols-[1fr_auto] md:items-start"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold">{p.name}</span>
                    <Tag tone="outline">{kindMeta[p.kind].label(t)}</Tag>
                    {p.isDefault ? (
                      <Tag tone="brand">{t.admin.providers.default}</Tag>
                    ) : null}
                    {p.isFallback ? (
                      <Tag tone="soft">{t.admin.providers.fallback}</Tag>
                    ) : null}
                    {!p.isEnabled ? (
                      <Tag tone="warn">{t.admin.providers.disabled}</Tag>
                    ) : null}
                    {p.supportsVision ? (
                      <Tag>{t.admin.providers.readsImages}</Tag>
                    ) : null}
                  </p>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-[auto_1fr]">
                    <dt className="text-ink-3">{t.admin.providers.model}</dt>
                    <dd className="font-semibold break-all">
                      {p.defaultModel}
                    </dd>
                    <dt className="text-ink-3">{t.admin.providers.endpoint}</dt>
                    <dd className="text-ink-2 break-all">
                      {p.baseUrl ?? t.admin.providers.providerDefault}
                    </dd>
                    {p.kind !== "opencode" ? (
                      <>
                        <dt className="text-ink-3">
                          {t.admin.providers.apiKey}
                        </dt>
                        <dd className="text-ink-2">
                          {p.apiKeyPreview ?? t.admin.providers.notSet}
                        </dd>
                      </>
                    ) : null}
                    {p.inputCostPerMTok || p.outputCostPerMTok ? (
                      <>
                        <dt className="text-ink-3">
                          {t.admin.providers.price}
                        </dt>
                        <dd className="text-ink-2">
                          {t.admin.providers.prices(
                            p.inputCostPerMTok ?? "0",
                            p.outputCostPerMTok ?? "0",
                          )}
                        </dd>
                      </>
                    ) : null}
                  </dl>
                  <Health provider={p} />
                  <LimitBar provider={p} />
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={testing}
                    onClick={() => test.mutate({ id: p.id })}
                  >
                    {testing
                      ? t.admin.providers.testing
                      : t.admin.providers.testNow}
                  </Button>
                  {!p.isDefault ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={
                        setDefault.isPending &&
                        setDefault.variables?.id === p.id
                      }
                      onClick={() => setDefault.mutate({ id: p.id })}
                    >
                      {t.admin.providers.makeDefault}
                    </Button>
                  ) : null}
                  {!p.isDefault && p.isEnabled ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setFallback.mutate({ id: p.isFallback ? null : p.id })
                      }
                    >
                      {p.isFallback
                        ? t.admin.providers.removeFallback
                        : t.admin.providers.useAsFallback}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(p)}
                  >
                    {t.common.actions.edit}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {providers.length > 1 && !providers.some((p) => p.isFallback) ? (
        <p className="text-ink-3 mt-4 text-[13px]">
          {
            t.admin.providers
              .tipPickAFallbackAndImportsRetryWithItWhenTheDefaultFailsOrHasUsedItsMonthlyLimit
          }
        </p>
      ) : null}

      <ProviderDrawer
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        provider={editing}
        others={providers.filter(
          (p) => editing === "new" || p.id !== editing?.id,
        )}
        onClose={() => setEditing(null)}
        onSaved={async (message) => {
          setEditing(null);
          success(message);
          await invalidate();
        }}
      />
    </>
  );
}
