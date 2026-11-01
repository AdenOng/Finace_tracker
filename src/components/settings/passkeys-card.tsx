"use client";

import { useT, useLocale } from "~/i18n/client";
import { KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Notice } from "~/components/ui/panel";
import { formatDate } from "~/lib/format";
import { authClient } from "~/server/auth/client";

export function PasskeysCard() {
  const t = useT();
  const locale = useLocale();
  const { data: passkeys, isPending, refetch } = authClient.useListPasskeys();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setError(null);
    setBusy(true);
    const result = await authClient.passkey.addPasskey({
      name: `${navigator.platform || t.settings.passkeysCard.device} · ${formatDate(new Date(), locale)}`,
    });
    setBusy(false);
    if (result?.error)
      return setError(
        result.error.message ?? t.settings.passkeysCard.passkeyWasNotAdded,
      );
    void refetch();
  }

  async function remove(id: string) {
    setError(null);
    const { error } = await authClient.passkey.deletePasskey({ id });
    if (error)
      return setError(
        error.message ?? t.settings.passkeysCard.couldNotRemovePasskey,
      );
    void refetch();
  }

  return (
    <div className="space-y-4">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {isPending ? (
        <div className="bg-wash h-12" />
      ) : passkeys?.length ? (
        <ul className="border-ink border-t">
          {passkeys.map((pk) => (
            <li
              key={pk.id}
              className="border-line flex items-center gap-3 border-b py-3"
            >
              <KeyRound className="text-brand size-4" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {pk.name ?? t.settings.passkeysCard.passkey}
                </p>
                <p className="text-ink-3 text-[13px]">
                  {t.settings.passkeysCard.added(
                    pk.createdAt ? formatDate(pk.createdAt, locale) : "—",
                    pk.deviceType === "multiDevice",
                  )}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t.settings.passkeysCard.removePasskey}
                onClick={() => void remove(pk.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-2 text-sm">
          {t.settings.passkeysCard.noPasskeysYetAPasskey}
        </p>
      )}
      <Button variant="secondary" onClick={add} loading={busy}>
        <KeyRound className="size-4" />
        {t.settings.passkeysCard.addAPasskey}
      </Button>
    </div>
  );
}
