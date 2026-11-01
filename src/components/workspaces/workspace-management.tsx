"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT, useLocale } from "~/i18n/client";
import { Button } from "~/components/ui/button";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { Field, Input, Select } from "~/components/ui/field";
import { Notice, Section, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { formText } from "~/lib/form";
import { formatDate } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Workspace = RouterOutputs["workspaces"]["get"];

export function WorkspaceManagement({
  workspace: w,
  accounts,
}: {
  workspace: Workspace;
  accounts: RouterOutputs["accounts"]["list"];
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const utils = api.useUtils();
  const personal = api.accounts.list.useQuery();
  const currencies = api.catalog.currencies.useQuery();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const invite = api.workspaces.invite.useMutation();
  const revoke = api.workspaces.revokeInvitation.useMutation();
  const share = api.workspaces.shareAccount.useMutation();
  const unshare = api.workspaces.unshareAccount.useMutation();
  const setRole = api.workspaces.setMemberRole.useMutation();
  const removeMember = api.workspaces.removeMember.useMutation();
  const transfer = api.workspaces.transferOwnership.useMutation();
  const remove = api.workspaces.remove.useMutation();
  const update = api.workspaces.update.useMutation();
  const owner = w.role === "owner";
  const identity = { workspaceId: w.id };

  async function run(action: () => Promise<unknown>, leave = false) {
    setPending(true);
    setError(null);
    try {
      await action();
      // Refetch every audience affected by membership or grants, including account detail pages.
      await utils.invalidate();
      if (leave) router.replace("/workspaces");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t.workspaces.workspaceManagement.theActionCouldNotBeCompleted,
      );
    } finally {
      setPending(false);
    }
  }

  const shared = new Set(w.shares.map((s) => s.accountId));
  return (
    <div className="space-y-10">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Section
        title={t.workspaces.workspaceManagement.accountSharing}
        description={
          t.workspaces.workspaceManagement
            .sharingIncludesBalancesHoldingsAndTransactionHistory
        }
      >
        {w.role !== "viewer" ? (
          <form
            className="mb-5 flex flex-wrap gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const accountId = formText(
                new FormData(e.currentTarget),
                "accountId",
              );
              if (accountId)
                void run(() => share.mutateAsync({ ...identity, accountId }));
            }}
          >
            <Select
              name="accountId"
              aria-label={t.workspaces.workspaceManagement.accountToShare}
              className="max-w-md"
              required
              defaultValue=""
            >
              <option value="" disabled>
                {
                  t.workspaces.workspaceManagement
                    .chooseOneOfYourPrivateAccounts
                }
              </option>
              {(personal.data ?? [])
                .filter((a) => !shared.has(a.id) && !a.archivedAt)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
            <Button type="submit" disabled={pending || !personal.data}>
              {t.workspaces.workspaceManagement.shareAccount}
            </Button>
          </form>
        ) : (
          <p className="text-ink-2 mb-4 text-sm">
            {
              t.workspaces.workspaceManagement
                .viewersCanReadSharedAccountsAccountSharing
            }
          </p>
        )}
        {personal.error ? (
          <Notice tone="error">{personal.error.message}</Notice>
        ) : null}
        {accounts.length === 0 ? (
          <p className="text-ink-2 text-sm">
            {t.workspaces.workspaceManagement.noAccountsSharedYet}
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t.workspaces.workspaceManagement.account}</Th>
                <Th>{t.workspaces.workspaceManagement.owner}</Th>
                <Th>
                  <span className="sr-only">
                    {t.workspaces.workspaceManagement.sharingActions}
                  </span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    {a.name}
                    {a.archivedAt
                      ? t.workspaces.workspaceManagement.archived
                      : ""}
                  </Td>
                  <Td>{a.ownerName}</Td>
                  <Td className="text-right">
                    {owner || a.ownerId === w.userId ? (
                      <ConfirmButton
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onConfirm={() =>
                          void run(() =>
                            unshare.mutateAsync({
                              ...identity,
                              accountId: a.id,
                            }),
                          )
                        }
                      >
                        {t.workspaces.workspaceManagement.stopSharing}
                      </ConfirmButton>
                    ) : (
                      <Tag tone="outline">
                        {t.workspaces.workspaceManagement.readonly}
                      </Tag>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
      <Section
        title={t.workspaces.workspaceManagement.members}
        description={
          t.workspaces.workspaceManagement
            .ownerManagesMembershipMembersCanShareTheir
        }
      >
        <ul className="divide-line divide-y">
          {w.members.map((m) => (
            <li
              key={m.userId}
              className="flex flex-wrap items-center gap-3 py-3"
            >
              <span className="mr-auto font-semibold">
                {m.name}
                {m.userId === w.userId
                  ? t.workspaces.workspaceManagement.you
                  : ""}
              </span>
              <Tag>{t.workspaces.roles[m.role]}</Tag>
              {owner && m.role !== "owner" ? (
                <>
                  <ConfirmButton
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onConfirm={() =>
                      void run(() =>
                        setRole.mutateAsync({
                          ...identity,
                          userId: m.userId,
                          role: m.role === "member" ? "viewer" : "member",
                        }),
                      )
                    }
                  >
                    {m.role === "member"
                      ? t.workspaces.workspaceManagement
                          .makeViewerUnshareAccounts
                      : t.workspaces.workspaceManagement.makeMember}
                  </ConfirmButton>
                  <ConfirmButton
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onConfirm={() =>
                      void run(() =>
                        transfer.mutateAsync({ ...identity, userId: m.userId }),
                      )
                    }
                  >
                    {t.workspaces.workspaceManagement.transferOwnership}
                  </ConfirmButton>
                  <ConfirmButton
                    size="sm"
                    variant="danger"
                    disabled={pending}
                    onConfirm={() =>
                      void run(() =>
                        removeMember.mutateAsync({
                          ...identity,
                          userId: m.userId,
                        }),
                      )
                    }
                  >
                    {t.workspaces.workspaceManagement.removeMember}
                  </ConfirmButton>
                </>
              ) : null}
            </li>
          ))}
        </ul>
        {!owner ? (
          <ConfirmButton
            className="mt-4"
            variant="danger"
            disabled={pending}
            onConfirm={() =>
              void run(
                () =>
                  removeMember.mutateAsync({ ...identity, userId: w.userId }),
                true,
              )
            }
          >
            {t.workspaces.workspaceManagement.leaveWorkspace}
          </ConfirmButton>
        ) : null}
      </Section>
      {owner ? (
        <>
          <Section
            title={t.workspaces.workspaceManagement.inviteSomeone}
            description={
              t.workspaces.workspaceManagement.linksWorkOnceAndExpireInSeven
            }
          >
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                setInviteUrl(null);
                const form = new FormData(e.currentTarget);
                void run(async () => {
                  const result = await invite.mutateAsync({
                    ...identity,
                    email: formText(form, "email"),
                    role: formText(form, "role") as "member" | "viewer",
                  });
                  setInviteUrl(result.url);
                });
              }}
            >
              <Field label={t.common.fields.email} htmlFor="invite-email">
                <Input id="invite-email" name="email" type="email" required />
              </Field>
              <Field
                label={t.workspaces.workspaceManagement.access}
                htmlFor="invite-role"
              >
                <Select id="invite-role" name="role" defaultValue="viewer">
                  <option value="viewer">
                    {t.workspaces.workspaceManagement.viewer}
                  </option>
                  <option value="member">
                    {t.workspaces.workspaceManagement.memberCanShareOwnAccounts}
                  </option>
                </Select>
              </Field>
              <Button type="submit" disabled={pending}>
                {t.workspaces.workspaceManagement.createInvitationLink}
              </Button>
            </form>
            {inviteUrl ? (
              <div className="mt-4 space-y-2">
                <Field
                  label={t.workspaces.workspaceManagement.invitationLink}
                  htmlFor="invitation-link"
                >
                  <Input
                    id="invitation-link"
                    readOnly
                    value={inviteUrl}
                    onFocus={(e) => e.target.select()}
                  />
                </Field>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(inviteUrl)
                      .catch(() =>
                        setError(
                          t.workspaces.workspaceManagement
                            .copyTheInvitationLinkFromTheField,
                        ),
                      )
                  }
                >
                  {t.common.actions.copyLink}
                </Button>
              </div>
            ) : null}
            {w.invitations.length > 0 ? (
              <ul className="divide-line mt-5 divide-y">
                {w.invitations.map((i) => (
                  <li
                    key={i.id}
                    className="flex flex-wrap items-center gap-3 py-3"
                  >
                    <span className="mr-auto text-sm">
                      {t.workspaces.workspaceManagement.invitation(
                        i.email,
                        t.workspaces.roles[i.role],
                        formatDate(i.expiresAt, locale),
                      )}
                    </span>
                    <ConfirmButton
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onConfirm={() => {
                        setInviteUrl(null);
                        void run(() =>
                          revoke.mutateAsync({
                            ...identity,
                            invitationId: i.id,
                          }),
                        );
                      }}
                    >
                      {t.workspaces.workspaceManagement.revokeInvitation}
                    </ConfirmButton>
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>
          <Section title={t.workspaces.workspaceManagement.workspaceSettings}>
            <form
              key={`${w.name}-${w.kind}-${w.displayCurrency}`}
              className="max-w-md space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                void run(() =>
                  update.mutateAsync({
                    ...identity,
                    name: formText(form, "name"),
                    kind: formText(form, "kind") as
                      "family" | "fund" | "custom",
                    displayCurrency: formText(form, "currency"),
                  }),
                );
              }}
            >
              <Field
                label={t.workspaces.workspaceManagement.workspaceName}
                htmlFor="edit-workspace-name"
              >
                <Input
                  id="edit-workspace-name"
                  name="name"
                  required
                  maxLength={120}
                  defaultValue={w.name}
                />
              </Field>
              <Field
                label={t.workspaces.workspaceManagement.purpose}
                htmlFor="edit-workspace-kind"
              >
                <Select
                  id="edit-workspace-kind"
                  name="kind"
                  defaultValue={w.kind}
                >
                  <option value="family">
                    {t.workspaces.workspaceManagement.family}
                  </option>
                  <option value="fund">
                    {t.workspaces.workspaceManagement.fund}
                  </option>
                  <option value="custom">
                    {t.workspaces.workspaceManagement.other}
                  </option>
                </Select>
              </Field>
              <Field
                label={t.workspaces.workspaceManagement.displayCurrency}
                htmlFor="edit-workspace-currency"
              >
                <Select
                  id="edit-workspace-currency"
                  name="currency"
                  defaultValue={w.displayCurrency}
                  required
                >
                  {!currencies.data?.some(
                    (c) => c.code === w.displayCurrency,
                  ) ? (
                    <option value={w.displayCurrency}>
                      {w.displayCurrency}
                    </option>
                  ) : null}
                  {(currencies.data ?? []).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" disabled={pending}>
                {t.workspaces.workspaceManagement.saveWorkspace}
              </Button>
            </form>
            <p className="text-ink-2 mt-6 mb-3 text-sm">
              {
                t.workspaces.workspaceManagement
                  .deletingThisWorkspaceRevokesSharingAndInvitations
              }
            </p>
            <ConfirmButton
              variant="danger"
              disabled={pending}
              onConfirm={() =>
                void run(() => remove.mutateAsync(identity), true)
              }
            >
              {t.workspaces.workspaceManagement.deleteWorkspace}
            </ConfirmButton>
          </Section>
        </>
      ) : null}
    </div>
  );
}
