"use client";

import { useQueryClient } from "@tanstack/react-query";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Field, Input } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { authClient } from "~/server/auth/client";
import { formText } from "~/lib/form";

/** Used both for first-run admin setup and for accepting an invitation. */
export function RegisterForm({
  lockedEmail,
  inviteToken,
  workspaceInviteToken,
  setup = false,
  submitLabel,
}: {
  lockedEmail?: string;
  inviteToken?: string;
  workspaceInviteToken?: string;
  setup?: boolean;
  submitLabel: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = formText(form, "password");
    if (password !== formText(form, "confirm")) {
      return setError("Passwords do not match");
    }
    setError(null);
    setPending(true);
    const { error } = await authClient.signUp.email(
      {
        name: formText(form, "name"),
        email: lockedEmail ?? formText(form, "email"),
        password,
      },
      workspaceInviteToken
        ? { headers: { "x-workspace-invite-token": workspaceInviteToken } }
        : inviteToken
          ? { headers: { "x-invite-token": inviteToken } }
          : setup
            ? { headers: { "x-setup-token": formText(form, "setupToken") } }
            : undefined,
    );
    setPending(false);
    if (error) return setError(error.message ?? "Could not create the account");
    queryClient.clear();
    router.replace("/settings?welcome=1");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {setup ? (
        <Field
          label="Setup token"
          htmlFor="setupToken"
          hint="Ask the instance operator for this token."
        >
          <Input
            id="setupToken"
            name="setupToken"
            type="password"
            autoComplete="off"
            required
          />
        </Field>
      ) : null}
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required autoFocus />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={lockedEmail}
          disabled={!!lockedEmail}
        />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
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
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
