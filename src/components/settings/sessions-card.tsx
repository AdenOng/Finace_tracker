"use client";

import { useT, useLocale } from "~/i18n/client";
import { MonitorSmartphone } from "lucide-react";

import { ConfirmButton } from "~/components/ui/confirm-button";
import { Notice, Tag } from "~/components/ui/panel";
import { errorMessage } from "~/lib/errors";
import { formatDate, formatRelative } from "~/lib/format";
import { describeUserAgent } from "~/lib/user-agent";
import { api } from "~/trpc/react";

export function SessionsCard() {
  const t = useT();
  const locale = useLocale();
  function deviceLabel(agent: string | null) {
    const label = describeUserAgent(agent);
    if (label === "Unknown device")
      return t.settings.sessionsCard.unknownDevice;
    const [browser, os] = label.split(" on ");
    const name =
      browser === "Browser" ? t.settings.sessionsCard.browser : browser!;
    return os ? t.settings.sessionsCard.deviceOn(name, os) : name;
  }
  const utils = api.useUtils();
  const sessions = api.settings.sessions.useQuery();
  const refresh = () => utils.settings.sessions.invalidate();
  const revoke = api.settings.revokeSession.useMutation({
    onSettled: refresh,
  });
  const revokeOthers = api.settings.revokeOtherSessions.useMutation({
    onSettled: refresh,
  });
  const others = sessions.data?.filter((s) => !s.current).length ?? 0;
  const failure = revoke.error ?? revokeOthers.error ?? sessions.error;

  return (
    <div className="space-y-4">
      {failure ? <Notice tone="error">{errorMessage(failure)}</Notice> : null}
      {revokeOthers.data ? (
        <Notice tone="success">
          {t.settings.sessionsCard.revoked(revokeOthers.data.revoked)}
        </Notice>
      ) : null}
      {!sessions.data ? (
        <div className="bg-wash h-12" />
      ) : (
        <ul className="border-ink border-t">
          {sessions.data.map((s) => (
            <li
              key={s.id}
              className="border-line flex items-center gap-3 border-b py-3"
            >
              <MonitorSmartphone className="text-brand size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-semibold"
                  title={s.userAgent ?? undefined}
                >
                  {deviceLabel(s.userAgent)}
                  {s.current ? (
                    <Tag className="ml-2">
                      {t.settings.sessionsCard.thisDevice}
                    </Tag>
                  ) : s.method ? (
                    <Tag tone="outline" className="ml-2">
                      {(
                        t.settings.sessionsCard.methods as Record<
                          string,
                          string
                        >
                      )[s.method] ?? s.method}
                    </Tag>
                  ) : null}
                </p>
                <p className="text-ink-3 text-[13px]">
                  {t.settings.sessionsCard.activity(
                    s.ipAddress ?? t.settings.sessionsCard.unknownIp,
                    s.current,
                    formatRelative(s.lastActiveAt, Date.now(), locale),
                    formatDate(s.createdAt, locale),
                  )}
                </p>
              </div>
              {s.current ? null : (
                <ConfirmButton
                  variant="ghost"
                  size="sm"
                  confirmLabel={t.settings.sessionsCard.signOut}
                  loading={
                    revoke.isPending && revoke.variables?.sessionId === s.id
                  }
                  onConfirm={() => revoke.mutate({ sessionId: s.id })}
                >
                  {t.settings.sessionsCard.signOutText}
                </ConfirmButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {others > 0 ? (
        <ConfirmButton
          variant="secondary"
          confirmLabel={t.settings.sessionsCard.confirmDevices(others)}
          loading={revokeOthers.isPending}
          onConfirm={() => revokeOthers.mutate()}
        >
          {t.settings.sessionsCard.signOutOfAllOther}
        </ConfirmButton>
      ) : null}
    </div>
  );
}
