"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Field, Input } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { formText } from "~/lib/form";
import { authClient } from "~/server/auth/client";

export function ProfileCard({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = formText(new FormData(event.currentTarget), "name");
    setError(null);
    setSaved(false);
    if (!next) return setError("Enter your name.");
    setPending(true);
    const { error } = await authClient.updateUser({ name: next });
    setPending(false);
    if (error) return setError(error.message ?? "Your name was not saved.");
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="max-w-md space-y-4">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? <Notice tone="success">Your name was saved.</Notice> : null}
      <Field label="Name" htmlFor="profile-name">
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
        label="Email"
        htmlFor="profile-email"
        hint="You sign in with this address. An admin can change it for you."
      >
        <Input id="profile-email" value={email} readOnly disabled />
      </Field>
      <Button type="submit" variant="secondary" loading={pending}>
        Save name
      </Button>
    </form>
  );
}
