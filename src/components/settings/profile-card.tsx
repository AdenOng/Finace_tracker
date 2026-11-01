"use client";

import { useT } from "~/i18n/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Field, Input } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { formText } from "~/lib/form";
import { authClient } from "~/server/auth/client";

export function ProfileCard({ name, email }: { name: string; email: string }) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = formText(new FormData(event.currentTarget), "name");
    setError(null);
    setSaved(false);
    if (!next) return setError(t.settings.profileCard.enterYourName);
    setPending(true);
    const { error } = await authClient.updateUser({ name: next });
    setPending(false);
    if (error)
      return setError(
        error.message ?? t.settings.profileCard.yourNameWasNotSaved,
      );
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="max-w-md space-y-4">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? (
        <Notice tone="success">
          {t.settings.profileCard.yourNameWasSaved}
        </Notice>
      ) : null}
      <Field label={t.settings.profileCard.name} htmlFor="profile-name">
        <Input
          id="profile-name"
          name="name"
          autoComplete="name"
          defaultValue={name}
          maxLength={100}
          required
        />
      </Field>
      <Field
        label={t.settings.profileCard.email}
        htmlFor="profile-email"
        hint={t.settings.profileCard.youSignInWithThis}
      >
        <Input id="profile-email" value={email} readOnly disabled />
      </Field>
      <Button type="submit" variant="secondary" loading={pending}>
        {t.settings.profileCard.saveName}
      </Button>
    </form>
  );
}
