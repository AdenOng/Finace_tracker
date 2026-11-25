"use client";

import { useT, useLocale } from "~/i18n/client";
import { Link2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { CopyField } from "~/components/ui/copy-field";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Checkbox, Field, Input, Select } from "~/components/ui/field";
import { Notice, Section, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { useFlash } from "~/components/ui/use-flash";
import { formatDate } from "~/lib/format";
import { formText } from "~/lib/form";
import { api } from "~/trpc/react";

export function InviteSection({
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

      <FlashNotice flash={flash} onDismiss={clear} className="mt-4" />
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
