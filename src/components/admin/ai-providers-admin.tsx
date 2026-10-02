"use client";

import { CircleCheck, CircleX, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "~/components/ui/field";
import { EmptyState, Notice, Tag } from "~/components/ui/panel";
import { api, type RouterOutputs } from "~/trpc/react";
import { formText } from "~/lib/form";

type Provider = RouterOutputs["admin"]["ai"]["list"][number];
type Kind = Provider["kind"];
type TestResult = RouterOutputs["admin"]["ai"]["test"];

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

export function AiProvidersAdmin() {
  const utils = api.useUtils();
  const [providers] = api.admin.ai.list.useSuspenseQuery();
  const [editing, setEditing] = useState<Provider | "new" | null>(null);
  const [results, setResults] = useState<Record<string, TestResult>>({});

  const invalidate = () => utils.admin.ai.list.invalidate();
  const setDefault = api.admin.ai.setDefault.useMutation({
    onSuccess: invalidate,
  });
  const test = api.admin.ai.test.useMutation({
    onSuccess: (result, vars) =>
      setResults((r) => ({ ...r, [vars.id]: result })),
  });

  return (
    <>
      <div className="mb-6 flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          Add provider
        </Button>
      </div>

      {providers.length === 0 ? (
        <EmptyState title="No AI providers">
          Add one so statements can be read.
        </EmptyState>
      ) : (
        <ul className="border-ink border-t-2">
          {providers.map((p) => {
            const result = results[p.id];
            const testing = test.isPending && test.variables?.id === p.id;
            return (
              <li
                key={p.id}
                className="border-line grid gap-4 border-b py-5 md:grid-cols-[1fr_auto] md:items-center"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold">{p.name}</span>
                    <Tag tone="outline">{kindMeta[p.kind].label}</Tag>
                    {p.isDefault ? <Tag tone="forest">Default</Tag> : null}
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
                  </dl>
                  {result ? (
                    <p
                      className={`mt-3 flex items-start gap-2 text-[13px] ${result.ok ? "text-gain" : "text-loss"}`}
                    >
                      {result.ok ? (
                        <CircleCheck className="mt-px size-4 shrink-0" />
                      ) : (
                        <CircleX className="mt-px size-4 shrink-0" />
                      )}
                      <span className="break-all">
                        {result.ok
                          ? `Working — ${"model" in result ? result.model : ""} answered in ${(result.latencyMs / 1000).toFixed(1)}s`
                          : `Failed after ${(result.latencyMs / 1000).toFixed(1)}s: ${"error" in result ? result.error : "unexpected answer"}`}
                      </span>
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={testing}
                    onClick={() => test.mutate({ id: p.id })}
                  >
                    {testing ? "Testing…" : "Test"}
                  </Button>
                  {!p.isDefault ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDefault.mutate({ id: p.id })}
                    >
                      Make default
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

      <ProviderDrawer
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        provider={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
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
}: {
  providerId?: string;
  kind: Kind;
  defaultValue?: string;
}) {
  const [load, setLoad] = useState(false);
  const models = api.admin.ai.models.useQuery(
    { id: providerId ?? "" },
    { enabled: load && !!providerId },
  );
  const listId = `models-${providerId ?? "new"}`;

  return (
    <Field
      label="Model"
      htmlFor="prov-model"
      error={models.data && !models.data.ok ? models.data.error : null}
      hint={
        providerId ? (
          <button
            type="button"
            className="text-forest font-semibold underline underline-offset-4"
            onClick={() => setLoad(true)}
          >
            {models.isFetching
              ? "Loading models…"
              : models.data?.ok
                ? `${models.data.models.length} models available — start typing`
                : "Load available models"}
          </button>
        ) : (
          "Save first, then you can load the provider's model list."
        )
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
        {models.data?.models.map((m) => (
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
  onClose,
  onSaved,
}: {
  provider: Provider | "new" | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const existing = provider && provider !== "new" ? provider : null;
  const [kind, setKind] = useState<Kind>(existing?.kind ?? "opencode");
  const create = api.admin.ai.create.useMutation();
  const update = api.admin.ai.update.useMutation();
  const remove = api.admin.ai.remove.useMutation();
  const error = create.error ?? update.error ?? remove.error;
  const meta = kindMeta[kind];

  async function save(form: FormData) {
    const apiKeyRaw = formText(form, "apiKey");
    const values = {
      name: formText(form, "name"),
      kind,
      baseUrl: formText(form, "baseUrl"),
      defaultModel: formText(form, "defaultModel"),
      supportsVision: form.get("supportsVision") === "on",
      isEnabled: form.get("isEnabled") === "on",
      // Blank key on edit means "keep the stored one".
      apiKey: meta.needsKey ? apiKeyRaw || (existing ? undefined : null) : null,
    };
    if (existing) await update.mutateAsync({ id: existing.id, ...values });
    else await create.mutateAsync(values);
    await onSaved();
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
            <Button
              variant="danger"
              className="mr-auto"
              loading={remove.isPending}
              onClick={() =>
                void remove
                  .mutateAsync({ id: existing.id })
                  .then(onSaved)
                  .catch(() => undefined)
              }
            >
              Delete
            </Button>
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
        <Field label="Type" htmlFor="prov-kind">
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
            defaultChecked={existing?.isEnabled ?? true}
          />
        </div>
      </form>
    </Drawer>
  );
}
