"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Checkbox, Field, Input } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { formText } from "~/lib/form";
import { authClient } from "~/server/auth/client";

/** Matches `minPasswordLength` in the Better Auth config. */
const MIN_LENGTH = 10;

export function PasswordCard() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function change(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    // Passwords are used exactly as typed, spaces included.
    const currentPassword = formText(data, "current");
    const newPassword = formText(data, "password");
    setError(null);
    setSaved(false);
    if (newPassword.length < MIN_LENGTH)
      return setError(
        `Use at least ${MIN_LENGTH} characters for the new password.`,
      );
    if (newPassword !== formText(data, "confirm"))
      return setError("The new passwords don't match.");
    if (newPassword === currentPassword)
      return setError("Choose a password you aren't already using.");
    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: data.get("signOutOthers") === "on",
    });
    setPending(false);
    if (error)
      return setError(
        error.code === "INVALID_PASSWORD"
          ? "Your current password is not right."
          : (error.message ?? "Your password was not changed."),
      );
    form.reset();
    setSaved(true);
    void queryClient.invalidateQueries();
  }

  return (
    <form onSubmit={change} className="max-w-md space-y-4">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? (
        <Notice tone="success">Your password was changed.</Notice>
      ) : null}
      <Field label="Current password" htmlFor="password-current">
        <Input
          id="password-current"
          name="current"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Field
        label="New password"
        htmlFor="password-new"
        hint={`At least ${MIN_LENGTH} characters.`}
      >
        <Input
          id="password-new"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          maxLength={128}
          required
        />
      </Field>
      <Field label="Repeat new password" htmlFor="password-confirm">
        <Input
          id="password-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <Checkbox
        name="signOutOthers"
        defaultChecked
        label="Sign out of other devices"
        description="Recommended if you think someone else knows your password."
      />
      <Button type="submit" variant="secondary" loading={pending}>
        Change password
      </Button>
    </form>
  );
}
