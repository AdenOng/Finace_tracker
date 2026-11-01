"use client";

import { useQueryClient } from "@tanstack/react-query";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useT } from "~/i18n/client";
import { AuthHeading } from "~/components/auth/auth-heading";
import { Button } from "~/components/ui/button";
import { Checkbox, Field, Input } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { authClient } from "~/server/auth/client";
import { safeNextPath } from "~/lib/navigation";
import { formText } from "~/lib/form";

export default function TwoFactorPage() {
  const t = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = formText(form, "code").replace(/\s/g, "");
    const trustDevice = form.get("trust") === "on";
    setError(null);
    setPending(true);
    const { error } =
      mode === "totp"
        ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
        : await authClient.twoFactor.verifyBackupCode({ code, trustDevice });
    setPending(false);
    if (error) return setError(error.message ?? t.auth.twoFactor.failed);
    queryClient.clear();
    router.replace(
      safeNextPath(new URL(window.location.href).searchParams.get("next")),
    );
    router.refresh();
  }

  return (
    <>
      <AuthHeading title={t.auth.twoFactor.title}>
        {mode === "totp"
          ? t.auth.twoFactor.totpHint
          : t.auth.twoFactor.backupHint}
      </AuthHeading>
      <form onSubmit={onSubmit} className="space-y-5">
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Field
          label={
            mode === "totp"
              ? t.auth.twoFactor.code
              : t.auth.twoFactor.backupCode
          }
          htmlFor="code"
        >
          <Input
            key={mode}
            id="code"
            name="code"
            required
            autoFocus
            autoComplete="one-time-code"
            inputMode={mode === "totp" ? "numeric" : "text"}
            className="figures h-12 text-center text-xl tracking-[0.3em]"
          />
        </Field>
        <Checkbox name="trust" label={t.auth.twoFactor.trust} />
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          {t.auth.twoFactor.verify}
        </Button>
      </form>
      <button
        type="button"
        onClick={() => setMode(mode === "totp" ? "backup" : "totp")}
        className="text-brand mt-6 text-sm font-semibold underline underline-offset-4"
      >
        {mode === "totp" ? t.auth.twoFactor.useBackup : t.auth.twoFactor.useApp}
      </button>
    </>
  );
}
