"use client";

import { useT, categoryLabel } from "~/i18n/client";
import type { Messages } from "~/i18n/messages";
import { Download, Plus, RotateCcw, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Input } from "~/components/ui/field";
import { EmptyState, Section } from "~/components/ui/panel";
import { useFlash } from "~/components/ui/use-flash";
import { downloadFile } from "~/lib/csv";
import { api } from "~/trpc/react";
import {
  CategoryDrawer,
  ArchiveDrawer,
  ImportDrawer,
  type Category,
  type Kind,
} from "./category-drawers";
import { SortableList, CategoryRow } from "./category-list";

const getKindLabels = (t: Messages) => ({
  expense: t.adminManage.categories.spending,
  income: t.adminManage.categories.income,
  transfer: t.adminManage.categories.transfer,
});

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

      <FlashNotice flash={flash} onDismiss={clear} className="mb-6" />

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
