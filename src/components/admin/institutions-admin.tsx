"use client";

import { Plus, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/dialog";
import {
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
} from "~/components/ui/field";
import { EmptyState, Notice, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { FilterTabs } from "~/components/ui/tabs";
import { api, type RouterOutputs } from "~/trpc/react";
import { formText } from "~/lib/form";

type Institution = RouterOutputs["admin"]["institutions"]["list"][number];
type Kind = Institution["kind"];
type Method = Institution["ingestMethods"][number];

const kindLabels: Record<Kind, string> = {
  broker: "Broker",
  bank: "Bank",
  card_issuer: "Card issuer",
  crypto_exchange: "Crypto exchange",
  depository: "Depository",
  other: "Other",
};

const kindPlurals: Record<Kind, string> = {
  broker: "Brokers",
  bank: "Banks",
  card_issuer: "Card issuers",
  crypto_exchange: "Crypto exchanges",
  depository: "Depositories",
  other: "Other",
};

const methodLabels: Record<Method, string> = {
  api: "API sync",
  csv: "CSV",
  statement_ocr: "Statement reading",
};

const apiAdapters = [
  { value: "", label: "None" },
  { value: "ibkr_flex", label: "IBKR Flex Web Service" },
  { value: "longbridge", label: "Longbridge OpenAPI" },
  { value: "moomoo_opend", label: "moomoo OpenD" },
];

type Filter = "all" | Kind | "archived";

export function InstitutionsAdmin() {
  const utils = api.useUtils();
  const [rows] = api.admin.institutions.list.useSuspenseQuery();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Institution | "new" | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const invalidate = () => utils.admin.institutions.list.invalidate();
  const restoreDefaults = api.admin.institutions.restoreDefaults.useMutation({
    onSuccess: async (r) => {
      setFlash(
        r.inserted + r.unarchived === 0
          ? "All defaults are already present."
          : `Restored ${r.inserted + r.unarchived} default institution${r.inserted + r.unarchived === 1 ? "" : "s"}.`,
      );
      await invalidate();
    },
  });
  const restore = api.admin.institutions.restore.useMutation({
    onSuccess: invalidate,
  });

  const counts = useMemo(() => {
    const c: Partial<Record<Filter, number>> = { all: 0, archived: 0 };
    for (const r of rows) {
      if (r.archivedAt) c.archived = (c.archived ?? 0) + 1;
      else {
        c.all = (c.all ?? 0) + 1;
        c[r.kind] = (c[r.kind] ?? 0) + 1;
      }
    }
    return c;
  }, [rows]);

  const visible = rows.filter((r) => {
    if (filter === "archived" ? !r.archivedAt : r.archivedAt) return false;
    if (filter !== "all" && filter !== "archived" && r.kind !== filter)
      return false;
    return query ? r.name.toLowerCase().includes(query.toLowerCase()) : true;
  });

  const tabs: { value: Filter; label: string; count?: number }[] = [
    { value: "all", label: "Active", count: counts.all },
    ...(
      [
        "broker",
        "bank",
        "card_issuer",
        "crypto_exchange",
        "depository",
      ] as const
    )
      .filter((k) => counts[k])
      .map((k) => ({ value: k, label: kindPlurals[k], count: counts[k] })),
    { value: "archived", label: "Archived", count: counts.archived },
  ];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="text-ink-3 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            aria-label="Search institutions"
            placeholder="Search by name"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="ml-auto flex gap-2">
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
            Add institution
          </Button>
        </div>
      </div>

      {flash ? (
        <Notice tone="success" className="mb-6">
          {flash}
        </Notice>
      ) : null}

      <FilterTabs
        label="Filter institutions"
        value={filter}
        onChange={setFilter}
        options={tabs}
      />

      {visible.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={filter === "archived" ? "Nothing archived" : "No matches"}
          >
            {filter === "archived"
              ? "Defaults you remove, and institutions still used by accounts, end up here."
              : "Try a different search, or add the institution yourself."}
          </EmptyState>
        </div>
      ) : (
        <Table className="mt-6">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Country</Th>
              <Th>How data comes in</Th>
              <Th className="text-right">Accounts</Th>
              <Th className="text-right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <button
                    type="button"
                    onClick={() => setEditing(r)}
                    className="text-left font-semibold hover:underline hover:underline-offset-4"
                  >
                    {r.name}
                  </button>
                  {!r.isSystem ? (
                    <Tag tone="outline" className="ml-2">
                      Custom
                    </Tag>
                  ) : null}
                </Td>
                <Td className="text-ink-2">{kindLabels[r.kind]}</Td>
                <Td className="text-ink-2">{r.country ?? "—"}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {r.ingestMethods.map((m) => (
                      <Tag key={m} tone={m === "api" ? "forest" : "neutral"}>
                        {methodLabels[m]}
                      </Tag>
                    ))}
                  </div>
                </Td>
                <Td className="figures text-right">{r.accountCount}</Td>
                <Td className="text-right">
                  {r.archivedAt ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => restore.mutate({ id: r.id })}
                    >
                      Restore
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(r)}
                    >
                      Edit
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <InstitutionDrawer
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        institution={editing}
        onClose={() => setEditing(null)}
        onSaved={async (message) => {
          setEditing(null);
          setFlash(message);
          await invalidate();
        }}
      />
    </>
  );
}

function InstitutionDrawer({
  institution,
  onClose,
  onSaved,
}: {
  institution: Institution | "new" | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const existing = institution && institution !== "new" ? institution : null;
  const create = api.admin.institutions.create.useMutation();
  const update = api.admin.institutions.update.useMutation();
  const remove = api.admin.institutions.remove.useMutation();
  const error = create.error ?? update.error ?? remove.error;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      name: formText(form, "name"),
      kind: formText(form, "kind") as Kind,
      country: formText(form, "country"),
      website: formText(form, "website"),
      ingestMethods: form.getAll("ingestMethods").map(String) as Method[],
      apiAdapter: formText(form, "apiAdapter"),
      extractionHints: formText(form, "extractionHints"),
    };
    if (existing) {
      await update.mutateAsync({ id: existing.id, ...values });
      await onSaved(`Saved ${values.name}.`);
    } else {
      await create.mutateAsync(values);
      await onSaved(`Added ${values.name}.`);
    }
  }

  async function onRemove() {
    if (!existing) return;
    const result = await remove.mutateAsync({ id: existing.id });
    await onSaved(
      result.outcome === "deleted"
        ? `Removed ${existing.name}.`
        : result.reason === "default"
          ? `${existing.name} is a default, so it was archived. Restore it from the archived list.`
          : `${existing.name} is used by existing accounts, so it was archived instead of deleted.`,
    );
  }

  return (
    <Drawer
      open={institution !== null}
      onClose={onClose}
      title={existing ? existing.name : "Add institution"}
      description={
        existing
          ? `Key: ${existing.key}`
          : "Brokers, banks and card issuers your users can pick when adding accounts."
      }
      footer={
        <>
          {existing && !existing.archivedAt ? (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => void onRemove().catch(() => undefined)}
              loading={remove.isPending}
            >
              Remove
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="institution-form"
            loading={create.isPending || update.isPending}
          >
            {existing ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <form
        id="institution-form"
        onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
        className="space-y-5"
      >
        {error ? <Notice tone="error">{error.message}</Notice> : null}
        <Field label="Name" htmlFor="inst-name">
          <Input
            id="inst-name"
            name="name"
            required
            defaultValue={existing?.name}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type" htmlFor="inst-kind">
            <Select
              id="inst-kind"
              name="kind"
              defaultValue={existing?.kind ?? "broker"}
            >
              {Object.entries(kindLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Country" htmlFor="inst-country" hint="Two-letter code">
            <Input
              id="inst-country"
              name="country"
              maxLength={2}
              defaultValue={existing?.country ?? ""}
              placeholder="SG"
              className="uppercase"
            />
          </Field>
        </div>
        <Field label="Website" htmlFor="inst-website">
          <Input
            id="inst-website"
            name="website"
            type="url"
            defaultValue={existing?.website ?? ""}
            placeholder="https://"
          />
        </Field>
        <fieldset className="space-y-2.5">
          <legend className="mb-2 text-[13px] font-semibold">
            How data comes in
          </legend>
          {(Object.keys(methodLabels) as Method[]).map((m) => (
            <Checkbox
              key={m}
              name="ingestMethods"
              value={m}
              label={methodLabels[m]}
              defaultChecked={
                existing
                  ? existing.ingestMethods.includes(m)
                  : m === "statement_ocr"
              }
            />
          ))}
        </fieldset>
        <Field
          label="API adapter"
          htmlFor="inst-adapter"
          hint="Which sync integration to use when API sync is enabled."
        >
          <Select
            id="inst-adapter"
            name="apiAdapter"
            defaultValue={existing?.apiAdapter ?? ""}
          >
            {apiAdapters.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Notes for the AI"
          htmlFor="inst-hints"
          hint="Added to the extraction prompt for this institution's statements, e.g. which section holds positions."
        >
          <Textarea
            id="inst-hints"
            name="extractionHints"
            rows={4}
            defaultValue={existing?.extractionHints ?? ""}
          />
        </Field>
      </form>
    </Drawer>
  );
}
