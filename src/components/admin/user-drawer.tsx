"use client";

import { useT, useLocale } from "~/i18n/client";
import { Link2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { CopyField } from "~/components/ui/copy-field";
import { Drawer } from "~/components/ui/dialog";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Checkbox } from "~/components/ui/field";
import { Section, Tag } from "~/components/ui/panel";
import { useFlash } from "~/components/ui/use-flash";
import { formatDate, formatDateTime, formatRelative } from "~/lib/format";
import {
  describeUserAgent,
  sessionMethodLabels as methodLabels,
} from "~/lib/user-agent";
import { api, type RouterOutputs } from "~/trpc/react";

export type AdminUser = RouterOutputs["admin"]["users"]["list"][number];

export function UserDrawer({
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
          <FlashNotice flash={flash} onDismiss={clear} />

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
