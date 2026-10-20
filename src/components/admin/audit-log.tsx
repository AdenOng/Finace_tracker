"use client";

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

const filters: { value: TargetType | ""; label: string }[] = [
  { value: "", label: "Everything" },
  { value: "user", label: "Users" },
  { value: "invitation", label: "Invitations" },
  { value: "settings", label: "Settings" },
  { value: "job", label: "Import jobs" },
  { value: "provider", label: "AI providers" },
  { value: "category", label: "Categories" },
  { value: "institution", label: "Brokers & banks" },
  { value: "backup", label: "Backups" },
  { value: "preset", label: "Data packs" },
  { value: "workspace", label: "Workspaces" },
];

const actionLabels: Record<string, string> = {
  "user.role_changed": "Changed role",
  "user.disabled": "Disabled account",
  "user.enabled": "Re-enabled account",
  "user.sessions_revoked": "Signed out everywhere",
  "user.session_revoked": "Signed out a device",
  "user.two_factor_reset": "Reset two-step",
  "user.password_reset_created": "Created password reset link",
  "user.password_reset_used": "Reset password with link",
  "invitation.created": "Invited",
  "invitation.revoked": "Revoked invitation",
  "provider.created": "Added AI provider",
  "provider.updated": "Edited AI provider",
  "provider.removed": "Deleted AI provider",
  "provider.set_default": "Made default AI provider",
  "provider.set_fallback": "Made fallback AI provider",
  "provider.fallback_cleared": "Removed fallback AI provider",
  "category.created": "Added category",
  "category.updated": "Edited category",
  "category.archived": "Archived category",
  "category.restored": "Restored category",
  "category.reordered": "Reordered categories",
  "category.imported": "Imported categories",
  "category.defaults_restored": "Restored default categories",
  "institution.created": "Added institution",
  "institution.updated": "Edited institution",
  "institution.archived": "Archived institution",
  "institution.deleted": "Deleted institution",
  "institution.restored": "Restored institution",
  "institution.merged": "Merged institutions",
  "institution.defaults_restored": "Restored default institutions",
  "job.retried": "Retried an import",
  "job.cancelled": "Stopped an import",
  "job.reminder_sent": "Sent a review reminder",
  "backup.requested": "Asked for a backup",
  "backup.downloaded": "Downloaded a backup",
  "preset.applied": "Applied a data pack",
  "settings.security_updated": "Changed security settings",
  "settings.retention_updated": "Changed file retention",
  "settings.files_purged": "Cleaned up statement files",
  "settings.rates_refreshed": "Refreshed exchange rates",
  "settings.prices_refreshed": "Refreshed security prices",
  "settings.price_quotes_updated": "Changed security prices",
  "settings.cpf_srs_updated": "Changed CPF & SRS",
  "settings.health_checks_updated": "Changed provider checks",
  "settings.test_email_sent": "Sent a test email",
  "workspace.create": "Created workspace",
  "workspace.update": "Edited workspace",
  "workspace.remove": "Deleted workspace",
  "workspace.account.share": "Shared an account",
  "workspace.account.unshare": "Stopped sharing an account",
  "workspace.invitation.create": "Invited to a workspace",
  "workspace.invitation.accept": "Joined a workspace",
  "workspace.invitation.revoke": "Revoked a workspace invite",
  "workspace.member.remove": "Removed a workspace member",
  "workspace.member.role": "Changed a workspace role",
  "workspace.owner.transfer": "Handed over a workspace",
};

const policyLabels: Record<string, string> = {
  everyone: "everyone",
  admins: "admins only",
  off: "not required",
};

/** Detail values are plain JSON; anything structured is shown as JSON rather than [object]. */
function text(value: unknown): string {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? `${value}`
    : JSON.stringify(value);
}

const plural = (n: unknown, one: string, many = `${one}s`) =>
  `${text(n)} ${Number(n) === 1 ? one : many}`;

/** "reassignToId" → "reassign to"; ids themselves are never shown. */
function humanize(key: string) {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function formatValue(value: unknown) {
  if (typeof value === "boolean") return value ? "on" : "off";
  if (value === null) return "none";
  return text(value);
}

/** Turns stored details into a short sentence for the log. */
function describeDetails(
  action: string,
  details: Record<string, unknown> | null,
): string | null {
  if (!details) return null;
  const d = details;
  switch (action) {
    case "user.role_changed":
      return d.role === "admin" ? "Now an admin" : "Now a member";
    case "invitation.created":
      return `As ${d.role === "admin" ? "an admin" : "a member"}${Number(d.replaced) > 0 ? ", replacing an earlier link" : ""}`;
    case "user.sessions_revoked":
    case "user.session_revoked":
      return plural(d.sessions, "session");
    case "provider.created":
      return d.model ? `Model ${text(d.model)}` : null;
    case "provider.updated":
      return [
        d.model ? `Model ${text(d.model)}` : null,
        d.enabled === false ? "disabled" : null,
        d.apiKey && d.apiKey !== "unchanged"
          ? `API key ${text(d.apiKey)}`
          : null,
      ]
        .filter(Boolean)
        .join(", ");
    case "provider.removed":
      return d.newDefault ? `${text(d.newDefault)} became the default` : null;
    case "category.archived":
      return `${plural(d.archived, "category", "categories")}; ${plural(d.transactionsMoved, "transaction")} ${d.movedTo ? `moved to ${text(d.movedTo)}` : "left uncategorised"}`;
    case "category.restored":
      return Number(d.restored) > 1 ? "With its parent" : null;
    case "category.reordered":
      return plural(d.categories, "category", "categories");
    case "category.imported":
      return `${text(d.created)} added, ${text(d.updated)} updated, ${text(d.unchanged)} unchanged${Number(d.archivedWithParent) > 0 ? `; ${text(d.archivedWithParent)} archived with their parent` : ""}`;
    case "category.defaults_restored":
    case "institution.defaults_restored":
      return `${text(d.inserted)} added back, ${text(d.unarchived)} restored`;
    case "institution.merged":
      return `${text(d.from)} merged in; ${plural(d.accountsMoved, "account")} moved`;
    case "preset.applied":
      return `${text(d.categories)} categories, ${text(d.institutions)} institutions, ${text(d.currencies)} currencies added`;
    case "settings.security_updated":
      return Object.entries(d)
        .map(([key, value]) =>
          key === "twoFactorPolicy"
            ? `two-step for ${policyLabels[text(value)] ?? text(value)}`
            : key === "maxSessionDays"
              ? value
                ? `sign out after ${text(value)} days`
                : "no fixed session length"
              : key === "workspaceInviteSignups"
                ? `workspace invites ${value ? "can" : "cannot"} create accounts`
                : key === "newDeviceAlerts"
                  ? `new-device emails ${value ? "on" : "off"}`
                  : `${humanize(key)}: ${formatValue(value)}`,
        )
        .join(", ")
        .replace(/^./, (c) => c.toUpperCase());
    case "settings.retention_updated":
      return typeof d.days === "number"
        ? `Delete files after ${d.days} days`
        : "Keep files forever";
    case "settings.files_purged":
      return plural(d.files, "file");
    default:
      return (
        Object.entries(d)
          .filter(
            ([key, value]) =>
              value !== null && value !== undefined && !key.endsWith("Id"),
          )
          .map(([key, value]) => `${humanize(key)}: ${formatValue(value)}`)
          .join(" · ") || null
      );
  }
}

export function AuditLog() {
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
        <Field label="What" htmlFor="audit-type" className="w-44">
          <Select
            id="audit-type"
            className="h-9 text-[13px]"
            value={values.targetType ?? ""}
            onChange={(e) =>
              set({ targetType: (e.target.value || undefined) as TargetType })
            }
          >
            {filters.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Who" htmlFor="audit-actor" className="w-44">
          <Select
            id="audit-actor"
            className="h-9 text-[13px]"
            value={values.actorId ?? ""}
            onChange={(e) => set({ actorId: e.target.value || undefined })}
          >
            <option value="">Anyone</option>
            {actors.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" htmlFor="audit-from" className="w-40">
          <Input
            id="audit-from"
            type="date"
            className="h-9 text-[13px]"
            value={values.from ?? ""}
            max={values.to}
            onChange={(e) => set({ from: e.target.value || undefined })}
          />
        </Field>
        <Field label="To" htmlFor="audit-to" className="w-40">
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
            aria-label="Search the activity log"
            placeholder="Search, then Enter"
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
          Export CSV
        </a>
      </div>

      {log.isLoading ? (
        <p className="text-ink-3 text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title={
            Object.values(values).some(Boolean)
              ? "No matches"
              : "No activity yet"
          }
        >
          {Object.values(values).some(Boolean)
            ? "Try wider dates or another filter."
            : "Admin changes and password resets will be listed here."}
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>What</Th>
                <Th>Target</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <Tr key={entry.id}>
                  <Td
                    className="text-ink-2 whitespace-nowrap"
                    title={formatDateTime(entry.createdAt)}
                  >
                    {formatRelative(entry.createdAt)}
                  </Td>
                  <Td title={entry.actorEmail ?? undefined}>
                    {entry.actorName ?? "Deleted user"}
                  </Td>
                  <Td className="font-medium">
                    {actionLabels[entry.action] ?? entry.action}
                  </Td>
                  <Td>{entry.targetLabel ?? "—"}</Td>
                  <Td className="text-ink-2 text-[13px]">
                    {describeDetails(entry.action, entry.details)}
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
              Load older
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
