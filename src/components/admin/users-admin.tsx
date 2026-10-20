"use client";

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
        title="People"
        description="Admins manage this console. Members only see their own data."
      >
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <FilterTabs
            label="Filter people"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Everyone", count: counts.all },
              { value: "admins", label: "Admins", count: counts.admins },
              { value: "no2fa", label: "No two-step", count: counts.no2fa },
              ...(counts.disabled
                ? [
                    {
                      value: "disabled" as const,
                      label: "Disabled",
                      count: counts.disabled,
                    },
                  ]
                : []),
            ]}
          />
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="text-ink-3 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              aria-label="Search people"
              placeholder="Search name or email"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState title="No one matches">
            Try another filter or search.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Two-step</Th>
                <Th>Joined</Th>
                <Th>Last active</Th>
                <Th>Role</Th>
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
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
                            You
                          </Tag>
                        ) : null}
                        {u.banned ? (
                          <Tag tone="loss" className="ml-2">
                            Disabled
                          </Tag>
                        ) : null}
                      </p>
                      <p className="text-ink-3 text-[13px]">{u.email}</p>
                    </Td>
                    <Td>
                      {u.twoFactorEnabled ? (
                        <Tag tone="brand">On</Tag>
                      ) : (
                        <Tag tone="warn">Off</Tag>
                      )}
                      {u.passkeys ? (
                        <span className="text-ink-3 ml-2 text-[12px]">
                          {u.passkeys} passkey{u.passkeys === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="text-ink-2 whitespace-nowrap">
                      {formatDate(u.createdAt)}
                    </Td>
                    <Td
                      className="text-ink-2 whitespace-nowrap"
                      title={
                        u.lastActiveAt
                          ? formatDateTime(u.lastActiveAt)
                          : undefined
                      }
                    >
                      {u.lastActiveAt ? formatRelative(u.lastActiveAt) : "—"}
                    </Td>
                    <Td>{u.role === "admin" ? "Admin" : "Member"}</Td>
                    <Td className="text-right">
                      {self ? (
                        <Link
                          href="/settings"
                          className="text-ink-2 text-[13px] font-semibold underline-offset-4 hover:underline"
                        >
                          Your settings
                        </Link>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setManagingId(u.id)}
                        >
                          Manage
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
      success("Invitation revoked. Its link no longer works.");
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
      title="Invite someone"
      description="Links are single-use and expire after 7 days. The link is shown once, here."
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
        <Field label="Email" htmlFor="invite-email">
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="family@example.com"
          />
        </Field>
        <Field label="Role" htmlFor="invite-role">
          <Select id="invite-role" name="role" defaultValue="user">
            <option value="user">Member</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        <Button type="submit" loading={invite.isPending}>
          <Link2 className="size-4" />
          Create link
        </Button>
        {emailConfigured ? (
          <Checkbox
            name="sendEmail"
            label="Also email the link to them"
            defaultChecked
            className="sm:col-span-3"
          />
        ) : (
          <p className="text-ink-3 text-[13px] sm:col-span-3">
            Email is not set up, so hand the link over yourself.{" "}
            <Link
              href="/admin/system"
              className="font-semibold underline underline-offset-4"
            >
              Set up email
            </Link>
          </p>
        )}
      </form>

      <FlashNotice flash={flash} className="mt-4" />
      {created ? (
        <div className="mt-5 space-y-2">
          {created.emailed ? (
            <Notice tone="success">Emailed the link to {created.email}.</Notice>
          ) : created.emailError ? (
            <Notice tone="warn">
              The invite was created but the email failed: {created.emailError}{" "}
              Copy the link below instead.
            </Notice>
          ) : null}
          <CopyField key={created.url} value={created.url} />
        </div>
      ) : null}

      {invites.length ? (
        <div className="mt-8">
          <h3 className="mb-2 text-sm font-semibold">Invitations</h3>
          <Table>
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => (
                <Tr key={inv.id}>
                  <Td className="font-medium">{inv.email}</Td>
                  <Td>{inv.role === "admin" ? "Admin" : "Member"}</Td>
                  <Td>
                    {inv.expired ? (
                      <Tag tone="warn">Expired {formatDate(inv.expiresAt)}</Tag>
                    ) : (
                      <span className="text-ink-2">
                        Expires {formatDate(inv.expiresAt)}
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
                        Send new link
                      </Button>
                    ) : (
                      <ConfirmButton
                        variant="ghost"
                        size="sm"
                        confirmLabel="Revoke link?"
                        onConfirm={() => revoke.mutate({ id: inv.id })}
                      >
                        Revoke
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
          ? `${user?.name} is now an admin.`
          : `${user?.name} is now a member.`,
      )(),
    onError: error,
  });
  const revokeSession = api.admin.users.revokeSession.useMutation(
    handlers("Signed out of that device."),
  );
  const revokeSessions = api.admin.users.revokeSessions.useMutation({
    onMutate: clear,
    onSuccess: (r) =>
      after(
        `Signed out of ${r.revoked} session${r.revoked === 1 ? "" : "s"}.`,
      )(),
    onError: error,
  });
  const resetTwoFactor = api.admin.users.resetTwoFactor.useMutation(
    handlers(
      "Two-step removed and signed out. They set it up again at next sign-in.",
    ),
  );
  const createReset = api.admin.users.createPasswordReset.useMutation({
    onMutate: clear,
    onSuccess: async (data) => {
      setReset(data);
      if (data.emailError) {
        error(`Reset link created, but the email failed: ${data.emailError}`);
      } else {
        await after(
          data.emailed
            ? `Reset link emailed to ${user?.email}. Older links no longer work.`
            : "Reset link created. Older links no longer work.",
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
          ? "Account disabled and signed out."
          : "Account re-enabled.",
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
            title="Role"
            description={
              isAdmin
                ? "Admin: can change every setting in this console, but still cannot see other people's finances."
                : "Member: sees only their own accounts and the workspaces shared with them."
            }
            actions={
              <ConfirmButton
                variant={isAdmin ? "danger" : "secondary"}
                size="sm"
                loading={setRole.isPending}
                confirmLabel={
                  isAdmin ? "Remove admin access?" : "Give admin access?"
                }
                onConfirm={() =>
                  setRole.mutate({
                    userId,
                    role: isAdmin ? "user" : "admin",
                  })
                }
              >
                {isAdmin ? "Make member" : "Make admin"}
              </ConfirmButton>
            }
          />

          <Section
            title="Sessions"
            description="Devices signed in to this account."
            actions={
              sessions.data && sessions.data.length > 1 ? (
                <ConfirmButton
                  variant="danger"
                  size="sm"
                  confirmLabel="Sign out all?"
                  loading={revokeSessions.isPending}
                  onConfirm={() => revokeSessions.mutate({ userId })}
                >
                  Sign out everywhere
                </ConfirmButton>
              ) : null
            }
          >
            {sessions.isLoading ? (
              <p className="text-ink-3 text-sm">Loading…</p>
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
                        {s.ipAddress ?? "Unknown IP"} · active{" "}
                        {formatRelative(s.lastActiveAt)} · signed in{" "}
                        {formatDate(s.createdAt)}
                      </p>
                    </div>
                    <ConfirmButton
                      variant="ghost"
                      size="sm"
                      confirmLabel="Sign out?"
                      loading={
                        revokeSession.isPending &&
                        revokeSession.variables?.sessionId === s.id
                      }
                      onConfirm={() =>
                        revokeSession.mutate({ userId, sessionId: s.id })
                      }
                    >
                      Sign out
                    </ConfirmButton>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-3 text-sm">Not signed in anywhere.</p>
            )}
          </Section>

          <Section
            title="Recent sign-ins"
            actions={
              <Link
                href={`/admin/security?user=${encodeURIComponent(userId)}`}
                className="text-brand text-[13px] font-semibold underline-offset-4 hover:underline"
              >
                Full history
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
                      {e.success ? "Signed in" : "Failed"}
                    </span>
                    <span className="text-ink-2">
                      {e.device} · {e.ipAddress ?? "unknown IP"} ·{" "}
                      {formatRelative(e.createdAt)}
                    </span>
                    {e.newDevice ? <Tag tone="warn">New device</Tag> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-3 text-sm">
                {signIns.isLoading ? "Loading…" : "No sign-ins recorded yet."}
              </p>
            )}
          </Section>

          <Section
            title="Two-step verification"
            description={
              user.twoFactorEnabled
                ? "On. For someone who lost their authenticator: resetting removes it and signs them out; they enrol again at next sign-in."
                : "Not set up yet."
            }
            actions={
              user.twoFactorEnabled ? (
                <ConfirmButton
                  variant="danger"
                  size="sm"
                  confirmLabel="Reset two-step?"
                  loading={resetTwoFactor.isPending}
                  onConfirm={() => resetTwoFactor.mutate({ userId })}
                >
                  Reset two-step
                </ConfirmButton>
              ) : null
            }
          />

          <Section
            title="Password"
            description="A single-use reset link, valid for 24 hours. Using it signs them out everywhere."
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
                Create reset link
              </Button>
            }
          >
            {emailConfigured || reset ? (
              <div className="space-y-3">
                {emailConfigured ? (
                  <Checkbox
                    label={`Email it to ${user.email}`}
                    checked={emailReset}
                    onChange={(e) => setEmailReset(e.target.checked)}
                  />
                ) : null}
                {reset ? (
                  <>
                    <CopyField value={reset.url} />
                    <p className="text-ink-3 text-[13px]">
                      Shown once. Expires {formatDateTime(reset.expiresAt)}.
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}
          </Section>

          <Section
            title="Access"
            description={
              user.banned
                ? "This account is disabled and cannot sign in."
                : "Disabling signs them out and blocks sign-in. Their data is kept."
            }
            actions={
              user.banned ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={setBanned.isPending}
                  onClick={() => setBanned.mutate({ userId, banned: false })}
                >
                  Re-enable
                </Button>
              ) : (
                <ConfirmButton
                  variant="danger"
                  size="sm"
                  confirmLabel="Disable account?"
                  loading={setBanned.isPending}
                  onConfirm={() => setBanned.mutate({ userId, banned: true })}
                >
                  Disable
                </ConfirmButton>
              )
            }
          />
        </div>
      ) : null}
    </Drawer>
  );
}
