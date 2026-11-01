"use client";

import { useT } from "~/i18n/client";
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
  const t = useT();
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
      return setError(t.settings.passwordCard.minPassword(MIN_LENGTH));
    if (newPassword !== formText(data, "confirm"))
      return setError(t.settings.passwordCard.theNewPasswordsDontMatch);
    if (newPassword === currentPassword)
      return setError(t.settings.passwordCard.chooseAPasswordYouArent);
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
          ? t.settings.passwordCard.yourCurrentPasswordIsNot
          : (error.message ??
              t.settings.passwordCard.yourPasswordWasNotChanged),
      );
    form.reset();
    setSaved(true);
    void queryClient.invalidateQueries();
  }

  return (
    <form onSubmit={change} className="max-w-md space-y-4">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? (
        <Notice tone="success">
          {t.settings.passwordCard.yourPasswordWasChanged}
        </Notice>
      ) : null}
      <Field
        label={t.settings.passwordCard.currentPassword}
        htmlFor="password-current"
      >
        <Input
          id="password-current"
          name="current"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Field
        label={t.settings.passwordCard.newPassword}
        htmlFor="password-new"
        hint={t.settings.passwordCard.minHint(MIN_LENGTH)}
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
      <Field
        label={t.settings.passwordCard.repeatNewPassword}
        htmlFor="password-confirm"
      >
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
        label={t.settings.passwordCard.signOutOfOtherDevices}
        description={t.settings.passwordCard.recommendedIfYouThinkSomeone}
      />
      <Button type="submit" variant="secondary" loading={pending}>
        {t.settings.passwordCard.changePassword}
      </Button>
    </form>
  );
}
