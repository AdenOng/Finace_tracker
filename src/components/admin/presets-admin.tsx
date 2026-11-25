"use client";

import { useT } from "~/i18n/client";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Field, Select } from "~/components/ui/field";
import { Notice, Section } from "~/components/ui/panel";
import { useFlash } from "~/components/ui/use-flash";
import { api, type RouterOutputs } from "~/trpc/react";

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
      <FlashNotice flash={flash} onDismiss={clear} />
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
