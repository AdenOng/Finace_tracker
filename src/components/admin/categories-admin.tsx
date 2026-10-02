"use client";

import { Plus, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/dialog";
import { Field, Input, Select, Textarea } from "~/components/ui/field";
import { Notice, Section, Tag } from "~/components/ui/panel";
import { cn } from "~/lib/cn";
import { api, type RouterOutputs } from "~/trpc/react";
import { formText } from "~/lib/form";

type Category = RouterOutputs["admin"]["categories"]["list"][number];
type Kind = Category["kind"];

const swatches = [
  "#D9622B",
  "#5E8C31",
  "#2F6FB0",
  "#B03A7A",
  "#6B5BB5",
  "#8A4FD8",
  "#7A5230",
  "#1F9C8A",
  "#C9406A",
  "#2591B8",
  "#D4A017",
  "#7E7E7E",
];

function swallow(fn: () => Promise<unknown>) {
  return () => void fn().catch(() => undefined);
}

export function CategoriesAdmin() {
  const utils = api.useUtils();
  const [rows] = api.admin.categories.list.useSuspenseQuery();
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [archiving, setArchiving] = useState<Category | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const invalidate = () => utils.admin.categories.list.invalidate();
  const restore = api.admin.categories.restore.useMutation({
    onSuccess: invalidate,
  });
  const restoreDefaults = api.admin.categories.restoreDefaults.useMutation({
    onSuccess: async (r) => {
      const n = r.inserted + r.unarchived;
      setFlash(
        n === 0
          ? "All default categories are already present."
          : `Restored ${n} default categor${n === 1 ? "y" : "ies"}.`,
      );
      await invalidate();
    },
  });

  const { active, archived, childrenOf } = useMemo(() => {
    const active = rows.filter((r) => !r.archivedAt);
    const childrenOf = new Map<string, Category[]>();
    for (const r of active) {
      if (r.parentId)
        childrenOf.set(r.parentId, [...(childrenOf.get(r.parentId) ?? []), r]);
    }
    return { active, archived: rows.filter((r) => r.archivedAt), childrenOf };
  }, [rows]);

  const topLevel = active.filter((r) => !r.parentId);
  const groups: { kind: Kind; title: string; description: string }[] = [
    {
      kind: "expense",
      title: "Spending",
      description: "Where money goes. Counted in spending reports.",
    },
    {
      kind: "income",
      title: "Income",
      description: "Money arriving that is not a transfer.",
    },
    {
      kind: "transfer",
      title: "Transfers",
      description:
        "Moves between your own accounts. Excluded from spending so nothing is double-counted.",
    },
  ];

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-2 max-w-xl text-sm">
          The AI may only answer with one of these keys, and reads each
          description to decide. Users can re-categorise any transaction
          afterwards.
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => restoreDefaults.mutate()}
            loading={restoreDefaults.isPending}
          >
            <RotateCcw className="size-4" />
            Restore defaults
          </Button>
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            Add category
          </Button>
        </div>
      </div>

      {flash ? (
        <Notice tone="success" className="mb-8">
          {flash}
        </Notice>
      ) : null}

      <div className="space-y-12">
        {groups.map((group) => {
          const parents = topLevel.filter((r) => r.kind === group.kind);
          if (parents.length === 0) return null;
          return (
            <Section
              key={group.kind}
              title={group.title}
              description={group.description}
            >
              <ul>
                {parents.map((parent) => (
                  <li
                    key={parent.id}
                    className="border-line border-b last:border-b-0"
                  >
                    <CategoryRow
                      category={parent}
                      onEdit={setEditing}
                      onArchive={setArchiving}
                    />
                    {childrenOf.get(parent.id)?.length ? (
                      <ul className="border-line mb-2 ml-7 border-l-2">
                        {childrenOf.get(parent.id)!.map((child) => (
                          <li key={child.id}>
                            <CategoryRow
                              category={child}
                              child
                              fallbackColor={parent.color}
                              onEdit={setEditing}
                              onArchive={setArchiving}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          );
        })}

        {archived.length ? (
          <Section
            title="Archived"
            description="Hidden from users and the AI. Restore to bring one back."
          >
            <ul className="flex flex-wrap gap-2">
              {archived.map((c) => (
                <li
                  key={c.id}
                  className="border-line flex items-center gap-2 border py-1 pr-1 pl-3 text-sm"
                >
                  {c.name}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => restore.mutate({ id: c.id })}
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>

      <CategoryDrawer
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        category={editing}
        parents={topLevel}
        onClose={() => setEditing(null)}
        onSaved={async (message) => {
          setEditing(null);
          setFlash(message);
          await invalidate();
        }}
      />
      <ArchiveDrawer
        key={archiving?.id ?? "none"}
        category={archiving}
        options={active}
        onClose={() => setArchiving(null)}
        onDone={async (message) => {
          setArchiving(null);
          setFlash(message);
          await invalidate();
        }}
      />
    </>
  );
}

function CategoryRow({
  category,
  child,
  fallbackColor,
  onEdit,
  onArchive,
}: {
  category: Category;
  child?: boolean;
  fallbackColor?: string | null;
  onEdit: (c: Category) => void;
  onArchive: (c: Category) => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 py-2.5",
        child ? "pl-4" : "",
      )}
    >
      <span
        className={cn("shrink-0", child ? "size-2.5" : "size-3.5")}
        style={{
          background: category.color ?? fallbackColor ?? "#9aa3a0",
          opacity: child && !category.color ? 0.55 : 1,
        }}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", child ? "font-medium" : "font-bold")}>
          {category.name}
          {!category.isSystem ? (
            <Tag tone="outline" className="ml-2">
              Custom
            </Tag>
          ) : null}
        </p>
        {category.aiHint ? (
          <p className="text-ink-3 truncate text-[13px]">{category.aiHint}</p>
        ) : null}
      </div>
      <span className="figures text-ink-3 hidden text-[13px] sm:block">
        {category.transactionCount} txn
        {category.transactionCount === 1 ? "" : "s"}
      </span>
      <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <Button variant="ghost" size="sm" onClick={() => onEdit(category)}>
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-loss"
          onClick={() => onArchive(category)}
        >
          Archive
        </Button>
      </div>
    </div>
  );
}

function CategoryDrawer({
  category,
  parents,
  onClose,
  onSaved,
}: {
  category: Category | "new" | null;
  parents: Category[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const existing = category && category !== "new" ? category : null;
  const [color, setColor] = useState(existing?.color ?? swatches[0]!);
  const create = api.admin.categories.create.useMutation();
  const update = api.admin.categories.update.useMutation();
  const error = create.error ?? update.error;
  const hasChildren = existing
    ? parents.some((p) => p.id === existing.id) && !existing.parentId
    : false;

  async function save(form: FormData) {
    const parentId = formText(form, "parentId") || null;
    const parent = parents.find((p) => p.id === parentId);
    const values = {
      name: formText(form, "name"),
      kind: (parent?.kind ?? formText(form, "kind")) as Kind,
      parentId,
      color,
      aiHint: formText(form, "aiHint"),
    };
    if (existing) {
      await update.mutateAsync({ id: existing.id, ...values });
      await onSaved(`Saved ${values.name}.`);
    } else {
      await create.mutateAsync(values);
      await onSaved(`Added ${values.name}.`);
    }
  }

  return (
    <Drawer
      open={category !== null}
      onClose={onClose}
      title={existing ? existing.name : "Add category"}
      description={
        existing
          ? `Key: ${existing.key} — stays the same if you rename it.`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="category-form"
            loading={create.isPending || update.isPending}
          >
            {existing ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <form
        id="category-form"
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          swallow(() => save(new FormData(event.currentTarget)))();
        }}
      >
        {error ? <Notice tone="error">{error.message}</Notice> : null}
        <Field label="Name" htmlFor="cat-name">
          <Input
            id="cat-name"
            name="name"
            required
            defaultValue={existing?.name}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Parent"
            htmlFor="cat-parent"
            hint={
              hasChildren
                ? "Has subcategories, so it stays top-level."
                : undefined
            }
          >
            <Select
              id="cat-parent"
              name="parentId"
              defaultValue={existing?.parentId ?? ""}
              disabled={hasChildren}
            >
              <option value="">None (top level)</option>
              {parents
                .filter((p) => p.id !== existing?.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field
            label="Type"
            htmlFor="cat-kind"
            hint="Subcategories inherit their parent's type."
          >
            <Select
              id="cat-kind"
              name="kind"
              defaultValue={existing?.kind ?? "expense"}
            >
              <option value="expense">Spending</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </Select>
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {swatches.map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`Colour ${s}`}
                aria-pressed={color === s}
                onClick={() => setColor(s)}
                className={cn(
                  "size-8 border-2",
                  color === s ? "border-ink" : "border-transparent",
                )}
                style={{
                  background: s,
                  boxShadow: color === s ? "inset 0 0 0 2px #fff" : undefined,
                }}
              />
            ))}
          </div>
        </fieldset>
        <Field
          label="Description for the AI"
          htmlFor="cat-hint"
          hint="Concrete examples work best, e.g. merchant names that belong here."
        >
          <Textarea
            id="cat-hint"
            name="aiHint"
            rows={3}
            defaultValue={existing?.aiHint ?? ""}
          />
        </Field>
      </form>
    </Drawer>
  );
}

function ArchiveDrawer({
  category,
  options,
  onClose,
  onDone,
}: {
  category: Category | null;
  options: Category[];
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const archive = api.admin.categories.archive.useMutation();
  const excluded = new Set(
    category
      ? [
          category.id,
          ...options.filter((o) => o.parentId === category.id).map((o) => o.id),
        ]
      : [],
  );
  const targets = options.filter((o) => !excluded.has(o.id));
  const fallback = targets.find((t) => t.key === "other")?.id ?? "";

  return (
    <Drawer
      open={category !== null}
      onClose={onClose}
      title={`Archive ${category?.name ?? ""}`}
      description="Archived categories disappear for users and the AI. You can restore them later."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            type="submit"
            form="archive-form"
            loading={archive.isPending}
          >
            Archive
          </Button>
        </>
      }
    >
      <form
        id="archive-form"
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!category) return;
          const reassignToId =
            formText(new FormData(event.currentTarget), "reassignToId") || null;
          swallow(async () => {
            const r = await archive.mutateAsync({
              id: category.id,
              reassignToId,
            });
            await onDone(
              `Archived ${r.archived} categor${r.archived === 1 ? "y" : "ies"}; ${r.transactionsMoved} transaction${r.transactionsMoved === 1 ? "" : "s"} moved.`,
            );
          })();
        }}
      >
        {archive.error ? (
          <Notice tone="error">{archive.error.message}</Notice>
        ) : null}
        {category && options.some((o) => o.parentId === category.id) ? (
          <Notice tone="warn">Its subcategories will be archived too.</Notice>
        ) : null}
        <Field label="Move existing transactions to" htmlFor="reassign">
          <Select id="reassign" name="reassignToId" defaultValue={fallback}>
            <option value="">Leave uncategorised</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.parentId ? "— " : ""}
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Drawer>
  );
}
