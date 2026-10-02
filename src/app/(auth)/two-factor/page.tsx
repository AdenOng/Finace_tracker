"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthHeading } from "~/components/auth/auth-heading";
import { Button } from "~/components/ui/button";
import { Checkbox, Field, Input } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { authClient } from "~/server/auth/client";
import { formText } from "~/lib/form";

export default function TwoFactorPage() {
  const router = useRouter();
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
    if (error) return setError(error.message ?? "That code did not work");
    router.replace("/");
    router.refresh();
  }

  return (
    <>
      <AuthHeading title="Two-step check">
        {mode === "totp"
          ? "Enter the 6-digit code from your authenticator app."
          : "Enter one of the backup codes you saved when you turned on two-step sign-in."}
      </AuthHeading>
      <form onSubmit={onSubmit} className="space-y-5">
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Field label={mode === "totp" ? "Code" : "Backup code"} htmlFor="code">
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
        <Checkbox name="trust" label="Trust this device for 30 days" />
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          Verify
        </Button>
      </form>
      <button
        type="button"
        onClick={() => setMode(mode === "totp" ? "backup" : "totp")}
        className="text-forest mt-6 text-sm font-semibold underline underline-offset-4"
      >
        {mode === "totp"
          ? "Use a backup code instead"
          : "Use authenticator app instead"}
      </button>
    </>
  );
}
