"use client";

import { Copy, Link2 } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Field, Input, Select } from "~/components/ui/field";
import { Notice, Section, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { formatDate } from "~/lib/format";
import { api } from "~/trpc/react";
import { formText } from "~/lib/form";

export function UsersAdmin({ currentUserId }: { currentUserId: string }) {
  const utils = api.useUtils();
  const [users] = api.admin.users.list.useSuspenseQuery();
  const [invites] = api.admin.users.invitations.useSuspenseQuery();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = () =>
    Promise.all([
      utils.admin.users.list.invalidate(),
      utils.admin.users.invitations.invalidate(),
    ]);
  const setRole = api.admin.users.setRole.useMutation({ onSettled: refresh });
  const setBanned = api.admin.users.setBanned.useMutation({
    onSettled: refresh,
  });
  const revoke = api.admin.users.revokeInvite.useMutation({
    onSettled: refresh,
  });
  const invite = api.admin.users.invite.useMutation({
    onSuccess: async (data) => {
      setInviteUrl(data.url);
      setCopied(false);
      await refresh();
    },
  });

  const mutationError = setRole.error ?? setBanned.error ?? revoke.error;

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
          <div className="border-forest bg-wash mt-5 flex flex-wrap items-center gap-3 border-2 p-4">
            <code className="min-w-0 flex-1 text-[13px] break-all">
              {inviteUrl}
            </code>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(inviteUrl);
                setCopied(true);
              }}
            >
              <Copy className="size-3.5" />
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revoke.mutate({ id: inv.id })}
                      >
                        Revoke
                      </Button>
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
              <Th>Role</Th>
              <Th className="text-right">Access</Th>
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
                      <Tag tone="mint" className="ml-2">
                        You
                      </Tag>
                    ) : null}
                  </Td>
                  <Td>{u.email}</Td>
                  <Td>
                    {u.twoFactorEnabled ? (
                      <Tag tone="forest">On</Tag>
                    ) : (
                      <Tag tone="warn">Off</Tag>
                    )}
                  </Td>
                  <Td className="text-ink-2">{formatDate(u.createdAt)}</Td>
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
                        variant={u.banned ? "secondary" : "danger"}
                        size="sm"
                        onClick={() =>
                          setBanned.mutate({ userId: u.id, banned: !u.banned })
                        }
                      >
                        {u.banned ? "Re-enable" : "Disable"}
                      </Button>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Section>
    </div>
  );
}
