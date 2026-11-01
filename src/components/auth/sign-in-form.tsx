"use client";

import { useQueryClient } from "@tanstack/react-query";

import { KeyRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { useT } from "~/i18n/client";
import { Button } from "~/components/ui/button";
import { Field, Input } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { authClient } from "~/server/auth/client";
import { errorMessage } from "~/lib/errors";
import { formText } from "~/lib/form";
import { safeNextPath } from "~/lib/navigation";
import { api } from "~/trpc/react";

/** "Forgot password": emails a link when the instance can send email, otherwise points to the admin. */
function ForgotPassword({
  emailResets,
  onBack,
}: {
  emailResets: boolean;
  onBack: () => void;
}) {
  const request = api.passwordReset.request.useMutation();
  const t = useT();
  const back = (
    <button
      type="button"
      onClick={onBack}
      className="text-[13px] font-semibold underline underline-offset-4"
    >
      {t.auth.signIn.back}
    </button>
  );

  if (!emailResets)
    return (
      <div className="space-y-4">
        <Notice>{t.auth.signIn.askOperator}</Notice>
        {back}
      </div>
    );
  if (request.isSuccess)
    return (
      <div className="space-y-4">
        <Notice tone="success">{t.auth.signIn.sent}</Notice>
        {back}
      </div>
    );
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        request.mutate({
          email: formText(new FormData(event.currentTarget), "email"),
        });
      }}
    >
      <p className="text-ink-2 text-sm">{t.auth.signIn.resetIntro}</p>
      {request.error ? (
        <Notice tone="error">{errorMessage(request.error)}</Notice>
      ) : null}
      <Field label={t.common.fields.email} htmlFor="reset-email">
        <Input
          id="reset-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
        />
      </Field>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={request.isPending}
      >
        {t.auth.signIn.sendReset}
      </Button>
      {back}
    </form>
  );
}

export function SignInForm({ emailResets = false }: { emailResets?: boolean }) {
  const t = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const next = safeNextPath(useSearchParams().get("next"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"password" | "passkey" | null>(null);
  const [forgot, setForgot] = useState(false);

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
    if (error) return setError(error.message ?? t.auth.signIn.failed);
    // With 2FA enabled the client plugin redirects to /two-factor itself.
    if (data && !("twoFactorRedirect" in data && data.twoFactorRedirect)) {
      queryClient.clear();
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
      return setError(result.error.message ?? t.auth.signIn.passkeyFailed);
    queryClient.clear();
    router.replace(next);
    router.refresh();
  }

  if (forgot)
    return (
      <ForgotPassword
        emailResets={emailResets}
        onBack={() => setForgot(false)}
      />
    );

  return (
    <div className="space-y-6">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <form onSubmit={onSubmit} className="space-y-5">
        <Field label={t.common.fields.email} htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username webauthn"
            required
            autoFocus
          />
        </Field>
        <Field
          label={t.auth.signIn.password}
          htmlFor="password"
          hint={
            <button
              type="button"
              onClick={() => setForgot(true)}
              className="underline underline-offset-4"
            >
              {t.auth.signIn.forgot}
            </button>
          }
        >
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
          {t.auth.signIn.submit}
        </Button>
      </form>
      <div className="text-ink-3 flex items-center gap-3 text-[13px]">
        <span className="bg-line h-px flex-1" />
        {t.auth.signIn.or}
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
        {t.auth.signIn.passkey}
      </Button>
    </div>
  );
}
