"use client";

import { useT, categoryLabel } from "~/i18n/client";
import type { Messages } from "~/i18n/messages";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/dialog";
import { Field, Input, Select, Textarea } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { cn } from "~/lib/cn";
import { formText } from "~/lib/form";
import { api, type RouterInputs, type RouterOutputs } from "~/trpc/react";

export type Category = RouterOutputs["admin"]["categories"]["list"][number];

export type Kind = Category["kind"];

export type ImportRow =
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

function swallow(fn: () => Promise<unknown>) {
  return () => void fn().catch(() => undefined);
}

export function CategoryDrawer({
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

export function ArchiveDrawer({
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

export function ImportDrawer({
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
