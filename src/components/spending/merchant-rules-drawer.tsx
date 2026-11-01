"use client";

import { useState } from "react";
import { categoryLabel, useT } from "~/i18n/client";
import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/dialog";
import { Field, Input, Select } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
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
  const [deleting, setDeleting] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const create = api.merchantRules.create.useMutation();
  const update = api.merchantRules.update.useMutation();
  const remove = api.merchantRules.remove.useMutation();
  const error = create.error ?? update.error ?? remove.error ?? rules.error;
  const busy = create.isPending || update.isPending || remove.isPending;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const values = {
      pattern: formText(form, "pattern"),
      categoryId: formText(form, "categoryId"),
    };
    if (editing) await update.mutateAsync({ ...values, id: editing.id });
    else await create.mutateAsync(values);
    formElement.reset();
    setEditing(null);
    setFlash(
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
        {flash ? <Notice tone="success">{flash}</Notice> : null}
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
            <Select
              id="rule-category"
              name="categoryId"
              required
              defaultValue={editing?.categoryId ?? ""}
            >
              <option value="" disabled>
                {t.spending.merchantRulesDrawer.chooseACategory}
              </option>
              {orderCategories(categories).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? "— " : ""}
                  {categoryLabel(t, c.name)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>
              {editing
                ? t.spending.merchantRulesDrawer.saveRule
                : t.spending.merchantRulesDrawer.addRule}
            </Button>
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(null)}
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
                    setFlash(null);
                    create.reset();
                    update.reset();
                    remove.reset();
                  }}
                >
                  {t.common.actions.edit}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={remove.isPending && deleting === rule.id}
                  disabled={busy}
                  onClick={() => {
                    if (deleting !== rule.id) {
                      setDeleting(rule.id);
                      return;
                    }
                    void remove
                      .mutateAsync({ id: rule.id })
                      .then(async () => {
                        setDeleting(null);
                        if (editing?.id === rule.id) setEditing(null);
                        await utils.merchantRules.list.invalidate();
                        await utils.merchantRules.preview.invalidate();
                      })
                      .catch(() => undefined);
                  }}
                >
                  {deleting === rule.id
                    ? t.spending.merchantRulesDrawer.confirmDelete
                    : t.common.actions.delete}
                </Button>
                {deleting === rule.id ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleting(null)}
                  >
                    {t.common.actions.cancel}
                  </Button>
                ) : null}
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
