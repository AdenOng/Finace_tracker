"use client";

import { Copy, Link2 } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { Drawer } from "~/components/ui/dialog";
import { Field, Input, Select } from "~/components/ui/field";
import { Notice, Section, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { formatDate, formatDateTime } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";
import { formText } from "~/lib/form";

type AdminUser = RouterOutputs["admin"]["users"]["list"][number];

export function UsersAdmin({ currentUserId }: { currentUserId: string }) {
  const utils = api.useUtils();
  const [users] = api.admin.users.list.useSuspenseQuery();
  const [invites] = api.admin.users.invitations.useSuspenseQuery();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const managing = users.find((u) => u.id === managingId) ?? null;

  const refresh = () =>
    Promise.all([
      utils.admin.users.list.invalidate(),
      utils.admin.users.invitations.invalidate(),
    ]);
  const setRole = api.admin.users.setRole.useMutation({ onSettled: refresh });
  const revoke = api.admin.users.revokeInvite.useMutation({
    onSettled: refresh,
  });
  const invite = api.admin.users.invite.useMutation({
    onSuccess: async (data) => {
      setInviteUrl(data.url);
      await refresh();
    },
  });

  const mutationError = setRole.error ?? revoke.error;

  return (
    <div className="space-y-14">
      <Section
        title="Invite someone"
        description="Links are single-use and expire after 7 days. Only you see the link, once."
      >
        <form
          className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            invite.mutate({
              email: formText(form, "email"),
              role: form.get("role") === "admin" ? "admin" : "user",
            });
            event.currentTarget.reset();
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
        </form>
        {invite.error ? (
          <Notice tone="error" className="mt-4">
            {invite.error.message}
          </Notice>
        ) : null}
        {inviteUrl ? (
          <CopyLink key={inviteUrl} url={inviteUrl} className="mt-5" />
        ) : null}

        {invites.length ? (
          <div className="mt-8">
            <h3 className="mb-2 text-sm font-semibold">Pending invitations</h3>
            <Table>
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Expires</Th>
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
                    <Td className="text-ink-2">{formatDate(inv.expiresAt)}</Td>
                    <Td className="text-right">
                      <ConfirmButton
                        variant="ghost"
                        size="sm"
                        confirmLabel="Revoke?"
                        onConfirm={() => revoke.mutate({ id: inv.id })}
                      >
                        Revoke
                      </ConfirmButton>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : null}
      </Section>

      <Section
        title="People"
        description="Admins manage this console. Members only see their own data."
      >
        {mutationError ? (
          <Notice tone="error" className="mb-4">
            {mutationError.message}
          </Notice>
        ) : null}
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
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
            {users.map((u) => {
              const self = u.id === currentUserId;
              return (
                <Tr key={u.id} className={u.banned ? "text-ink-3" : undefined}>
                  <Td className="font-semibold">
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
                  </Td>
                  <Td>{u.email}</Td>
                  <Td>
                    {u.twoFactorEnabled ? (
                      <Tag tone="brand">On</Tag>
                    ) : (
                      <Tag tone="warn">Off</Tag>
                    )}
                  </Td>
                  <Td className="text-ink-2">{formatDate(u.createdAt)}</Td>
                  <Td className="text-ink-2">
                    {u.lastActiveAt ? formatDate(u.lastActiveAt) : "—"}
                  </Td>
                  <Td>
                    <Select
                      aria-label={`Role for ${u.name}`}
                      className="h-8 w-32 text-[13px]"
                      value={u.role ?? "user"}
                      disabled={self || setRole.isPending}
                      onChange={(e) =>
                        setRole.mutate({
                          userId: u.id,
                          role: e.target.value === "admin" ? "admin" : "user",
                        })
                      }
                    >
                      <option value="user">Member</option>
                      <option value="admin">Admin</option>
                    </Select>
                  </Td>
                  <Td className="text-right">
                    {self ? null : (
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
      </Section>

      <UserDrawer
        key={managingId ?? "closed"}
        user={managing}
        onClose={() => setManagingId(null)}
        onChanged={refresh}
      />
    </div>
  );
}

function CopyLink({ url, className }: { url: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={`border-brand bg-wash flex flex-wrap items-center gap-3 border-2 p-4 ${className ?? ""}`}
    >
      <code className="min-w-0 flex-1 text-[13px] break-all">{url}</code>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          void navigator.clipboard.writeText(url);
          setCopied(true);
        }}
      >
        <Copy className="size-3.5" />
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}

/** Short "Chrome on macOS" label; the raw string is kept in the tooltip. */
function describeUserAgent(userAgent: string | null) {
  if (!userAgent) return "Unknown device";
  const browser =
    [
      ["Edg/", "Edge"],
      ["Firefox/", "Firefox"],
      ["Chrome/", "Chrome"],
      ["Safari/", "Safari"],
    ].find(([needle]) => userAgent.includes(needle!))?.[1] ?? "Browser";
  const os =
    [
      ["iPhone", "iPhone"],
      ["iPad", "iPad"],
      ["Android", "Android"],
      ["Windows", "Windows"],
      ["Mac OS", "macOS"],
      ["Linux", "Linux"],
    ].find(([needle]) => userAgent.includes(needle!))?.[1] ?? null;
  return os ? `${browser} on ${os}` : browser;
}

function UserDrawer({
  user,
  onClose,
  onChanged,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const userId = user?.id ?? "";
  const utils = api.useUtils();
  const sessions = api.admin.users.sessions.useQuery(
    { userId },
    { enabled: !!user },
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [reset, setReset] = useState<{ url: string; expiresAt: Date } | null>(
    null,
  );
  const afterChange = (message: string) => async () => {
    setNotice(message);
    await Promise.all([
      onChanged(),
      utils.admin.users.sessions.invalidate({ userId }),
    ]);
  };

  const revokeSessions = api.admin.users.revokeSessions.useMutation({
    onSuccess: (r) =>
      afterChange(
        `Signed out of ${r.revoked} session${r.revoked === 1 ? "" : "s"}.`,
      )(),
  });
  const resetTwoFactor = api.admin.users.resetTwoFactor.useMutation({
    onSuccess: afterChange(
      "Two-step removed and signed out. They set it up again at next sign-in.",
    ),
  });
  const createReset = api.admin.users.createPasswordReset.useMutation({
    onSuccess: async (data) => {
      setReset(data);
      await afterChange("Reset link created. Older links no longer work.")();
    },
  });
  const setBanned = api.admin.users.setBanned.useMutation({
    onSuccess: (_, input) =>
      afterChange(
        input.banned
          ? "Account disabled and signed out."
          : "Account re-enabled.",
      )(),
  });
  const error =
    revokeSessions.error ??
    resetTwoFactor.error ??
    createReset.error ??
    setBanned.error;

  return (
    <Drawer
      open={user !== null}
      onClose={onClose}
      title={user?.name ?? ""}
      description={user?.email}
    >
      {user ? (
        <div className="space-y-10">
          {error ? <Notice tone="error">{error.message}</Notice> : null}
          {notice ? <Notice tone="success">{notice}</Notice> : null}

          <Section
            title="Sessions"
            description="Devices signed in to this account."
            actions={
              sessions.data?.length ? (
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
              <ul className="border-ink border-t-2">
                {sessions.data.map((s) => (
                  <li key={s.id} className="border-line border-b py-3 text-sm">
                    <p
                      className="font-semibold"
                      title={s.userAgent ?? undefined}
                    >
                      {describeUserAgent(s.userAgent)}
                    </p>
                    <p className="text-ink-2 text-[13px]">
                      {s.ipAddress ?? "Unknown IP"} · last active{" "}
                      {formatDateTime(s.lastActiveAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-3 text-sm">Not signed in anywhere.</p>
            )}
          </Section>

          <Section
            title="Two-step verification"
            description={
              user.twoFactorEnabled
                ? "For someone who lost their authenticator. Removes it and signs them out; they enrol again at next sign-in."
                : "Not set up."
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
          >
            {null}
          </Section>

          <Section
            title="Password"
            description="Create a single-use reset link valid for 24 hours and hand it over yourself. Using it signs them out everywhere."
            actions={
              <Button
                variant="secondary"
                size="sm"
                loading={createReset.isPending}
                onClick={() => createReset.mutate({ userId })}
              >
                <Link2 className="size-3.5" />
                Create reset link
              </Button>
            }
          >
            {reset ? (
              <>
                <CopyLink url={reset.url} />
                <p className="text-ink-3 mt-2 text-[13px]">
                  Shown once. Expires {formatDateTime(reset.expiresAt)}.
                </p>
              </>
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
          >
            {null}
          </Section>
        </div>
      ) : null}
    </Drawer>
  );
}
