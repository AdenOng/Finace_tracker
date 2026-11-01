"use client";

import Link from "next/link";
import { useState } from "react";

import { useT } from "~/i18n/client";
import { Button } from "~/components/ui/button";
import { Field, Input } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { formText } from "~/lib/form";
import { api } from "~/trpc/react";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const complete = api.passwordReset.complete.useMutation();

  if (complete.isSuccess) {
    return (
      <div className="space-y-5">
        <Notice tone="success">{t.auth.resetForm.success}</Notice>
        <Link
          href="/sign-in"
          className="text-brand font-semibold underline underline-offset-4"
        >
          {t.auth.resetForm.signIn}
        </Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const password = formText(form, "password");
        if (password !== formText(form, "confirm")) {
          return setError(t.auth.resetForm.mismatch);
        }
        setError(null);
        complete.mutate({ token, password });
      }}
    >
      {(error ?? complete.error) ? (
        <Notice tone="error">{error ?? complete.error?.message}</Notice>
      ) : null}
      <Field
        label={t.auth.resetForm.newPassword}
        htmlFor="password"
        hint={t.auth.resetForm.passwordHint}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          autoFocus
        />
      </Field>
      <Field label={t.auth.resetForm.confirm} htmlFor="confirm">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={complete.isPending}
      >
        {t.auth.resetForm.submit}
      </Button>
    </form>
  );
}
