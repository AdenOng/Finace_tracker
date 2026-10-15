"use client";

import { useState } from "react";
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
    setFlash("Rule saved. New uncategorised transactions will use your rules.");
    await utils.merchantRules.list.invalidate();
    await utils.merchantRules.preview.invalidate();
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Merchant rules"
      description="Match text in the merchant or description, ignoring case. Longer patterns win; ties use the oldest rule."
      footer={
        <Button variant="ghost" onClick={onClose}>
          Done
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
            label="Text contains"
            htmlFor="rule-pattern"
            hint="For example: fairprice, grab, or netflix."
          >
            <Input
              id="rule-pattern"
              name="pattern"
              required
              maxLength={200}
              defaultValue={editing?.pattern ?? ""}
            />
          </Field>
          <Field label="Assign category" htmlFor="rule-category">
            <Select
              id="rule-category"
              name="categoryId"
              required
              defaultValue={editing?.categoryId ?? ""}
            >
              <option value="" disabled>
                Choose a category
              </option>
              {orderCategories(categories).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? "— " : ""}
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>
              {editing ? "Save rule" : "Add rule"}
            </Button>
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(null)}
              >
                Cancel edit
              </Button>
            ) : null}
          </div>
        </form>
        <p className="text-ink-2 text-sm">
          Manual categories and transfers are preserved. To apply rules to
          existing entries, select transactions in Spending and choose Apply
          rules.
        </p>
        <ul className="divide-line divide-y">
          {rules.data?.map((rule) => (
            <li key={rule.id} className="space-y-2 py-4">
              <p className="font-semibold">
                {rule.pattern}{" "}
                <span className="text-ink-2 font-normal">
                  → {rule.categoryName}
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
                  Edit
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
                  {deleting === rule.id ? "Confirm delete" : "Delete"}
                </Button>
                {deleting === rule.id ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleting(null)}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {rules.data?.length === 0 ? (
          <p className="text-ink-2 text-sm">No rules yet.</p>
        ) : null}
      </div>
    </Drawer>
  );
}
