"use client";

import { useT, useLocale } from "~/i18n/client";

import { Link2, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { CopyField } from "~/components/ui/copy-field";
import { Drawer } from "~/components/ui/dialog";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Checkbox, Field, Input, Select } from "~/components/ui/field";
import { EmptyState, Notice, Section, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { FilterTabs } from "~/components/ui/tabs";
import { useFlash } from "~/components/ui/use-flash";
import { formatDate, formatDateTime, formatRelative } from "~/lib/format";
import { formText } from "~/lib/form";
import {
  describeUserAgent,
  sessionMethodLabels as methodLabels,
} from "~/lib/user-agent";
import { api, type RouterOutputs } from "~/trpc/react";

type AdminUser = RouterOutputs["admin"]["users"]["list"][number];
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

function InviteSection({
  emailConfigured,
  onChanged,
}: {
  emailConfigured: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const locale = useLocale();
  const t = useT();
  const [invites] = api.admin.users.invitations.useSuspenseQuery();
  const [created, setCreated] = useState<{
    url: string;
    email: string;
    emailed: boolean;
    emailError: string | null;
  } | null>(null);
  const { flash, success, error, clear } = useFlash();

  const invite = api.admin.users.invite.useMutation();
  const revoke = api.admin.users.revokeInvite.useMutation({
    onSuccess: async () => {
      success(t.adminManage.users.invitationRevoked);
      await onChanged();
    },
    onError: error,
  });

  async function send(
    values: { email: string; role: "user" | "admin"; sendEmail: boolean },
    form?: HTMLFormElement,
  ) {
    clear();
    try {
      const result = await invite.mutateAsync(values);
      // Only clear the form once the invite exists, so a typo is not lost on an error.
      form?.reset();
      setCreated({ ...result, email: values.email });
      await onChanged();
    } catch (err) {
      error(err as { message: string });
    }
  }

  return (
    <Section
      title={t.adminManage.users.inviteSomeone}
      description={t.adminManage.users.invitationHelp}
    >
      <form
        className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void send(
            {
              email: formText(form, "email"),
              role: form.get("role") === "admin" ? "admin" : "user",
              sendEmail: form.get("sendEmail") === "on",
            },
            event.currentTarget,
          );
        }}
      >
        <Field label={t.common.fields.email} htmlFor="invite-email">
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder={t.adminManage.users.inviteEmailPlaceholder}
          />
        </Field>
        <Field label={t.adminManage.users.role} htmlFor="invite-role">
          <Select id="invite-role" name="role" defaultValue="user">
            <option value="user">{t.adminManage.users.member}</option>
            <option value="admin">{t.adminManage.users.admin}</option>
          </Select>
        </Field>
        <Button type="submit" loading={invite.isPending}>
          <Link2 className="size-4" />
          {t.adminManage.users.createLink}
        </Button>
        {emailConfigured ? (
          <Checkbox
            name="sendEmail"
            label={t.adminManage.users.emailInviteLabel}
            defaultChecked
            className="sm:col-span-3"
          />
        ) : (
          <p className="text-ink-3 text-[13px] sm:col-span-3">
            {t.adminManage.users.emailUnavailableHelp}{" "}
            <Link
              href="/admin/system"
              className="font-semibold underline underline-offset-4"
            >
              {t.adminManage.users.setUpEmail}
            </Link>
          </p>
        )}
      </form>

      <FlashNotice flash={flash} className="mt-4" />
      {created ? (
        <div className="mt-5 space-y-2">
          {created.emailed ? (
            <Notice tone="success">
              {t.adminManage.users.invitedEmail(created.email)}
            </Notice>
          ) : created.emailError ? (
            <Notice tone="warn">
              {t.adminManage.users.inviteFailed(created.emailError)}
              {t.adminManage.users.copyTheLinkBelowInstead}
            </Notice>
          ) : null}
          <CopyField key={created.url} value={created.url} />
        </div>
      ) : null}

      {invites.length ? (
        <div className="mt-8">
          <h3 className="mb-2 text-sm font-semibold">
            {t.adminManage.users.invitations}
          </h3>
          <Table>
            <thead>
              <tr>
                <Th>{t.common.fields.email}</Th>
                <Th>{t.adminManage.users.role}</Th>
                <Th>{t.common.fields.status}</Th>
                <Th className="text-right">
                  <span className="sr-only">{t.adminManage.users.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => (
                <Tr key={inv.id}>
                  <Td className="font-medium">{inv.email}</Td>
                  <Td>
                    {inv.role === "admin"
                      ? t.adminManage.users.admin
                      : t.adminManage.users.member}
                  </Td>
                  <Td>
                    {inv.expired ? (
                      <Tag tone="warn">
                        {t.adminManage.users.expired(
                          formatDate(inv.expiresAt, locale),
                        )}
                      </Tag>
                    ) : (
                      <span className="text-ink-2">
                        {t.adminManage.users.expires(
                          formatDate(inv.expiresAt, locale),
                        )}
                      </span>
                    )}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    {inv.expired ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={
                          invite.isPending &&
                          invite.variables?.email === inv.email
                        }
                        onClick={() =>
                          void send({
                            email: inv.email,
                            role: inv.role === "admin" ? "admin" : "user",
                            sendEmail: emailConfigured,
                          })
                        }
                      >
                        {t.adminManage.users.sendNewLink}
                      </Button>
                    ) : (
                      <ConfirmButton
                        variant="ghost"
                        size="sm"
                        confirmLabel={t.adminManage.users.revokeLink}
                        onConfirm={() => revoke.mutate({ id: inv.id })}
                      >
                        {t.adminManage.users.revoke}
                      </ConfirmButton>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}
    </Section>
  );
}

function UserDrawer({
  user,
  emailConfigured,
  onClose,
  onChanged,
}: {
  user: AdminUser | null;
  emailConfigured: boolean;
  onClose: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const locale = useLocale();
  const t = useT();
  const userId = user?.id ?? "";
  const utils = api.useUtils();
  const sessions = api.admin.users.sessions.useQuery(
    { userId },
    { enabled: !!user },
  );
  const signIns = api.admin.security.signIns.useQuery(
    { userId },
    { enabled: !!user },
  );
  const { flash, success, error, clear } = useFlash(8000);
  const [reset, setReset] = useState<{
    url: string;
    expiresAt: Date;
  } | null>(null);
  const [emailReset, setEmailReset] = useState(emailConfigured);

  const after = (message: string) => async () => {
    success(message);
    await Promise.all([
      onChanged(),
      utils.admin.users.sessions.invalidate({ userId }),
    ]);
  };
  const handlers = (message: string) => ({
    onMutate: clear,
    onSuccess: after(message),
    onError: error,
  });

  const setRole = api.admin.users.setRole.useMutation({
    onMutate: clear,
    onSuccess: (_, input) =>
      after(
        input.role === "admin"
          ? t.adminManage.users.adminGranted(user?.name)
          : t.adminManage.users.memberGranted(user?.name),
      )(),
    onError: error,
  });
  const revokeSession = api.admin.users.revokeSession.useMutation(
    handlers(t.adminManage.users.signedOutOfThatDevice),
  );
  const revokeSessions = api.admin.users.revokeSessions.useMutation({
    onMutate: clear,
    onSuccess: (r) => after(t.adminManage.users.sessionsRevoked(r.revoked))(),
    onError: error,
  });
  const resetTwoFactor = api.admin.users.resetTwoFactor.useMutation(
    handlers(t.adminManage.users.twoStepReset),
  );
  const createReset = api.admin.users.createPasswordReset.useMutation({
    onMutate: clear,
    onSuccess: async (data) => {
      setReset(data);
      if (data.emailError) {
        error(t.adminManage.users.resetEmailFailed(data.emailError));
      } else {
        await after(
          data.emailed
            ? t.adminManage.users.resetEmailSent(user?.email)
            : t.adminManage.users.resetLinkCreated,
        )();
      }
    },
    onError: error,
  });
  const setBanned = api.admin.users.setBanned.useMutation({
    onMutate: clear,
    onSuccess: (_, input) =>
      after(
        input.banned
          ? t.adminManage.users.accountDisabledAndSignedOut
          : t.adminManage.users.accountReenabled,
      )(),
    onError: error,
  });

  const isAdmin = user?.role === "admin";

  return (
    <Drawer
      open={user !== null}
      onClose={onClose}
      title={user?.name ?? ""}
      description={user?.email}
    >
      {user ? (
        <div className="space-y-5">
          <FlashNotice flash={flash} />

          <Section
            title={t.adminManage.users.role}
            description={
              isAdmin
                ? t.adminManage.users.adminRoleHelp
                : t.adminManage.users.memberRoleHelp
            }
            actions={
              <ConfirmButton
                variant={isAdmin ? "danger" : "secondary"}
                size="sm"
                loading={setRole.isPending}
                confirmLabel={
                  isAdmin
                    ? t.adminManage.users.removeAdminAccess
                    : t.adminManage.users.giveAdminAccess
                }
                onConfirm={() =>
                  setRole.mutate({
                    userId,
                    role: isAdmin ? "user" : "admin",
                  })
                }
              >
                {isAdmin
                  ? t.adminManage.users.makeMember
                  : t.adminManage.users.makeAdmin}
              </ConfirmButton>
            }
          />

          <Section
            title={t.adminManage.users.sessions}
            description={t.adminManage.users.sessionsHelp}
            actions={
              sessions.data && sessions.data.length > 1 ? (
                <ConfirmButton
                  variant="danger"
                  size="sm"
                  confirmLabel={t.adminManage.users.signOutAll}
                  loading={revokeSessions.isPending}
                  onConfirm={() => revokeSessions.mutate({ userId })}
                >
                  {t.adminManage.users.signOutEverywhere}
                </ConfirmButton>
              ) : null
            }
          >
            {sessions.isLoading ? (
              <p className="text-ink-3 text-sm">{t.common.status.loading}</p>
            ) : sessions.data?.length ? (
              <ul className="border-line divide-line divide-y border-t">
                {sessions.data.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 py-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className="font-semibold"
                        title={s.userAgent ?? undefined}
                      >
                        {describeUserAgent(s.userAgent)}
                        {s.method ? (
                          <Tag tone="outline" className="ml-2">
                            {methodLabels[s.method] ?? s.method}
                          </Tag>
                        ) : null}
                      </p>
                      <p className="text-ink-2 text-[13px]">
                        {t.adminManage.users.sessionActivity(
                          s.ipAddress ?? t.adminManage.users.unknownIP,
                          formatRelative(s.lastActiveAt, undefined, locale),
                          formatDate(s.createdAt, locale),
                        )}
                      </p>
                    </div>
                    <ConfirmButton
                      variant="ghost"
                      size="sm"
                      confirmLabel={t.adminManage.users.signOut}
                      loading={
                        revokeSession.isPending &&
                        revokeSession.variables?.sessionId === s.id
                      }
                      onConfirm={() =>
                        revokeSession.mutate({ userId, sessionId: s.id })
                      }
                    >
                      {t.adminManage.users.signOut}
                    </ConfirmButton>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-3 text-sm">
                {t.adminManage.users.notSignedInAnywhere}
              </p>
            )}
          </Section>

          <Section
            title={t.adminManage.users.recentSignins}
            actions={
              <Link
                href={`/admin/security?user=${encodeURIComponent(userId)}`}
                className="text-brand text-[13px] font-semibold underline-offset-4 hover:underline"
              >
                {t.adminManage.users.fullHistory}
              </Link>
            }
          >
            {signIns.data?.items.length ? (
              <ul className="space-y-2 text-[13px]">
                {signIns.data.items.slice(0, 6).map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-x-2">
                    <span
                      className={
                        e.success ? "text-ink" : "text-loss font-semibold"
                      }
                    >
                      {e.success
                        ? t.adminManage.users.signedIn
                        : t.adminManage.users.failed}
                    </span>
                    <span className="text-ink-2">
                      {e.device} ·{" "}
                      {e.ipAddress ?? t.adminManage.users.unknownIP} ·{" "}
                      {formatRelative(e.createdAt, undefined, locale)}
                    </span>
                    {e.newDevice ? (
                      <Tag tone="warn">{t.adminManage.users.newDevice}</Tag>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-3 text-sm">
                {signIns.isLoading
                  ? t.common.status.loading
                  : t.adminManage.users.noSigninsRecordedYet}
              </p>
            )}
          </Section>

          <Section
            title={t.adminManage.users.twoStepVerification}
            description={
              user.twoFactorEnabled
                ? t.adminManage.users.twoStepResetHelp
                : t.adminManage.users.notSetUpYet
            }
            actions={
              user.twoFactorEnabled ? (
                <ConfirmButton
                  variant="danger"
                  size="sm"
                  confirmLabel={t.adminManage.users.resetTwostep}
                  loading={resetTwoFactor.isPending}
                  onConfirm={() => resetTwoFactor.mutate({ userId })}
                >
                  {t.adminManage.users.resetTwostep}
                </ConfirmButton>
              ) : null
            }
          />

          <Section
            title={t.adminManage.users.password}
            description={t.adminManage.users.passwordResetHelp}
            actions={
              <Button
                variant="secondary"
                size="sm"
                loading={createReset.isPending}
                onClick={() =>
                  createReset.mutate({
                    userId,
                    sendEmail: emailConfigured && emailReset,
                  })
                }
              >
                <Link2 className="size-3.5" />
                {t.adminManage.users.createResetLink}
              </Button>
            }
          >
            {emailConfigured || reset ? (
              <div className="space-y-3">
                {emailConfigured ? (
                  <Checkbox
                    label={t.adminManage.users.emailItTo(user.email)}
                    checked={emailReset}
                    onChange={(e) => setEmailReset(e.target.checked)}
                  />
                ) : null}
                {reset ? (
                  <>
                    <CopyField value={reset.url} />
                    <p className="text-ink-3 text-[13px]">
                      {t.adminManage.users.resetExpires(
                        formatDateTime(reset.expiresAt, locale),
                      )}
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}
          </Section>

          <Section
            title={t.adminManage.users.access}
            description={
              user.banned
                ? t.adminManage.users.disabledAccountHelp
                : t.adminManage.users.disableAccountHelp
            }
            actions={
              user.banned ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={setBanned.isPending}
                  onClick={() => setBanned.mutate({ userId, banned: false })}
                >
                  {t.adminManage.users.reenable}
                </Button>
              ) : (
                <ConfirmButton
                  variant="danger"
                  size="sm"
                  confirmLabel={t.adminManage.users.disableAccount}
                  loading={setBanned.isPending}
                  onConfirm={() => setBanned.mutate({ userId, banned: true })}
                >
                  {t.adminManage.users.disable}
                </ConfirmButton>
              )
            }
          />
        </div>
      ) : null}
    </Drawer>
  );
}
