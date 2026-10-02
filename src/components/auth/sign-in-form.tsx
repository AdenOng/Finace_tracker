"use client";

import { KeyRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Field, Input } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { authClient } from "~/server/auth/client";
import { formText } from "~/lib/form";
import { safeNextPath } from "~/lib/navigation";

export function SignInForm() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"password" | "passkey" | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setPending("password");
    const { data, error } = await authClient.signIn.email({
      email: formText(form, "email"),
      password: formText(form, "password"),
    });
    setPending(null);
    if (error) return setError(error.message ?? "Sign-in failed");
    // With 2FA enabled the client plugin redirects to /two-factor itself.
    if (data && !("twoFactorRedirect" in data && data.twoFactorRedirect)) {
      router.replace(next);
      router.refresh();
    }
  }

  async function onPasskey() {
    setError(null);
    setPending("passkey");
    const result = await authClient.signIn.passkey();
    setPending(null);
    if (result?.error)
      return setError(result.error.message ?? "Passkey sign-in failed");
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <form onSubmit={onSubmit} className="space-y-5">
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username webauthn"
            required
            autoFocus
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={pending === "password"}
        >
          Sign in
        </Button>
      </form>
      <div className="text-ink-3 flex items-center gap-3 text-[13px]">
        <span className="bg-line h-px flex-1" />
        or
        <span className="bg-line h-px flex-1" />
      </div>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={onPasskey}
        loading={pending === "passkey"}
      >
        <KeyRound className="size-4" />
        Use a passkey
      </Button>
    </div>
  );
}
