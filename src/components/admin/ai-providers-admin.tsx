"use client";

import { CircleCheck, CircleHelp, CircleX, Plus } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { Drawer } from "~/components/ui/dialog";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Checkbox, Field, Input, Select } from "~/components/ui/field";
import { EmptyState, Notice, Tag } from "~/components/ui/panel";
import { useFlash } from "~/components/ui/use-flash";
import { cn } from "~/lib/cn";
import { formatDateTime, formatRelative } from "~/lib/format";
import { formText } from "~/lib/form";
import { api, type RouterOutputs } from "~/trpc/react";

type Provider = RouterOutputs["admin"]["ai"]["list"][number];
type Kind = Provider["kind"];
type ModelList = RouterOutputs["admin"]["ai"]["models"];

const integer = new Intl.NumberFormat("en-SG");
const compact = new Intl.NumberFormat("en", { notation: "compact" });

const kindMeta: Record<
  Kind,
  {
    label: string;
    urlHint: string;
    urlPlaceholder: string;
    modelPlaceholder: string;
    needsKey: boolean;
  }
> = {
  opencode: {
    label: "opencode server",
    urlHint:
      "The `opencode serve` instance. Its own login (e.g. your opencode Go subscription) is used, so no key here.",
    urlPlaceholder: "http://opencode:4096",
    modelPlaceholder: "opencode-go/glm-5.3-flash",
    needsKey: false,
  },
  openai_compatible: {
    label: "OpenAI-compatible",
    urlHint:
      "Base URL ending in /v1 — OpenAI, DeepSeek, OpenRouter, Ollama, LM Studio, opencode Zen…",
    urlPlaceholder: "https://api.openai.com/v1",
    modelPlaceholder: "gpt-4.1-mini",
    needsKey: true,
  },
  anthropic: {
    label: "Anthropic-compatible",
    urlHint:
      "Leave empty for api.anthropic.com, or point at a compatible gateway.",
    urlPlaceholder: "https://api.anthropic.com/v1",
    modelPlaceholder: "claude-sonnet-5-5",
    needsKey: true,
  },
};

function Health({ provider }: { provider: Provider }) {
  if (!provider.lastTestedAt) {
    return (
      <p className="text-ink-3 mt-3 flex items-center gap-2 text-[13px]">
        <CircleHelp className="size-4 shrink-0" />
        Not checked yet
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
      title={formatDateTime(provider.lastTestedAt)}
    >
      {ok ? (
        <CircleCheck className="mt-px size-4 shrink-0" />
      ) : (
        <CircleX className="mt-px size-4 shrink-0" />
      )}
      <span className="break-words">
        {ok
          ? `Working — answered in ${((provider.lastTestLatencyMs ?? 0) / 1000).toFixed(1)}s`
          : `Failed: ${provider.lastTestError ?? "unexpected answer"}`}
        <span className="text-ink-3">
          {" "}
          · checked {formatRelative(provider.lastTestedAt)}
        </span>
      </span>
    </p>
  );
}

function LimitBar({ provider }: { provider: Provider }) {
  if (!provider.monthlyTokenLimit) {
    return provider.tokensThisMonth ? (
      <p className="text-ink-3 mt-2 text-[13px]">
        {compact.format(provider.tokensThisMonth)} tokens this month · no limit
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
        {compact.format(provider.tokensThisMonth)} of{" "}
        {compact.format(provider.monthlyTokenLimit)} tokens this month
        {provider.limitReached
          ? provider.pauseAtLimit
            ? " · paused until next month"
            : " · over the limit"
          : ""}
      </p>
    </div>
  );
}

export function AiProvidersAdmin() {
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
      success("Default provider changed. New imports use it from now on.");
      await invalidate();
    },
    onError: error,
  });
  const setFallback = api.admin.ai.setFallback.useMutation({
    onMutate: clear,
    onSuccess: async (_, input) => {
      success(input.id ? "Fallback provider set." : "Fallback removed.");
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
          label="Check every enabled provider every 6 hours"
          description="Failures show up on the Status page before an import hits them."
          checked={healthChecks}
          disabled={setHealthChecks.isPending}
          onChange={(e) =>
            setHealthChecks.mutate({ enabled: e.target.checked })
          }
        />
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          Add provider
        </Button>
      </div>
      <FlashNotice flash={flash} className="mb-6" />

      {providers.length === 0 ? (
        <EmptyState title="No AI providers">
          Add one so statements can be read.
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
                    <Tag tone="outline">{kindMeta[p.kind].label}</Tag>
                    {p.isDefault ? <Tag tone="brand">Default</Tag> : null}
                    {p.isFallback ? <Tag tone="soft">Fallback</Tag> : null}
                    {!p.isEnabled ? <Tag tone="warn">Disabled</Tag> : null}
                    {p.supportsVision ? <Tag>Reads images</Tag> : null}
                  </p>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-[auto_1fr]">
                    <dt className="text-ink-3">Model</dt>
                    <dd className="font-semibold break-all">
                      {p.defaultModel}
                    </dd>
                    <dt className="text-ink-3">Endpoint</dt>
                    <dd className="text-ink-2 break-all">
                      {p.baseUrl ?? "Provider default"}
                    </dd>
                    {p.kind !== "opencode" ? (
                      <>
                        <dt className="text-ink-3">API key</dt>
                        <dd className="text-ink-2">
                          {p.apiKeyPreview ?? "Not set"}
                        </dd>
                      </>
                    ) : null}
                    {p.inputCostPerMTok || p.outputCostPerMTok ? (
                      <>
                        <dt className="text-ink-3">Price</dt>
                        <dd className="text-ink-2">
                          US${p.inputCostPerMTok ?? "0"} in / US$
                          {p.outputCostPerMTok ?? "0"} out per million tokens
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
                    {testing ? "Testing…" : "Test now"}
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
                      Make default
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
                      {p.isFallback ? "Remove fallback" : "Use as fallback"}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(p)}
                  >
                    Edit
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {providers.length > 1 && !providers.some((p) => p.isFallback) ? (
        <p className="text-ink-3 mt-4 text-[13px]">
          Tip: pick a fallback, and imports retry with it when the default fails
          or has used its monthly limit.
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

function ModelPicker({
  providerId,
  kind,
  defaultValue,
  readConnection,
}: {
  providerId?: string;
  kind: Kind;
  defaultValue?: string;
  /** Current endpoint and key from the form, so models can be listed before saving. */
  readConnection: () => { baseUrl: string; apiKey: string };
}) {
  const [result, setResult] = useState<ModelList | null>(null);
  const models = api.admin.ai.models.useMutation({ onSuccess: setResult });
  const listId = `models-${providerId ?? "new"}`;

  return (
    <Field
      label="Model"
      htmlFor="prov-model"
      error={
        result && !result.ok
          ? result.error
          : models.error
            ? models.error.message
            : null
      }
      hint={
        <button
          type="button"
          className="text-brand font-semibold underline underline-offset-4"
          onClick={() => {
            const { baseUrl, apiKey } = readConnection();
            models.mutate({
              id: providerId,
              kind,
              baseUrl: baseUrl || null,
              apiKey: apiKey || undefined,
            });
          }}
        >
          {models.isPending
            ? "Loading models…"
            : result?.ok
              ? `${result.models.length} models available — start typing`
              : "Load available models"}
        </button>
      }
    >
      <Input
        id="prov-model"
        name="defaultModel"
        required
        list={listId}
        defaultValue={defaultValue}
        placeholder={kindMeta[kind].modelPlaceholder}
      />
      <datalist id={listId}>
        {result?.models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.supportsAttachments === false ? " (text only)" : ""}
          </option>
        ))}
      </datalist>
    </Field>
  );
}

function ProviderDrawer({
  provider,
  others,
  onClose,
  onSaved,
}: {
  provider: Provider | "new" | null;
  others: Provider[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const existing = provider && provider !== "new" ? provider : null;
  const [kind, setKind] = useState<Kind>(existing?.kind ?? "opencode");
  const [limit, setLimit] = useState(
    existing?.monthlyTokenLimit !== null && !!existing,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const create = api.admin.ai.create.useMutation();
  const update = api.admin.ai.update.useMutation();
  const remove = api.admin.ai.remove.useMutation();
  const error = create.error ?? update.error ?? remove.error;
  const meta = kindMeta[kind];
  // Mirrors the server: the oldest enabled provider left becomes the default.
  const successor = others.find((p) => p.isEnabled);

  async function save(form: FormData) {
    const apiKeyRaw = formText(form, "apiKey");
    const limitValue = Number(formText(form, "monthlyTokenLimit"));
    const values = {
      name: formText(form, "name"),
      kind,
      baseUrl: formText(form, "baseUrl"),
      defaultModel: formText(form, "defaultModel"),
      supportsVision: form.get("supportsVision") === "on",
      // The default provider stays enabled; the server rejects disabling it.
      isEnabled:
        (existing?.isDefault ?? false) || form.get("isEnabled") === "on",
      // Blank key on edit means "keep the stored one".
      apiKey: meta.needsKey ? apiKeyRaw || (existing ? undefined : null) : null,
      inputCostPerMTok: formText(form, "inputCostPerMTok"),
      outputCostPerMTok: formText(form, "outputCostPerMTok"),
      monthlyTokenLimit: limit && limitValue > 0 ? limitValue : null,
      pauseAtLimit: limit && form.get("pauseAtLimit") === "on",
    };
    if (existing) {
      await update.mutateAsync({ id: existing.id, ...values });
      await onSaved(`Saved ${values.name}.`);
    } else {
      await create.mutateAsync(values);
      await onSaved(`Added ${values.name}. Test it before relying on it.`);
    }
  }

  return (
    <Drawer
      open={provider !== null}
      onClose={onClose}
      title={existing ? existing.name : "Add AI provider"}
      description="Used to read statements and screenshots into structured data."
      footer={
        <>
          {existing ? (
            <ConfirmButton
              variant="danger"
              className="mr-auto"
              loading={remove.isPending}
              confirmLabel={
                existing.isDefault
                  ? successor
                    ? `Delete? ${successor.name} becomes default`
                    : "Delete? Imports will stop"
                  : "Click again to delete"
              }
              onConfirm={() =>
                void remove
                  .mutateAsync({ id: existing.id })
                  .then((r) =>
                    onSaved(
                      r.promoted
                        ? `Deleted ${existing.name}. ${r.promoted.name} is now the default.`
                        : `Deleted ${existing.name}.`,
                    ),
                  )
                  .catch(() => undefined)
              }
            >
              Delete
            </ConfirmButton>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="provider-form"
            loading={create.isPending || update.isPending}
          >
            {existing ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id="provider-form"
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save(new FormData(event.currentTarget)).catch(() => undefined);
        }}
      >
        {error ? <Notice tone="error">{error.message}</Notice> : null}
        <Field label="Name" htmlFor="prov-name">
          <Input
            id="prov-name"
            name="name"
            required
            defaultValue={existing?.name}
            placeholder="opencode Go"
          />
        </Field>
        <Field
          label="Type"
          htmlFor="prov-kind"
          hint={
            existing
              ? "Fixed once saved, because the stored key and endpoint belong to this type. Add a new provider to switch."
              : undefined
          }
        >
          <Select
            id="prov-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            disabled={!!existing}
          >
            {Object.entries(kindMeta).map(([value, m]) => (
              <option key={value} value={value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Endpoint URL" htmlFor="prov-url" hint={meta.urlHint}>
          <Input
            id="prov-url"
            name="baseUrl"
            type="url"
            required={kind !== "anthropic"}
            defaultValue={existing?.baseUrl ?? ""}
            placeholder={meta.urlPlaceholder}
          />
        </Field>
        {meta.needsKey ? (
          <Field
            label="API key"
            htmlFor="prov-key"
            hint={
              existing?.apiKeyPreview
                ? `Stored: ${existing.apiKeyPreview}. Leave blank to keep it.`
                : "Encrypted before it is stored. Never sent back to the browser."
            }
          >
            <Input
              id="prov-key"
              name="apiKey"
              type="password"
              autoComplete="off"
            />
          </Field>
        ) : null}
        <ModelPicker
          providerId={existing?.id}
          kind={kind}
          defaultValue={existing?.defaultModel}
          readConnection={() => {
            const form = new FormData(formRef.current ?? undefined);
            return {
              baseUrl: formText(form, "baseUrl"),
              apiKey: formText(form, "apiKey"),
            };
          }}
        />
        <div className="space-y-3 pt-1">
          <Checkbox
            name="supportsVision"
            label="Model can read images"
            description="Scanned PDFs and screenshots are only sent to models with this on."
            defaultChecked={existing?.supportsVision ?? true}
          />
          <Checkbox
            name="isEnabled"
            label="Enabled"
            description={
              existing?.isDefault
                ? "The default provider is always enabled. Make another provider the default to disable this one."
                : undefined
            }
            disabled={existing?.isDefault}
            defaultChecked={
              (existing?.isDefault ?? false) || (existing?.isEnabled ?? true)
            }
          />
        </div>

        <fieldset className="border-line space-y-4 border-t pt-5">
          <legend className="text-[13px] font-semibold">
            Cost &amp; limits
          </legend>
          <p className="text-ink-3 -mt-2 text-[13px]">
            List prices are only used to estimate cost on the Usage page. Leave
            blank for a subscription like opencode Go.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Input, US$ per 1M tokens" htmlFor="prov-in">
              <Input
                id="prov-in"
                name="inputCostPerMTok"
                inputMode="decimal"
                defaultValue={existing?.inputCostPerMTok ?? ""}
                placeholder="0.15"
              />
            </Field>
            <Field label="Output, US$ per 1M tokens" htmlFor="prov-out">
              <Input
                id="prov-out"
                name="outputCostPerMTok"
                inputMode="decimal"
                defaultValue={existing?.outputCostPerMTok ?? ""}
                placeholder="0.60"
              />
            </Field>
          </div>
          <Checkbox
            label="Set a monthly token limit"
            description="Warns on the Status page at 80% and 100%."
            checked={limit}
            onChange={(e) => setLimit(e.target.checked)}
          />
          {limit ? (
            <div className="space-y-3 pl-6.5">
              <Field
                label="Tokens per month (input + output)"
                htmlFor="prov-limit"
              >
                <Input
                  id="prov-limit"
                  name="monthlyTokenLimit"
                  type="number"
                  min={1000}
                  step={1000}
                  required
                  defaultValue={existing?.monthlyTokenLimit ?? 5_000_000}
                />
              </Field>
              <Checkbox
                name="pauseAtLimit"
                label="Stop sending imports here once reached"
                description="Imports use the fallback provider instead, or fail with a clear message."
                defaultChecked={existing?.pauseAtLimit ?? false}
              />
            </div>
          ) : null}
          {existing?.monthlyTokenLimit ? (
            <p className="text-ink-3 text-[13px]">
              Used this month: {integer.format(existing.tokensThisMonth)}{" "}
              tokens.
            </p>
          ) : null}
        </fieldset>
      </form>
    </Drawer>
  );
}
