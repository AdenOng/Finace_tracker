"use client";

import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Select } from "~/components/ui/field";
import { EmptyState } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { formatDateTime } from "~/lib/format";
import { api } from "~/trpc/react";

type TargetType =
  "user" | "invitation" | "provider" | "category" | "institution";

const filters: { value: TargetType | ""; label: string }[] = [
  { value: "", label: "Everything" },
  { value: "user", label: "Users" },
  { value: "invitation", label: "Invitations" },
  { value: "provider", label: "AI providers" },
  { value: "category", label: "Categories" },
  { value: "institution", label: "Brokers & banks" },
];

const actionLabels: Record<string, string> = {
  "user.role_changed": "Changed role",
  "user.disabled": "Disabled account",
  "user.enabled": "Re-enabled account",
  "user.sessions_revoked": "Signed out everywhere",
  "user.two_factor_reset": "Reset two-step",
  "user.password_reset_created": "Created password reset link",
  "user.password_reset_used": "Reset password with link",
  "invitation.created": "Invited",
  "invitation.revoked": "Revoked invitation",
  "provider.created": "Added AI provider",
  "provider.updated": "Edited AI provider",
  "provider.removed": "Deleted AI provider",
  "provider.set_default": "Made default AI provider",
  "category.created": "Added category",
  "category.updated": "Edited category",
  "category.archived": "Archived category",
  "category.restored": "Restored category",
  "category.defaults_restored": "Restored default categories",
  "institution.created": "Added institution",
  "institution.updated": "Edited institution",
  "institution.archived": "Archived institution",
  "institution.deleted": "Deleted institution",
  "institution.restored": "Restored institution",
  "institution.defaults_restored": "Restored default institutions",
};

function describeDetails(details: Record<string, unknown> | null) {
  if (!details) return null;
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

export function AuditLog() {
  const [targetType, setTargetType] = useState<TargetType | "">("");
  const log = api.admin.audit.list.useInfiniteQuery(
    { targetType: targetType || undefined },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const items = log.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-4">
      <Select
        aria-label="Filter activity"
        className="h-9 w-56 text-[13px]"
        value={targetType}
        onChange={(e) => setTargetType(e.target.value as TargetType | "")}
      >
        {filters.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </Select>

      {log.isLoading ? (
        <p className="text-ink-3 text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState title="No activity yet">
          Admin changes and password resets will be listed here.
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
                  <Td className="text-ink-2 whitespace-nowrap">
                    {formatDateTime(entry.createdAt)}
                  </Td>
                  <Td title={entry.actorEmail ?? undefined}>
                    {entry.actorName ?? "Deleted user"}
                  </Td>
                  <Td className="font-medium">
                    {actionLabels[entry.action] ?? entry.action}
                  </Td>
                  <Td>{entry.targetLabel ?? "—"}</Td>
                  <Td className="text-ink-2 text-[13px]">
                    {describeDetails(entry.details)}
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
