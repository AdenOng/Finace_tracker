"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Field, Input } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { formText } from "~/lib/form";
import { api } from "~/trpc/react";

export function ResetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const complete = api.passwordReset.complete.useMutation();

  if (complete.isSuccess) {
    return (
      <div className="space-y-5">
        <Notice tone="success">Your password has been changed.</Notice>
        <Link
          href="/sign-in"
          className="text-forest font-semibold underline underline-offset-4"
        >
          Sign in
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
          return setError("Passwords do not match");
        }
        setError(null);
        complete.mutate({ token, password });
      }}
    >
      {(error ?? complete.error) ? (
        <Notice tone="error">{error ?? complete.error?.message}</Notice>
      ) : null}
      <Field
        label="New password"
        htmlFor="password"
        hint="At least 10 characters."
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
      <Field label="Confirm password" htmlFor="confirm">
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
        Set password
      </Button>
    </form>
  );
}
