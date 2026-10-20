"use client";

import { Plus, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { Drawer } from "~/components/ui/dialog";
import { FlashNotice } from "~/components/ui/flash-notice";
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
import { useFlash } from "~/components/ui/use-flash";
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

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** "Singapore" for "SG"; null for anything that is not a known region code. */
function countryName(code: string) {
  if (!/^[A-Za-z]{2}$/.test(code)) return null;
  const name = regionNames.of(code.toUpperCase());
  return name && name !== code.toUpperCase() ? name : null;
}

/** What Remove will do, so the button can say it before it is pressed. */
function removalOutcome(i: Institution) {
  if (i.isSystem) return "archive-default" as const;
  if (i.accountCount + i.documentCount > 0) return "archive-in-use" as const;
  return "delete" as const;
}

export function InstitutionsAdmin() {
  const utils = api.useUtils();
  const [rows] = api.admin.institutions.list.useSuspenseQuery();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Institution | "new" | null>(null);
  const { flash, success, error, clear } = useFlash();
  const defaults = api.admin.institutions.defaultsPreview.useQuery();
  const missingDefaults =
    (defaults.data?.missing.length ?? 0) +
    (defaults.data?.archived.length ?? 0);

  const invalidate = () =>
    Promise.all([
      utils.admin.institutions.list.invalidate(),
      utils.admin.institutions.defaultsPreview.invalidate(),
    ]);
  const restoreDefaults = api.admin.institutions.restoreDefaults.useMutation({
    onMutate: clear,
    onSuccess: async (r) => {
      success(
        r.inserted + r.unarchived === 0
          ? "All defaults are already present."
          : `Restored ${r.inserted + r.unarchived} default institution${r.inserted + r.unarchived === 1 ? "" : "s"}.`,
      );
      await invalidate();
    },
    onError: error,
  });
  const restore = api.admin.institutions.restore.useMutation({
    onMutate: clear,
    onSuccess: async () => {
      success("Restored. People can pick it again when adding an account.");
      await invalidate();
    },
    onError: error,
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
        "other",
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
          <ConfirmButton
            variant="secondary"
            disabled={missingDefaults === 0}
            title={
              missingDefaults === 0
                ? "Every default institution is present"
                : [
                    ...(defaults.data?.missing ?? []).map((n) => `Add ${n}`),
                    ...(defaults.data?.archived ?? []).map(
                      (n) => `Restore ${n}`,
                    ),
                  ].join("\n")
            }
            confirmLabel={`Bring back ${missingDefaults}?`}
            onConfirm={() => restoreDefaults.mutate()}
            loading={restoreDefaults.isPending}
          >
            <RotateCcw className="size-4" />
            {missingDefaults
              ? `Restore ${missingDefaults} default${missingDefaults === 1 ? "" : "s"}`
              : "Defaults present"}
          </ConfirmButton>
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            Add institution
          </Button>
        </div>
      </div>

      <FlashNotice flash={flash} className="mb-6" />

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
                <Td
                  className="text-ink-2"
                  title={
                    r.country
                      ? (countryName(r.country) ?? undefined)
                      : undefined
                  }
                >
                  {r.country ?? "—"}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {r.ingestMethods.map((m) => (
                      <Tag key={m} tone={m === "api" ? "brand" : "neutral"}>
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
                      loading={
                        restore.isPending && restore.variables?.id === r.id
                      }
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
        mergeTargets={rows.filter(
          (r) => !r.archivedAt && (editing === "new" || r.id !== editing?.id),
        )}
        onClose={() => setEditing(null)}
        onSaved={async (message) => {
          setEditing(null);
          success(message);
          await invalidate();
        }}
      />
    </>
  );
}

function InstitutionDrawer({
  institution,
  mergeTargets,
  onClose,
  onSaved,
}: {
  institution: Institution | "new" | null;
  mergeTargets: Institution[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const existing = institution && institution !== "new" ? institution : null;
  const [methods, setMethods] = useState<Method[]>(
    existing?.ingestMethods ?? ["statement_ocr"],
  );
  const [adapter, setAdapter] = useState(existing?.apiAdapter ?? "");
  const [country, setCountry] = useState(existing?.country ?? "");
  const [mergeInto, setMergeInto] = useState("");
  const create = api.admin.institutions.create.useMutation();
  const update = api.admin.institutions.update.useMutation();
  const remove = api.admin.institutions.remove.useMutation();
  const merge = api.admin.institutions.merge.useMutation();
  const error = create.error ?? update.error ?? remove.error ?? merge.error;
  const outcome = existing ? removalOutcome(existing) : null;
  const apiOn = methods.includes("api");
  const countryLabel = country ? countryName(country) : null;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      name: formText(form, "name"),
      kind: formText(form, "kind") as Kind,
      country: formText(form, "country"),
      website: formText(form, "website"),
      ingestMethods: methods,
      apiAdapter: apiOn ? adapter : "",
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
            <ConfirmButton
              variant="danger"
              className="mr-auto"
              confirmLabel={outcome === "delete" ? "Delete it?" : "Archive it?"}
              onConfirm={() => void onRemove().catch(() => undefined)}
              loading={remove.isPending}
            >
              {outcome === "delete" ? "Delete" : "Archive"}
            </ConfirmButton>
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
        {existing && !existing.archivedAt ? (
          <p className="text-ink-3 text-[13px]">
            {outcome === "delete"
              ? "Not used by any account or upload, so removing it deletes it."
              : outcome === "archive-default"
                ? "A default from the preset pack: removing it archives it, so the next start-up does not add it back."
                : `Used by ${existing.accountCount} account${existing.accountCount === 1 ? "" : "s"}${existing.documentCount ? ` and ${existing.documentCount} upload${existing.documentCount === 1 ? "" : "s"}` : ""}: removing it archives it and keeps their history.`}
          </p>
        ) : null}
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
          <Field
            label="Country"
            htmlFor="inst-country"
            hint={
              country
                ? (countryLabel ?? "Not a country code")
                : "Two-letter code, e.g. SG"
            }
            error={
              country && !countryLabel ? "Use a two-letter country code" : null
            }
          >
            <Input
              id="inst-country"
              name="country"
              maxLength={2}
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              aria-invalid={!!country && !countryLabel}
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
              label={methodLabels[m]}
              checked={methods.includes(m)}
              onChange={(e) =>
                setMethods((current) =>
                  e.target.checked
                    ? [...current, m]
                    : current.filter((x) => x !== m),
                )
              }
            />
          ))}
          {methods.length === 0 ? (
            <p className="text-loss text-[13px]">Pick at least one.</p>
          ) : null}
        </fieldset>
        <Field
          label="API adapter"
          htmlFor="inst-adapter"
          hint={
            apiOn
              ? "Which sync integration to use."
              : "Choosing an adapter turns on API sync."
          }
        >
          <Select
            id="inst-adapter"
            value={apiOn ? adapter : ""}
            onChange={(e) => {
              setAdapter(e.target.value);
              if (e.target.value && !apiOn) setMethods((m) => [...m, "api"]);
            }}
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
        {existing && !existing.archivedAt && mergeTargets.length ? (
          <fieldset className="border-line space-y-3 border-t pt-5">
            <legend className="text-[13px] font-semibold">
              Merge a duplicate
            </legend>
            <p className="text-ink-3 -mt-1 text-[13px]">
              Moves this institution&apos;s {existing.accountCount} account
              {existing.accountCount === 1 ? "" : "s"} and uploads into another,
              then removes this one.
            </p>
            <div className="flex flex-wrap gap-2">
              <Select
                aria-label="Merge into"
                className="max-w-xs flex-1"
                value={mergeInto}
                onChange={(e) => setMergeInto(e.target.value)}
              >
                <option value="">Merge into…</option>
                {mergeTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              <ConfirmButton
                variant="secondary"
                disabled={!mergeInto}
                loading={merge.isPending}
                confirmLabel="Merge now?"
                onConfirm={() =>
                  void merge
                    .mutateAsync({ sourceId: existing.id, targetId: mergeInto })
                    .then((r) =>
                      onSaved(
                        `Merged ${existing.name} into ${mergeTargets.find((t) => t.id === mergeInto)?.name}; ${r.accountsMoved} account${r.accountsMoved === 1 ? "" : "s"} moved.`,
                      ),
                    )
                    .catch(() => undefined)
                }
              >
                Merge
              </ConfirmButton>
            </div>
          </fieldset>
        ) : null}
      </form>
    </Drawer>
  );
}
