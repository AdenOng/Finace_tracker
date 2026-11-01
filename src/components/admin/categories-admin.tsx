"use client";

import { useT, categoryLabel } from "~/i18n/client";
import type { Messages } from "~/i18n/messages";

import {
  Download,
  GripVertical,
  Plus,
  RotateCcw,
  Search,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { Drawer } from "~/components/ui/dialog";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Field, Input, Select, Textarea } from "~/components/ui/field";
import { EmptyState, Notice, Section, Tag } from "~/components/ui/panel";
import { useFlash } from "~/components/ui/use-flash";
import { cn } from "~/lib/cn";
import { downloadFile } from "~/lib/csv";
import { formText } from "~/lib/form";
import { api, type RouterInputs, type RouterOutputs } from "~/trpc/react";

type Category = RouterOutputs["admin"]["categories"]["list"][number];
type Kind = Category["kind"];
type ImportRow =
  RouterInputs["admin"]["categories"]["importJson"]["rows"][number];

const getSwatches = (t: Messages) => [
  { hex: "#D9622B", name: t.adminManage.categories.orange },
  { hex: "#5E8C31", name: t.adminManage.categories.green },
  { hex: "#2F6FB0", name: t.adminManage.categories.blue },
  { hex: "#B03A7A", name: t.adminManage.categories.magenta },
  { hex: "#6B5BB5", name: t.adminManage.categories.indigo },
  { hex: "#8A4FD8", name: t.adminManage.categories.violet },
  { hex: "#7A5230", name: t.adminManage.categories.brown },
  { hex: "#1F9C8A", name: t.adminManage.categories.teal },
  { hex: "#C9406A", name: t.adminManage.categories.rose },
  { hex: "#2591B8", name: t.adminManage.categories.sky },
  { hex: "#D4A017", name: t.adminManage.categories.mustard },
  { hex: "#7E7E7E", name: t.adminManage.categories.grey },
];

const getKindLabels = (t: Messages) => ({
  expense: t.adminManage.categories.spending,
  income: t.adminManage.categories.income,
  transfer: t.adminManage.categories.transfer,
});

function swallow(fn: () => Promise<unknown>) {
  return () => void fn().catch(() => undefined);
}

export function CategoriesAdmin() {
  const t = useT();
  const kindLabels = getKindLabels(t);
  const utils = api.useUtils();
  const [rows] = api.admin.categories.list.useSuspenseQuery();
  const defaults = api.admin.categories.defaultsPreview.useQuery();
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [archiving, setArchiving] = useState<{
    category: Category;
    mode: "archive" | "merge";
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState("");
  const { flash, success, error, clear } = useFlash();

  const invalidate = () =>
    Promise.all([
      utils.admin.categories.list.invalidate(),
      utils.admin.categories.defaultsPreview.invalidate(),
    ]);
  const restore = api.admin.categories.restore.useMutation({
    onMutate: clear,
    onSuccess: async (r) => {
      success(
        r.restored > 1
          ? t.adminManage.categories.restoredWithParent
          : t.adminManage.categories.categoryRestored,
      );
      await invalidate();
    },
    onError: error,
  });
  const restoreDefaults = api.admin.categories.restoreDefaults.useMutation({
    onMutate: clear,
    onSuccess: async (r) => {
      const n = r.inserted + r.unarchived;
      success(
        n === 0
          ? t.adminManage.categories.defaultsAlreadyPresent
          : t.adminManage.categories.defaultsRestored(n),
      );
      await invalidate();
    },
    onError: error,
  });
  const reorder = api.admin.categories.reorder.useMutation({
    onSettled: invalidate,
    onError: error,
  });

  const { active, archived, childrenOf, byId } = useMemo(() => {
    const active = rows.filter((r) => !r.archivedAt);
    const childrenOf = new Map<string, Category[]>();
    for (const r of active) {
      if (r.parentId)
        childrenOf.set(r.parentId, [...(childrenOf.get(r.parentId) ?? []), r]);
    }
    return {
      active,
      archived: rows.filter((r) => r.archivedAt),
      childrenOf,
      byId: new Map(rows.map((r) => [r.id, r])),
    };
  }, [rows]);

  const topLevel = active.filter((r) => !r.parentId);
  const q = query.trim().toLowerCase();
  const matches = (c: Category) =>
    !q ||
    c.name.toLowerCase().includes(q) ||
    categoryLabel(t, c.name).toLowerCase().includes(q) ||
    (c.aiHint?.toLowerCase().includes(q) ?? false);

  const missingDefaults =
    (defaults.data?.missing.length ?? 0) +
    (defaults.data?.archived.length ?? 0);

  function exportJson() {
    const keyOf = new Map(rows.map((r) => [r.id, r.key]));
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      categories: rows.map((r) => ({
        key: r.key,
        name: r.name,
        kind: r.kind,
        parentKey: r.parentId ? (keyOf.get(r.parentId) ?? null) : null,
        color: r.color,
        aiHint: r.aiHint,
        archived: !!r.archivedAt,
      })),
    };
    downloadFile(
      `finfolio-categories-${payload.exportedAt.slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  }

  function move(siblings: Category[], from: number, to: number) {
    if (to < 0 || to >= siblings.length || from === to) return;
    const ids = siblings.map((s) => s.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved!);
    // Show the new order straight away; the server confirms it.
    utils.admin.categories.list.setData(undefined, (old) =>
      old
        ?.map((c) => {
          const index = ids.indexOf(c.id);
          return index === -1 ? c : { ...c, sortOrder: (index + 1) * 10 };
        })
        .sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        ),
    );
    clear();
    reorder.mutate({ ids });
  }

  const groups: { kind: Kind; title: string; description: string }[] = [
    {
      kind: "expense",
      title: t.adminManage.categories.spending,
      description: t.adminManage.categories.spendingHelp,
    },
    {
      kind: "income",
      title: t.adminManage.categories.income,
      description: t.adminManage.categories.incomeHelp,
    },
    {
      kind: "transfer",
      title: t.adminManage.categories.transfers,
      description: t.adminManage.categories.transferHelp,
    },
  ];

  return (
    <>
      <p className="text-ink-2 mb-5 max-w-2xl text-sm">
        {t.adminManage.categories.taxonomyHelp}
      </p>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="text-ink-3 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            aria-label={t.adminManage.categories.searchCategories}
            placeholder={t.adminManage.categories.searchNameOrDescription}
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="ghost" onClick={exportJson}>
            <Download className="size-4" />
            {t.common.actions.export}
          </Button>
          <Button variant="ghost" onClick={() => setImporting(true)}>
            <Upload className="size-4" />
            {t.adminManage.categories.import}
          </Button>
          <ConfirmButton
            variant="secondary"
            disabled={missingDefaults === 0}
            title={
              missingDefaults === 0
                ? t.adminManage.categories.everyDefaultCategoryIsPresent
                : [
                    ...(defaults.data?.missing ?? []).map((n) =>
                      t.adminManage.categories.add(n),
                    ),
                    ...(defaults.data?.archived ?? []).map((n) =>
                      t.adminManage.categories.restoreNamed(n),
                    ),
                  ].join("\n")
            }
            confirmLabel={t.adminManage.categories.bringBack(missingDefaults)}
            loading={restoreDefaults.isPending}
            onConfirm={() => restoreDefaults.mutate()}
          >
            <RotateCcw className="size-4" />
            {missingDefaults
              ? t.adminManage.categories.restoreDefault(missingDefaults)
              : t.adminManage.categories.defaultsPresent}
          </ConfirmButton>
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            {t.adminManage.categories.addCategory}
          </Button>
        </div>
      </div>

      <FlashNotice flash={flash} className="mb-6" />

      <div className="space-y-6">
        {groups.map((group) => {
          const parents = topLevel.filter((r) => r.kind === group.kind);
          const visible = parents.filter(
            (p) => matches(p) || (childrenOf.get(p.id) ?? []).some(matches),
          );
          if (parents.length === 0 || visible.length === 0) return null;
          return (
            <Section
              key={group.kind}
              title={group.title}
              description={group.description}
            >
              <SortableList
                items={visible}
                disabled={!!q}
                onMove={(from, to) => move(parents, from, to)}
                render={(parent) => (
                  <>
                    <CategoryRow
                      category={parent}
                      onEdit={setEditing}
                      onArchive={(c, mode) =>
                        setArchiving({ category: c, mode })
                      }
                    />
                    {childrenOf.get(parent.id)?.length ? (
                      <div className="border-line mb-2 ml-7 border-l-2">
                        <SortableList
                          items={childrenOf
                            .get(parent.id)!
                            .filter((c) => !q || matches(c) || matches(parent))}
                          disabled={!!q}
                          onMove={(from, to) =>
                            move(childrenOf.get(parent.id)!, from, to)
                          }
                          render={(child) => (
                            <CategoryRow
                              category={child}
                              child
                              fallbackColor={parent.color}
                              onEdit={setEditing}
                              onArchive={(c, mode) =>
                                setArchiving({ category: c, mode })
                              }
                            />
                          )}
                        />
                      </div>
                    ) : null}
                  </>
                )}
              />
            </Section>
          );
        })}
        {q && !active.some(matches) ? (
          <EmptyState title={t.adminManage.categories.noMatches}>
            {t.adminManage.categories.tryAnotherWord}
          </EmptyState>
        ) : null}

        {archived.length ? (
          <Section
            title={t.adminManage.categories.archived}
            description={t.adminManage.categories.archivedHelp}
          >
            <ul className="flex flex-wrap gap-2">
              {archived.map((c) => {
                const parent = c.parentId ? byId.get(c.parentId) : undefined;
                return (
                  <li
                    key={c.id}
                    className="border-line rounded-ctl flex items-center gap-2 border py-1 pr-1 pl-3 text-sm"
                  >
                    <span>
                      {parent ? (
                        <span className="text-ink-3">
                          {categoryLabel(t, parent.name)} ›{" "}
                        </span>
                      ) : null}
                      {categoryLabel(t, c.name)}
                      <span className="text-ink-3 ml-1.5 text-[12px]">
                        {kindLabels[c.kind]}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={
                        restore.isPending && restore.variables?.id === c.id
                      }
                      onClick={() => restore.mutate({ id: c.id })}
                    >
                      {t.adminManage.categories.restore}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}
      </div>

      <CategoryDrawer
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        category={editing}
        parents={topLevel}
        // Archived subcategories count too: the server keeps their parent top-level as well.
        hasChildren={
          editing !== null &&
          editing !== "new" &&
          rows.some((r) => r.parentId === editing.id)
        }
        onClose={() => setEditing(null)}
        onSaved={async (message) => {
          setEditing(null);
          success(message);
          await invalidate();
        }}
      />
      <ArchiveDrawer
        key={`${archiving?.category.id ?? "none"}-${archiving?.mode}`}
        category={archiving?.category ?? null}
        mode={archiving?.mode ?? "archive"}
        options={active}
        onClose={() => setArchiving(null)}
        onDone={async (message) => {
          setArchiving(null);
          success(message);
          await invalidate();
        }}
      />
      <ImportDrawer
        open={importing}
        onClose={() => setImporting(false)}
        onDone={async (message) => {
          setImporting(false);
          success(message);
          await invalidate();
        }}
      />
    </>
  );
}

/**
 * A list that can be reordered by dragging a row's handle, or with the arrow keys while the handle
 * has focus.
 */
function SortableList<T extends { id: string; name: string }>({
  items,
  render,
  onMove,
  disabled,
}: {
  items: T[];
  render: (item: T) => React.ReactNode;
  onMove: (from: number, to: number) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  return (
    <ul>
      {items.map((item, index) => (
        <li
          key={item.id}
          onDragOver={(e) => {
            if (dragIndex === null) return;
            e.preventDefault();
            setOverIndex(index);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex !== null) onMove(dragIndex, index);
            setDragIndex(null);
            setOverIndex(null);
          }}
          className={cn(
            "border-line flex items-start gap-1 border-b last:border-b-0",
            dragIndex === index && "opacity-40",
            overIndex === index &&
              dragIndex !== null &&
              dragIndex !== index &&
              (dragIndex < index
                ? "shadow-[inset_0_-2px_0_var(--color-brand)]"
                : "shadow-[inset_0_2px_0_var(--color-brand)]"),
          )}
        >
          {disabled ? null : (
            <button
              type="button"
              draggable
              aria-label={t.adminManage.categories.reorderLabel(item.name)}
              title={t.adminManage.categories.dragToReorder}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                setDragIndex(index);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  onMove(index, index + (e.key === "ArrowUp" ? -1 : 1));
                }
              }}
              className="text-ink-3 hover:text-ink rounded-ctl mt-2 grid size-7 shrink-0 cursor-grab place-items-center active:cursor-grabbing"
            >
              <GripVertical className="size-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">{render(item)}</div>
        </li>
      ))}
    </ul>
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
  onArchive: (c: Category, mode: "archive" | "merge") => void;
}) {
  const t = useT();
  const count = t.adminManage.categories.transactionCount(
    category.transactionCount,
  );
  return (
    <div className={cn("flex items-center gap-3 py-2.5", child ? "pl-2" : "")}>
      <span
        className={cn(
          "shrink-0 rounded-[3px]",
          child ? "size-2.5" : "size-3.5",
        )}
        style={{
          background: category.color ?? fallbackColor ?? "#9aa3a0",
          opacity: child && !category.color ? 0.55 : 1,
        }}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", child ? "font-medium" : "font-bold")}>
          {categoryLabel(t, category.name)}
          {!category.isSystem ? (
            <Tag tone="outline" className="ml-2">
              {t.adminManage.categories.custom}
            </Tag>
          ) : null}
          <span className="figures text-ink-3 ml-2 text-[12px] font-normal sm:hidden">
            {count}
          </span>
        </p>
        {category.aiHint ? (
          <p className="text-ink-3 truncate text-[13px]">{category.aiHint}</p>
        ) : null}
      </div>
      <span className="figures text-ink-3 hidden text-[13px] whitespace-nowrap sm:block">
        {count}
      </span>
      <div className="flex shrink-0 gap-0.5">
        <Button variant="ghost" size="sm" onClick={() => onEdit(category)}>
          {t.common.actions.edit}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-ink-2"
          onClick={() => onArchive(category, "merge")}
        >
          {t.adminManage.categories.merge}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-loss"
          onClick={() => onArchive(category, "archive")}
        >
          {t.common.actions.archive}
        </Button>
      </div>
    </div>
  );
}

function CategoryDrawer({
  category,
  parents,
  hasChildren,
  onClose,
  onSaved,
}: {
  category: Category | "new" | null;
  parents: Category[];
  hasChildren: boolean;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const t = useT();
  const swatches = getSwatches(t);
  const existing = category && category !== "new" ? category : null;
  const [color, setColor] = useState(existing?.color ?? swatches[0]!.hex);
  const [parentId, setParentId] = useState(existing?.parentId ?? "");
  const [kind, setKind] = useState<Kind>(existing?.kind ?? "expense");
  const create = api.admin.categories.create.useMutation();
  const update = api.admin.categories.update.useMutation();
  const error = create.error ?? update.error;
  const parent = parents.find((p) => p.id === parentId);

  async function save(form: FormData) {
    const values = {
      name: formText(form, "name"),
      kind: parent?.kind ?? kind,
      parentId: parentId || null,
      color,
      aiHint: formText(form, "aiHint"),
    };
    if (existing) {
      await update.mutateAsync({ id: existing.id, ...values });
      await onSaved(t.adminManage.categories.saved(values.name));
    } else {
      await create.mutateAsync(values);
      await onSaved(t.adminManage.categories.added(values.name));
    }
  }

  return (
    <Drawer
      open={category !== null}
      onClose={onClose}
      title={
        existing
          ? categoryLabel(t, existing.name)
          : t.adminManage.categories.addCategory
      }
      description={
        existing ? t.adminManage.categories.keyHelp(existing.key) : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.actions.cancel}
          </Button>
          <Button
            type="submit"
            form="category-form"
            loading={create.isPending || update.isPending}
          >
            {existing ? t.common.actions.save : t.common.actions.add}
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
        <Field label={t.adminManage.categories.name} htmlFor="cat-name">
          <Input
            id="cat-name"
            name="name"
            required
            defaultValue={existing?.name}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label={t.adminManage.categories.parent}
            htmlFor="cat-parent"
            hint={hasChildren ? t.adminManage.categories.parentHelp : undefined}
          >
            <Select
              id="cat-parent"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              disabled={hasChildren}
            >
              <option value="">{t.adminManage.categories.noneTopLevel}</option>
              {parents
                .filter((p) => p.id !== existing?.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {categoryLabel(t, p.name)}
                  </option>
                ))}
            </Select>
          </Field>
          <Field
            label={t.common.fields.type}
            htmlFor="cat-kind"
            hint={
              parent
                ? t.adminManage.categories.inheritedTypeHelp(parent.name)
                : undefined
            }
          >
            <Select
              id="cat-kind"
              value={parent?.kind ?? kind}
              disabled={!!parent}
              onChange={(e) => setKind(e.target.value as Kind)}
            >
              <option value="expense">
                {t.adminManage.categories.spending}
              </option>
              <option value="income">{t.adminManage.categories.income}</option>
              <option value="transfer">
                {t.adminManage.categories.transfer}
              </option>
            </Select>
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold">
            {t.adminManage.categories.colour}
          </legend>
          <div className="flex flex-wrap gap-2">
            {swatches.map((s) => (
              <button
                key={s.hex}
                type="button"
                aria-label={s.name}
                title={s.name}
                aria-pressed={color === s.hex}
                onClick={() => setColor(s.hex)}
                className={cn(
                  "rounded-ctl size-8 border-2",
                  color === s.hex ? "border-ink" : "border-transparent",
                )}
                style={{
                  background: s.hex,
                  boxShadow:
                    color === s.hex ? "inset 0 0 0 2px #fff" : undefined,
                }}
              />
            ))}
          </div>
        </fieldset>
        <Field
          label={t.adminManage.categories.descriptionForTheAI}
          htmlFor="cat-hint"
          hint={t.adminManage.categories.descriptionHelp}
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
  mode,
  options,
  onClose,
  onDone,
}: {
  category: Category | null;
  mode: "archive" | "merge";
  options: Category[];
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const t = useT();
  const archive = api.admin.categories.archive.useMutation();
  const children = category
    ? options.filter((o) => o.parentId === category.id)
    : [];
  const excluded = new Set(
    category ? [category.id, ...children.map((o) => o.id)] : [],
  );
  const targets = options.filter((o) => !excluded.has(o.id));
  const affected = category
    ? category.transactionCount +
      children.reduce((total, o) => total + o.transactionCount, 0)
    : 0;
  const fallback =
    mode === "merge" ? "" : (targets.find((t) => t.key === "other")?.id ?? "");
  const merge = mode === "merge";

  return (
    <Drawer
      open={category !== null}
      onClose={onClose}
      title={
        merge
          ? t.adminManage.categories.mergeNamed(category?.name ?? "")
          : t.adminManage.categories.archive(category?.name ?? "")
      }
      description={
        merge
          ? t.adminManage.categories.mergeHelp
          : t.adminManage.categories.archiveHelp
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.actions.cancel}
          </Button>
          <Button
            variant={merge ? "primary" : "danger"}
            type="submit"
            form="archive-form"
            loading={archive.isPending}
          >
            {merge ? t.adminManage.categories.merge : t.common.actions.archive}
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
            const target = targets.find((t) => t.id === reassignToId);
            await onDone(
              merge && target
                ? t.adminManage.categories.mergeResult(
                    category.name,
                    target.name,
                    r.transactionsMoved,
                  )
                : t.adminManage.categories.archiveResult(
                    r.archived,
                    r.transactionsMoved,
                  ),
            );
          })();
        }}
      >
        {archive.error ? (
          <Notice tone="error">{archive.error.message}</Notice>
        ) : null}
        {children.length ? (
          <Notice tone="warn">
            {t.adminManage.categories.childrenArchived(children.length)}
          </Notice>
        ) : null}
        {affected > 0 ? (
          <Notice tone="warn">
            {t.adminManage.categories.recategorises(affected, merge)}
          </Notice>
        ) : null}
        <Field
          label={
            merge
              ? t.adminManage.categories.mergeInto
              : t.adminManage.categories.moveExistingTransactionsTo
          }
          htmlFor="reassign"
        >
          <Select
            id="reassign"
            name="reassignToId"
            defaultValue={fallback}
            required={merge}
          >
            <option value="" disabled={merge}>
              {merge
                ? t.adminManage.categories.chooseACategory
                : t.adminManage.categories.leaveUncategorised}
            </option>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.parentId ? "— " : ""}
                {categoryLabel(t, target.name)}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Drawer>
  );
}

function ImportDrawer({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const preview = api.admin.categories.importJson.useMutation();
  const apply = api.admin.categories.importJson.useMutation();

  async function read(file: File) {
    setParseError(null);
    setRows(null);
    preview.reset();
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const list = Array.isArray(raw)
        ? raw
        : (raw as { categories?: unknown }).categories;
      if (!Array.isArray(list) || list.length === 0)
        throw new Error(t.adminManage.categories.noCategoriesFoundInThatFile);
      const parsed = list as ImportRow[];
      setRows(parsed);
      preview.mutate({ rows: parsed, dryRun: true });
    } catch (e) {
      setParseError(
        e instanceof SyntaxError
          ? t.adminManage.categories.thatFileIsNotValidJSON
          : e instanceof Error
            ? e.message
            : t.adminManage.categories.couldNotReadThatFile,
      );
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t.adminManage.categories.importCategories}
      description={t.adminManage.categories.importHelp}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.actions.cancel}
          </Button>
          <Button
            disabled={!rows || !preview.data}
            loading={apply.isPending}
            onClick={() =>
              rows &&
              void apply
                .mutateAsync({ rows, dryRun: false })
                .then((r) =>
                  onDone(
                    t.adminManage.categories.importResult(
                      r.created,
                      r.updated,
                      r.unchanged,
                    ),
                  ),
                )
                .catch(() => undefined)
            }
          >
            {t.adminManage.categories.applyImport}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Button variant="secondary" onClick={() => fileInput.current?.click()}>
          <Upload className="size-4" />
          {t.adminManage.categories.chooseAJSONFile}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void read(file);
          }}
        />
        {parseError ? <Notice tone="error">{parseError}</Notice> : null}
        {preview.error ? (
          <Notice tone="error">{preview.error.message}</Notice>
        ) : null}
        {apply.error ? (
          <Notice tone="error">{apply.error.message}</Notice>
        ) : null}
        {preview.isPending ? (
          <p className="text-ink-3 text-sm">
            {t.adminManage.categories.checkingTheFile}
          </p>
        ) : null}
        {preview.data ? (
          <Notice tone="info">
            <strong>{t.adminManage.categories.fileCount(rows?.length)}</strong>
            {t.adminManage.categories.previewChanges(
              preview.data.created,
              preview.data.updated,
              preview.data.unchanged,
            )}
            {preview.data.archivedWithParent
              ? t.adminManage.categories.importArchivedChildren(
                  preview.data.archivedWithParent,
                )
              : ""}{" "}
            {t.adminManage.categories.importArchiveHelp}
          </Notice>
        ) : null}
      </div>
    </Drawer>
  );
}
