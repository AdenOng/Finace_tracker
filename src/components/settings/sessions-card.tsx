"use client";

import { MonitorSmartphone } from "lucide-react";

import { ConfirmButton } from "~/components/ui/confirm-button";
import { Notice, Tag } from "~/components/ui/panel";
import { errorMessage } from "~/lib/errors";
import { formatDate, formatRelative } from "~/lib/format";
import { describeUserAgent, sessionMethodLabels } from "~/lib/user-agent";
import { api } from "~/trpc/react";

export function SessionsCard() {
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
          {revokeOthers.data.revoked === 1
            ? "Signed out of 1 other device."
            : `Signed out of ${revokeOthers.data.revoked} other devices.`}
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
                  {describeUserAgent(s.userAgent)}
                  {s.current ? (
                    <Tag className="ml-2">This device</Tag>
                  ) : s.method ? (
                    <Tag tone="outline" className="ml-2">
                      {sessionMethodLabels[s.method] ?? s.method}
                    </Tag>
                  ) : null}
                </p>
                <p className="text-ink-3 text-[13px]">
                  {s.ipAddress ?? "Unknown IP"} ·{" "}
                  {s.current
                    ? "active now"
                    : `active ${formatRelative(s.lastActiveAt)}`}{" "}
                  · signed in {formatDate(s.createdAt)}
                </p>
              </div>
              {s.current ? null : (
                <ConfirmButton
                  variant="ghost"
                  size="sm"
                  confirmLabel="Sign out?"
                  loading={
                    revoke.isPending && revoke.variables?.sessionId === s.id
                  }
                  onConfirm={() => revoke.mutate({ sessionId: s.id })}
                >
                  Sign out
                </ConfirmButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {others > 0 ? (
        <ConfirmButton
          variant="secondary"
          confirmLabel={`Sign out ${others === 1 ? "1 device" : `${others} devices`}?`}
          loading={revokeOthers.isPending}
          onConfirm={() => revokeOthers.mutate()}
        >
          Sign out of all other devices
        </ConfirmButton>
      ) : null}
    </div>
  );
}
