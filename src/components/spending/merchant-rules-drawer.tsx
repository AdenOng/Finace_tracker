"use client";

import { useState } from "react";
import { categoryLabel, useT } from "~/i18n/client";
import { Button } from "~/components/ui/button";
import { Combobox } from "~/components/ui/combobox";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { Drawer } from "~/components/ui/dialog";
import { Field, Input } from "~/components/ui/field";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Notice } from "~/components/ui/panel";
import { useFlash } from "~/components/ui/use-flash";
import { orderCategories } from "~/lib/categories";
import { errorMessage } from "~/lib/errors";
import { formText } from "~/lib/form";
import { api, type RouterOutputs } from "~/trpc/react";

type Rule = RouterOutputs["merchantRules"]["list"][number];

export function MerchantRulesDrawer({ onClose }: { onClose: () => void }) {
  const t = useT();
  const utils = api.useUtils();
  const rules = api.merchantRules.list.useQuery();
  const [categories] = api.catalog.categories.useSuspenseQuery();
  const [editing, setEditing] = useState<Rule | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const flash = useFlash();
  const create = api.merchantRules.create.useMutation();
  const update = api.merchantRules.update.useMutation();
  const remove = api.merchantRules.remove.useMutation();
  const error = create.error ?? update.error ?? remove.error ?? rules.error;
  const busy = create.isPending || update.isPending || remove.isPending;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryId) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const values = {
      pattern: formText(form, "pattern"),
      categoryId,
    };
    if (editing) await update.mutateAsync({ ...values, id: editing.id });
    else await create.mutateAsync(values);
    formElement.reset();
    setEditing(null);
    setCategoryId("");
    flash.success(
      t.spending.merchantRulesDrawer
        .ruleSavedNewUncategorisedTransactionsWillUse,
    );
    await utils.merchantRules.list.invalidate();
    await utils.merchantRules.preview.invalidate();
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={t.spending.merchantRulesDrawer.merchantRules}
      description={
        t.spending.merchantRulesDrawer.matchTextInTheMerchantOrDescription
      }
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t.common.actions.done}
        </Button>
      }
    >
      <div className="space-y-6">
        {error ? <Notice tone="error">{errorMessage(error)}</Notice> : null}
        <FlashNotice flash={flash.flash} onDismiss={flash.clear} />
        <form
          key={editing?.id ?? "new"}
          className="space-y-4"
          onSubmit={(e) => void save(e).catch(() => undefined)}
        >
          <Field
            label={t.spending.merchantRulesDrawer.textContains}
            htmlFor="rule-pattern"
            hint={
              t.spending.merchantRulesDrawer.forExampleFairpriceGrabOrNetflix
            }
          >
            <Input
              id="rule-pattern"
              name="pattern"
              required
              maxLength={200}
              defaultValue={editing?.pattern ?? ""}
            />
          </Field>
          <Field
            label={t.spending.merchantRulesDrawer.assignCategory}
            htmlFor="rule-category"
          >
            <Combobox
              id="rule-category"
              name="categoryId"
              required
              value={categoryId}
              onChange={setCategoryId}
              placeholder={t.spending.merchantRulesDrawer.chooseACategory}
              options={[
                {
                  value: "",
                  label: t.spending.merchantRulesDrawer.chooseACategory,
                  disabled: true,
                },
                ...orderCategories(categories).map((c) => ({
                  value: c.id,
                  label: `${c.parentId ? "— " : ""}${categoryLabel(t, c.name)}`,
                  keywords: c.name,
                })),
              ]}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" loading={busy} disabled={!categoryId}>
              {editing
                ? t.spending.merchantRulesDrawer.saveRule
                : t.spending.merchantRulesDrawer.addRule}
            </Button>
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditing(null);
                  setCategoryId("");
                }}
              >
                {t.spending.merchantRulesDrawer.cancelEdit}
              </Button>
            ) : null}
          </div>
        </form>
        <p className="text-ink-2 text-sm">
          {
            t.spending.merchantRulesDrawer
              .manualCategoriesAndTransfersArePreservedTo
          }
        </p>
        <ul className="divide-line divide-y">
          {rules.data?.map((rule) => (
            <li key={rule.id} className="space-y-2 py-4">
              <p className="font-semibold">
                {rule.pattern}{" "}
                <span className="text-ink-2 font-normal">
                  → {categoryLabel(t, rule.categoryName)}
                </span>
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditing(rule);
                    setCategoryId(rule.categoryId);
                    flash.clear();
                    create.reset();
                    update.reset();
                    remove.reset();
                  }}
                >
                  {t.common.actions.edit}
                </Button>
                <ConfirmButton
                  size="sm"
                  variant="danger"
                  loading={remove.isPending && remove.variables?.id === rule.id}
                  disabled={busy}
                  confirmLabel={t.spending.merchantRulesDrawer.confirmDelete}
                  onConfirm={() => {
                    void remove
                      .mutateAsync({ id: rule.id })
                      .then(async () => {
                        if (editing?.id === rule.id) {
                          setEditing(null);
                          setCategoryId("");
                        }
                        await utils.merchantRules.list.invalidate();
                        await utils.merchantRules.preview.invalidate();
                      })
                      .catch(() => undefined);
                  }}
                >
                  {t.common.actions.delete}
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
        {rules.data?.length === 0 ? (
          <p className="text-ink-2 text-sm">
            {t.spending.merchantRulesDrawer.noRulesYet}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
