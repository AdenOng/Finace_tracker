"use client";

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

const swatches: { hex: string; name: string }[] = [
  { hex: "#D9622B", name: "Orange" },
  { hex: "#5E8C31", name: "Green" },
  { hex: "#2F6FB0", name: "Blue" },
  { hex: "#B03A7A", name: "Magenta" },
  { hex: "#6B5BB5", name: "Indigo" },
  { hex: "#8A4FD8", name: "Violet" },
  { hex: "#7A5230", name: "Brown" },
  { hex: "#1F9C8A", name: "Teal" },
  { hex: "#C9406A", name: "Rose" },
  { hex: "#2591B8", name: "Sky" },
  { hex: "#D4A017", name: "Mustard" },
  { hex: "#7E7E7E", name: "Grey" },
];

const kindLabels: Record<Kind, string> = {
  expense: "Spending",
  income: "Income",
  transfer: "Transfer",
};

function swallow(fn: () => Promise<unknown>) {
  return () => void fn().catch(() => undefined);
}

export function CategoriesAdmin() {
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
          ? "Restored, along with its parent category."
          : "Category restored.",
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
          ? "All default categories are already present."
          : `Restored ${n} default categor${n === 1 ? "y" : "ies"}.`,
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
      <p className="text-ink-2 mb-5 max-w-2xl text-sm">
        The AI may only answer with one of these categories, and reads each
        description to decide. People can re-categorise any transaction
        afterwards. Drag the handle to reorder.
      </p>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="text-ink-3 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            aria-label="Search categories"
            placeholder="Search name or description"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="ghost" onClick={exportJson}>
            <Download className="size-4" />
            Export
          </Button>
          <Button variant="ghost" onClick={() => setImporting(true)}>
            <Upload className="size-4" />
            Import
          </Button>
          <ConfirmButton
            variant="secondary"
            disabled={missingDefaults === 0}
            title={
              missingDefaults === 0
                ? "Every default category is present"
                : [
                    ...(defaults.data?.missing ?? []).map((n) => `Add ${n}`),
                    ...(defaults.data?.archived ?? []).map(
                      (n) => `Restore ${n}`,
                    ),
                  ].join("\n")
            }
            confirmLabel={`Bring back ${missingDefaults}?`}
            loading={restoreDefaults.isPending}
            onConfirm={() => restoreDefaults.mutate()}
          >
            <RotateCcw className="size-4" />
            {missingDefaults
              ? `Restore ${missingDefaults} default${missingDefaults === 1 ? "" : "s"}`
              : "Defaults present"}
          </ConfirmButton>
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            Add category
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
          <EmptyState title="No matches">Try another word.</EmptyState>
        ) : null}

        {archived.length ? (
          <Section
            title="Archived"
            description="Hidden from people and the AI. Restore to bring one back."
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
                        <span className="text-ink-3">{parent.name} › </span>
                      ) : null}
                      {c.name}
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
                      Restore
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
              aria-label={`Move ${item.name}. Use the up and down arrow keys.`}
              title="Drag to reorder"
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
  const count = `${category.transactionCount} txn${category.transactionCount === 1 ? "" : "s"}`;
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
          {category.name}
          {!category.isSystem ? (
            <Tag tone="outline" className="ml-2">
              Custom
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
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-ink-2"
          onClick={() => onArchive(category, "merge")}
        >
          Merge
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-loss"
          onClick={() => onArchive(category, "archive")}
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
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
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
            hint={
              parent
                ? `Set by ${parent.name}: subcategories share their parent's type.`
                : undefined
            }
          >
            <Select
              id="cat-kind"
              value={parent?.kind ?? kind}
              disabled={!!parent}
              onChange={(e) => setKind(e.target.value as Kind)}
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
          ? `Merge ${category?.name ?? ""}`
          : `Archive ${category?.name ?? ""}`
      }
      description={
        merge
          ? "Moves its transactions and merchant rules into another category, then archives it. Use it to fold duplicates together."
          : "Archived categories disappear for people and the AI. You can restore them later."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={merge ? "primary" : "danger"}
            type="submit"
            form="archive-form"
            loading={archive.isPending}
          >
            {merge ? "Merge" : "Archive"}
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
                ? `Merged ${category.name} into ${target.name}; ${r.transactionsMoved} transaction${r.transactionsMoved === 1 ? "" : "s"} moved.`
                : `Archived ${r.archived} categor${r.archived === 1 ? "y" : "ies"}; ${r.transactionsMoved} transaction${r.transactionsMoved === 1 ? "" : "s"} moved.`,
            );
          })();
        }}
      >
        {archive.error ? (
          <Notice tone="error">{archive.error.message}</Notice>
        ) : null}
        {children.length ? (
          <Notice tone="warn">
            Its {children.length} subcategor
            {children.length === 1 ? "y is" : "ies are"} archived too, and their
            transactions move with it.
          </Notice>
        ) : null}
        {affected > 0 ? (
          <Notice tone="warn">
            This recategorises {affected} transaction
            {affected === 1 ? "" : "s"} across all users. Merchant rules move
            with them
            {merge ? "" : ", or are deleted if you leave them uncategorised"}.
            The change is recorded in the activity log.
          </Notice>
        ) : null}
        <Field
          label={merge ? "Merge into" : "Move existing transactions to"}
          htmlFor="reassign"
        >
          <Select
            id="reassign"
            name="reassignToId"
            defaultValue={fallback}
            required={merge}
          >
            <option value="" disabled={merge}>
              {merge ? "Choose a category" : "Leave uncategorised"}
            </option>
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

function ImportDrawer({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
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
        throw new Error("No categories found in that file.");
      const parsed = list as ImportRow[];
      setRows(parsed);
      preview.mutate({ rows: parsed, dryRun: true });
    } catch (e) {
      setParseError(
        e instanceof SyntaxError
          ? "That file is not valid JSON."
          : e instanceof Error
            ? e.message
            : "Could not read that file.",
      );
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Import categories"
      description="Use a file from Export. Categories are matched by key: new keys are added, existing ones updated. Nothing is deleted."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
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
                    `Imported: ${r.created} added, ${r.updated} updated, ${r.unchanged} unchanged.`,
                  ),
                )
                .catch(() => undefined)
            }
          >
            Apply import
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Button variant="secondary" onClick={() => fileInput.current?.click()}>
          <Upload className="size-4" />
          Choose a JSON file
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
          <p className="text-ink-3 text-sm">Checking the file…</p>
        ) : null}
        {preview.data ? (
          <Notice tone="info">
            <strong>{rows?.length} categories in the file.</strong> Applying
            adds {preview.data.created}, updates {preview.data.updated} and
            leaves {preview.data.unchanged} as they are.
            {preview.data.archivedWithParent
              ? ` ${preview.data.archivedWithParent} subcategor${preview.data.archivedWithParent === 1 ? "y is" : "ies are"} archived along with an archived parent.`
              : ""}{" "}
            Archiving through an import never moves transactions.
          </Notice>
        ) : null}
      </div>
    </Drawer>
  );
}
