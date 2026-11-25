"use client";

import { useT, useLocale } from "~/i18n/client";
import { Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/field";
import { EmptyState, Section, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { FilterTabs } from "~/components/ui/tabs";
import { formatDate, formatDateTime, formatRelative } from "~/lib/format";
import { api } from "~/trpc/react";
import { UserDrawer, type AdminUser } from "./user-drawer";
import { InviteSection } from "./invitations-admin";

type UserFilter = "all" | "admins" | "no2fa" | "disabled";

function matches(u: AdminUser, filter: UserFilter, query: string) {
  if (filter === "admins" && u.role !== "admin") return false;
  if (filter === "no2fa" && u.twoFactorEnabled) return false;
  if (filter === "disabled" && !u.banned) return false;
  const q = query.trim().toLowerCase();
  return (
    !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  );
}

export function UsersAdmin({ currentUserId }: { currentUserId: string }) {
  const locale = useLocale();
  const t = useT();
  const utils = api.useUtils();
  const params = useSearchParams();
  const [users] = api.admin.users.list.useSuspenseQuery();
  const [security] = api.admin.security.settings.useSuspenseQuery();
  const [filter, setFilter] = useState<UserFilter>(() => {
    const value = params.get("filter");
    return value === "admins" || value === "no2fa" || value === "disabled"
      ? value
      : "all";
  });
  const [query, setQuery] = useState("");
  const [managingId, setManagingId] = useState<string | null>(null);
  const managing = users.find((u) => u.id === managingId) ?? null;

  const refresh = () =>
    Promise.all([
      utils.admin.users.list.invalidate(),
      utils.admin.users.invitations.invalidate(),
    ]);

  const counts = useMemo(
    () => ({
      all: users.length,
      admins: users.filter((u) => u.role === "admin").length,
      no2fa: users.filter((u) => !u.twoFactorEnabled).length,
      disabled: users.filter((u) => u.banned).length,
    }),
    [users],
  );
  const visible = users.filter((u) => matches(u, filter, query));

  return (
    <div className="space-y-6">
      <InviteSection
        emailConfigured={security.emailConfigured}
        onChanged={refresh}
      />

      <Section
        title={t.adminManage.users.people}
        description={t.adminManage.users.rolesHelp}
      >
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <FilterTabs
            label={t.adminManage.users.filterPeople}
            value={filter}
            onChange={setFilter}
            options={[
              {
                value: "all",
                label: t.adminManage.users.everyone,
                count: counts.all,
              },
              {
                value: "admins",
                label: t.adminManage.users.admins,
                count: counts.admins,
              },
              {
                value: "no2fa",
                label: t.adminManage.users.noTwostep,
                count: counts.no2fa,
              },
              ...(counts.disabled
                ? [
                    {
                      value: "disabled" as const,
                      label: t.adminManage.users.disabled,
                      count: counts.disabled,
                    },
                  ]
                : []),
            ]}
          />
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="text-ink-3 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              aria-label={t.adminManage.users.searchPeople}
              placeholder={t.adminManage.users.searchNameOrEmail}
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState title={t.adminManage.users.noOneMatches}>
            {t.adminManage.users.tryAnotherFilterOrSearch}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t.adminManage.users.name}</Th>
                <Th>{t.adminManage.users.twoStep}</Th>
                <Th>{t.adminManage.users.joined}</Th>
                <Th>{t.adminManage.users.lastActive}</Th>
                <Th>{t.adminManage.users.role}</Th>
                <Th className="text-right">
                  <span className="sr-only">{t.adminManage.users.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => {
                const self = u.id === currentUserId;
                return (
                  <Tr
                    key={u.id}
                    className={u.banned ? "text-ink-3" : undefined}
                  >
                    <Td>
                      <p className="font-semibold">
                        {u.name}
                        {self ? (
                          <Tag tone="soft" className="ml-2">
                            {t.adminManage.users.you}
                          </Tag>
                        ) : null}
                        {u.banned ? (
                          <Tag tone="loss" className="ml-2">
                            {t.adminManage.users.disabled}
                          </Tag>
                        ) : null}
                      </p>
                      <p className="text-ink-3 text-[13px]">{u.email}</p>
                    </Td>
                    <Td>
                      {u.twoFactorEnabled ? (
                        <Tag tone="brand">{t.adminManage.users.on}</Tag>
                      ) : (
                        <Tag tone="warn">{t.adminManage.users.off}</Tag>
                      )}
                      {u.passkeys ? (
                        <span className="text-ink-3 ml-2 text-[12px]">
                          {t.adminManage.users.passkeys(u.passkeys)}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="text-ink-2 whitespace-nowrap">
                      {formatDate(u.createdAt, locale)}
                    </Td>
                    <Td
                      className="text-ink-2 whitespace-nowrap"
                      title={
                        u.lastActiveAt
                          ? formatDateTime(u.lastActiveAt, locale)
                          : undefined
                      }
                    >
                      {u.lastActiveAt
                        ? formatRelative(u.lastActiveAt, undefined, locale)
                        : "—"}
                    </Td>
                    <Td>
                      {u.role === "admin"
                        ? t.adminManage.users.admin
                        : t.adminManage.users.member}
                    </Td>
                    <Td className="text-right">
                      {self ? (
                        <Link
                          href="/settings"
                          className="text-ink-2 text-[13px] font-semibold underline-offset-4 hover:underline"
                        >
                          {t.adminManage.users.yourSettings}
                        </Link>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setManagingId(u.id)}
                        >
                          {t.adminManage.users.manage}
                        </Button>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Section>

      <UserDrawer
        key={managingId ?? "closed"}
        user={managing}
        emailConfigured={security.emailConfigured}
        onClose={() => setManagingId(null)}
        onChanged={refresh}
      />
    </div>
  );
}
