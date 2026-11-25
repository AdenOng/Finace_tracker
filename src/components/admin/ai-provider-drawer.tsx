"use client";

import { useT } from "~/i18n/client";
import type { Messages } from "~/i18n/messages";
import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { Drawer } from "~/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { formText } from "~/lib/form";
import { api, type RouterOutputs } from "~/trpc/react";
import type { Provider, Kind } from "./ai-provider-types";

type ModelList = RouterOutputs["admin"]["ai"]["models"];

const integer = new Intl.NumberFormat("en-SG");

export const kindMeta: Record<
  Kind,
  {
    label: (t: Messages) => string;
    urlHint: (t: Messages) => string;
    urlPlaceholder: string;
    modelPlaceholder: string;
    needsKey: boolean;
  }
> = {
  opencode: {
    label: (t: Messages) => t.admin.providers.opencodeServer,
    urlHint: (t: Messages) =>
      t.admin.providers
        .theOpencodeServeInstanceItsOwnLoginEGYourOpencodeGoSubscriptionIsUsedSoNoKeyHere,
    urlPlaceholder: "http://opencode:4096",
    modelPlaceholder: "opencode-go/glm-5.3-flash",
    needsKey: false,
  },
  openai_compatible: {
    label: (t: Messages) => t.admin.providers.openaiCompatible,
    urlHint: (t: Messages) =>
      t.admin.providers
        .baseUrlEndingInV1OpenaiDeepseekOpenrouterOllamaLmStudioOpencodeZen,
    urlPlaceholder: "https://api.openai.com/v1",
    modelPlaceholder: "gpt-4.1-mini",
    needsKey: true,
  },
  anthropic: {
    label: (t: Messages) => t.admin.providers.anthropicCompatible,
    urlHint: (t: Messages) =>
      t.admin.providers.leaveEmptyForApiAnthropicComOrPointAtACompatibleGateway,
    urlPlaceholder: "https://api.anthropic.com/v1",
    modelPlaceholder: "claude-sonnet-5-5",
    needsKey: true,
  },
};

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
  const t = useT();
  const [result, setResult] = useState<ModelList | null>(null);
  const models = api.admin.ai.models.useMutation({ onSuccess: setResult });
  const listId = `models-${providerId ?? "new"}`;

  return (
    <Field
      label={t.admin.providers.model}
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
            ? t.admin.providers.loadingModels
            : result?.ok
              ? t.admin.providers.modelsAvailable(result.models.length)
              : t.admin.providers.loadAvailableModels}
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
            {t.admin.providers.modelOption(
              m.name,
              m.supportsAttachments === false,
            )}
          </option>
        ))}
      </datalist>
    </Field>
  );
}

export function ProviderDrawer({
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
  const t = useT();
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
      await onSaved(t.admin.providers.saved(values.name));
    } else {
      await create.mutateAsync(values);
      await onSaved(t.admin.providers.added(values.name));
    }
  }

  return (
    <Drawer
      open={provider !== null}
      onClose={onClose}
      title={existing ? existing.name : t.admin.providers.addAiProvider}
      description={
        t.admin.providers.usedToReadStatementsAndScreenshotsIntoStructuredData
      }
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
                    ? t.admin.providers.deletePromote(successor.name)
                    : t.admin.providers.deleteImportsWillStop
                  : t.admin.providers.clickAgainToDelete
              }
              onConfirm={() =>
                void remove
                  .mutateAsync({ id: existing.id })
                  .then((r) =>
                    onSaved(
                      r.promoted
                        ? t.admin.providers.deletedPromoted(
                            existing.name,
                            r.promoted.name,
                          )
                        : t.admin.providers.deleted(existing.name),
                    ),
                  )
                  .catch(() => undefined)
              }
            >
              {t.common.actions.delete}
            </ConfirmButton>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            {t.common.actions.cancel}
          </Button>
          <Button
            type="submit"
            form="provider-form"
            loading={create.isPending || update.isPending}
          >
            {existing ? t.common.actions.save : t.common.actions.add}
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
        <Field label={t.common.fields.name} htmlFor="prov-name">
          <Input
            id="prov-name"
            name="name"
            required
            defaultValue={existing?.name}
            placeholder="opencode Go"
          />
        </Field>
        <Field
          label={t.common.fields.type}
          htmlFor="prov-kind"
          hint={
            existing
              ? t.admin.providers
                  .fixedOnceSavedBecauseTheStoredKeyAndEndpointBelongToThisTypeAddANewProviderToSwitch
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
                {m.label(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={t.admin.providers.endpointUrl}
          htmlFor="prov-url"
          hint={meta.urlHint(t)}
        >
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
            label={t.admin.providers.apiKey}
            htmlFor="prov-key"
            hint={
              existing?.apiKeyPreview
                ? t.admin.providers.storedKey(existing.apiKeyPreview)
                : t.admin.providers
                    .encryptedBeforeItIsStoredNeverSentBackToTheBrowser
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
            label={t.admin.providers.modelCanReadImages}
            description={
              t.admin.providers
                .scannedPdfsAndScreenshotsAreOnlySentToModelsWithThisOn
            }
            defaultChecked={existing?.supportsVision ?? true}
          />
          <Checkbox
            name="isEnabled"
            label={t.admin.providers.enabled}
            description={
              existing?.isDefault
                ? t.admin.providers
                    .theDefaultProviderIsAlwaysEnabledMakeAnotherProviderTheDefaultToDisableThisOne
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
            {t.admin.providers.costLimits}
          </legend>
          <p className="text-ink-3 -mt-2 text-[13px]">
            {
              t.admin.providers
                .listPricesAreOnlyUsedToEstimateCostOnTheUsagePageLeaveBlankForASubscriptionLikeOpencodeGo
            }
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label={t.admin.providers.inputUsPer1MTokens}
              htmlFor="prov-in"
            >
              <Input
                id="prov-in"
                name="inputCostPerMTok"
                inputMode="decimal"
                defaultValue={existing?.inputCostPerMTok ?? ""}
                placeholder="0.15"
              />
            </Field>
            <Field
              label={t.admin.providers.outputUsPer1MTokens}
              htmlFor="prov-out"
            >
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
            label={t.admin.providers.setAMonthlyTokenLimit}
            description={t.admin.providers.warnsOnTheStatusPageAt80And100}
            checked={limit}
            onChange={(e) => setLimit(e.target.checked)}
          />
          {limit ? (
            <div className="space-y-3 pl-6.5">
              <Field
                label={t.admin.providers.tokensPerMonthInputOutput}
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
                label={t.admin.providers.stopSendingImportsHereOnceReached}
                description={
                  t.admin.providers
                    .importsUseTheFallbackProviderInsteadOrFailWithAClearMessage
                }
                defaultChecked={existing?.pauseAtLimit ?? false}
              />
            </div>
          ) : null}
          {existing?.monthlyTokenLimit ? (
            <p className="text-ink-3 text-[13px]">
              {t.admin.providers.usedThisMonth(
                integer.format(existing.tokensThisMonth),
              )}
            </p>
          ) : null}
        </fieldset>
      </form>
    </Drawer>
  );
}
