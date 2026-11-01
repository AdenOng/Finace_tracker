"use client";

import { useT, useLocale, categoryLabel } from "~/i18n/client";
import type { Messages } from "~/i18n/messages";

import { Download, Search } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Field, Input, Select } from "~/components/ui/field";
import { EmptyState } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { formatDateTime, formatRelative } from "~/lib/format";
import { api, type RouterInputs } from "~/trpc/react";

type Filters = Omit<RouterInputs["admin"]["audit"]["list"], "cursor">;
type TargetType = NonNullable<Filters["targetType"]>;

const makeFilters = (
  t: Messages,
): { value: TargetType | ""; label: string }[] => [
  { value: "", label: t.admin.audit.everything },
  { value: "user", label: t.admin.audit.users },
  { value: "invitation", label: t.admin.audit.invitations },
  { value: "settings", label: t.admin.audit.settings },
  { value: "job", label: t.admin.audit.importJobs },
  { value: "provider", label: t.admin.audit.aiProviders },
  { value: "category", label: t.admin.audit.categories },
  { value: "institution", label: t.admin.audit.brokersBanks },
  { value: "backup", label: t.admin.audit.backups },
  { value: "preset", label: t.admin.audit.dataPacks },
  { value: "workspace", label: t.admin.audit.workspaces },
];

/** Detail values are plain JSON; anything structured is shown as JSON rather than [object]. */
function text(value: unknown): string {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? `${value}`
    : JSON.stringify(value);
}

/** "reassignToId" → "reassign to"; ids themselves are never shown. */
function humanize(key: string) {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function formatValue(value: unknown, t: Messages) {
  if (typeof value === "boolean")
    return value ? t.admin.auditDetails.on : t.admin.auditDetails.off;
  if (value === null) return t.admin.auditDetails.none;
  return text(value);
}

/** Turns stored details into a short sentence for the log. */
function describeDetails(
  action: string,
  details: Record<string, unknown> | null,
  t: Messages,
  locale: "en" | "zh",
): string | null {
  if (!details) return null;
  const d = details;
  switch (action) {
    case "user.role_changed":
      return d.role === "admin"
        ? t.admin.auditDetails.nowAnAdmin
        : t.admin.auditDetails.nowAMember;
    case "invitation.created":
      return t.admin.auditDetails.invitation(
        d.role === "admin",
        Number(d.replaced) > 0,
      );
    case "user.sessions_revoked":
    case "user.session_revoked":
      return t.admin.auditDetails.sessions(text(d.sessions));
    case "provider.created":
      return d.model ? t.admin.auditDetails.model(text(d.model)) : null;
    case "provider.updated":
      return [
        d.model ? t.admin.auditDetails.model(text(d.model)) : null,
        d.enabled === false ? t.admin.auditDetails.disabled : null,
        d.apiKey && d.apiKey !== "unchanged"
          ? t.admin.auditDetails.apiKey(text(d.apiKey))
          : null,
      ]
        .filter(Boolean)
        .join(locale === "zh" ? "，" : ", ");
    case "provider.removed":
      return d.newDefault
        ? t.admin.auditDetails.newDefault(text(d.newDefault))
        : null;
    case "category.archived":
      return t.admin.auditDetails.archived(
        text(d.archived),
        text(d.transactionsMoved),
        d.movedTo ? categoryLabel(t, text(d.movedTo)) : null,
      );
    case "category.restored":
      return Number(d.restored) > 1 ? t.admin.auditDetails.withItsParent : null;
    case "category.reordered":
      return t.admin.auditDetails.categories(text(d.categories));
    case "category.imported":
      return t.admin.auditDetails.imported(
        text(d.created),
        text(d.updated),
        text(d.unchanged),
        text(d.archivedWithParent),
      );
    case "category.defaults_restored":
    case "institution.defaults_restored":
      return t.admin.auditDetails.restored(
        text(d.inserted),
        text(d.unarchived),
      );
    case "institution.merged":
      return t.admin.auditDetails.merged(text(d.from), text(d.accountsMoved));
    case "preset.applied":
      return t.admin.auditDetails.preset(
        text(d.categories),
        text(d.institutions),
        text(d.currencies),
      );
    case "settings.security_updated":
      return Object.entries(d)
        .map(([key, value]) =>
          key === "twoFactorPolicy"
            ? t.admin.auditDetails.twoStep(
                (t.admin.auditPolicies as Record<string, string>)[
                  text(value)
                ] ?? text(value),
              )
            : key === "maxSessionDays"
              ? value
                ? t.admin.auditDetails.sessionDays(text(value))
                : t.admin.auditDetails.noFixedSessionLength
              : key === "workspaceInviteSignups"
                ? t.admin.auditDetails.inviteSignups(!!value)
                : key === "newDeviceAlerts"
                  ? t.admin.auditDetails.newDevice(!!value)
                  : `${humanize(key)}: ${formatValue(value, t)}`,
        )
        .join(locale === "zh" ? "，" : ", ")
        .replace(/^./, (c) => c.toUpperCase());
    case "settings.retention_updated":
      return typeof d.days === "number"
        ? t.admin.auditDetails.retention(d.days)
        : t.admin.auditDetails.keepFilesForever;
    case "settings.files_purged":
      return t.admin.auditDetails.files(text(d.files));
    default:
      return (
        Object.entries(d)
          .filter(
            ([key, value]) =>
              value !== null && value !== undefined && !key.endsWith("Id"),
          )
          .map(([key, value]) => `${humanize(key)}: ${formatValue(value, t)}`)
          .join(" · ") || null
      );
  }
}

export function AuditLog() {
  const t = useT();
  const locale = useLocale();
  const [draft, setDraft] = useState("");
  const [values, setValues] = useState<Filters>({});
  const actors = api.admin.audit.actors.useQuery();
  const log = api.admin.audit.list.useInfiniteQuery(values, {
    getNextPageParam: (page) => page.nextCursor,
  });
  const items = log.data?.pages.flatMap((page) => page.items) ?? [];
  const exportUrl = `/api/admin/activity/export?${new URLSearchParams(
    Object.entries(values).filter(
      (entry): entry is [string, string] => !!entry[1],
    ),
  ).toString()}`;
  const set = (patch: Partial<Filters>) =>
    setValues((v) => ({ ...v, ...patch }));

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label={t.admin.audit.what} htmlFor="audit-type" className="w-44">
          <Select
            id="audit-type"
            className="h-9 text-[13px]"
            value={values.targetType ?? ""}
            onChange={(e) =>
              set({ targetType: (e.target.value || undefined) as TargetType })
            }
          >
            {makeFilters(t).map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.admin.audit.who} htmlFor="audit-actor" className="w-44">
          <Select
            id="audit-actor"
            className="h-9 text-[13px]"
            value={values.actorId ?? ""}
            onChange={(e) => set({ actorId: e.target.value || undefined })}
          >
            <option value="">{t.admin.audit.anyone}</option>
            {actors.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.admin.audit.from} htmlFor="audit-from" className="w-40">
          <Input
            id="audit-from"
            type="date"
            className="h-9 text-[13px]"
            value={values.from ?? ""}
            max={values.to}
            onChange={(e) => set({ from: e.target.value || undefined })}
          />
        </Field>
        <Field label={t.admin.audit.to} htmlFor="audit-to" className="w-40">
          <Input
            id="audit-to"
            type="date"
            className="h-9 text-[13px]"
            value={values.to ?? ""}
            min={values.from}
            onChange={(e) => set({ to: e.target.value || undefined })}
          />
        </Field>
        <form
          className="relative min-w-48 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            set({ query: draft.trim() || undefined });
          }}
        >
          <Search className="text-ink-3 pointer-events-none absolute bottom-2.5 left-3 size-4" />
          <Input
            aria-label={t.admin.audit.searchTheActivityLog}
            placeholder={t.admin.audit.searchThenEnter}
            className="h-9 pl-9 text-[13px]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </form>
        <a
          href={exportUrl}
          className="text-brand inline-flex h-9 items-center gap-1.5 text-[13px] font-semibold underline-offset-4 hover:underline"
        >
          <Download className="size-3.5" />
          {t.admin.audit.exportCsv}
        </a>
      </div>

      {log.isLoading ? (
        <p className="text-ink-3 text-sm">{t.common.status.loading}</p>
      ) : items.length === 0 ? (
        <EmptyState
          title={
            Object.values(values).some(Boolean)
              ? t.admin.audit.noMatches
              : t.admin.audit.noActivityYet
          }
        >
          {Object.values(values).some(Boolean)
            ? t.admin.audit.tryWiderDatesOrAnotherFilter
            : t.admin.audit.adminChangesAndPasswordResetsWillBeListedHere}
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>{t.admin.audit.when}</Th>
                <Th>{t.admin.audit.who}</Th>
                <Th>{t.admin.audit.what}</Th>
                <Th>{t.admin.audit.target}</Th>
                <Th>{t.admin.audit.details}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <Tr key={entry.id}>
                  <Td
                    className="text-ink-2 whitespace-nowrap"
                    title={formatDateTime(entry.createdAt, locale)}
                  >
                    {formatRelative(entry.createdAt, new Date(), locale)}
                  </Td>
                  <Td title={entry.actorEmail ?? undefined}>
                    {entry.actorName ?? t.admin.audit.deletedUser}
                  </Td>
                  <Td className="font-medium">
                    {(t.admin.auditActions as Record<string, string>)[
                      entry.action
                    ] ?? entry.action}
                  </Td>
                  <Td>{entry.targetLabel ?? "—"}</Td>
                  <Td className="text-ink-2 text-[13px]">
                    {describeDetails(entry.action, entry.details, t, locale)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {log.hasNextPage ? (
            <Button
              variant="secondary"
              size="sm"
              loading={log.isFetchingNextPage}
              onClick={() => void log.fetchNextPage()}
            >
              {t.admin.audit.loadOlder}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
