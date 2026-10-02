"use client";

import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import QRCode from "react-qr-code";

import { Button } from "~/components/ui/button";
import { Field, Input } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { authClient } from "~/server/auth/client";
import { formText } from "~/lib/form";

type Step =
  | { name: "idle" }
  | { name: "scan"; totpURI: string; backupCodes: string[] }
  | { name: "codes"; backupCodes: string[] }
  | { name: "disable" };

function secretFromUri(uri: string) {
  return new URL(uri).searchParams.get("secret") ?? "";
}

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run<T>(fn: () => Promise<T>) {
    setError(null);
    setPending(true);
    try {
      return await fn();
    } finally {
      setPending(false);
    }
  }

  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = formText(new FormData(event.currentTarget), "password");
    await run(async () => {
      const { data, error } = await authClient.twoFactor.enable({ password });
      if (error || data?.method !== "totp") {
        return setError(error?.message ?? "Could not start enrolment");
      }
      setStep({
        name: "scan",
        totpURI: data.totpURI,
        backupCodes: data.backupCodes,
      });
    });
  }

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.name !== "scan") return;
    const code = formText(new FormData(event.currentTarget), "code").replace(
      /\s/g,
      "",
    );
    await run(async () => {
      const { error } = await authClient.twoFactor.verifyTotp({ code });
      if (error) return setError(error.message ?? "That code did not match");
      setStep({ name: "codes", backupCodes: step.backupCodes });
    });
  }

  async function disable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = formText(new FormData(event.currentTarget), "password");
    await run(async () => {
      const { error } = await authClient.twoFactor.disable({ password });
      if (error)
        return setError(error.message ?? "Could not turn off two-step sign-in");
      setStep({ name: "idle" });
      router.refresh();
    });
  }

  if (step.name === "codes") {
    return (
      <div className="space-y-4">
        <Notice tone="success">
          Two-step sign-in is on. Save these backup codes somewhere safe — each
          works once if you lose your phone.
        </Notice>
        <ol className="figures border-line grid grid-cols-2 gap-x-6 gap-y-1 border p-4 text-[15px] sm:grid-cols-3">
          {step.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ol>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              void navigator.clipboard.writeText(step.backupCodes.join("\n"))
            }
          >
            Copy codes
          </Button>
          <Button
            onClick={() => {
              setStep({ name: "idle" });
              router.refresh();
            }}
          >
            I&apos;ve saved them
          </Button>
        </div>
      </div>
    );
  }

  if (step.name === "scan") {
    return (
      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        <div className="border-line w-fit border bg-white p-3">
          <QRCode value={step.totpURI} size={164} fgColor="#0b1f19" />
        </div>
        <form onSubmit={confirm} className="space-y-4">
          <p className="text-ink-2 text-sm">
            Scan with Google Authenticator, 1Password, Authy or similar.
            Can&apos;t scan? Enter this key:
          </p>
          <p className="figures bg-wash px-3 py-2 text-[13px] font-semibold break-all">
            {secretFromUri(step.totpURI)}
          </p>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Field label="6-digit code" htmlFor="totp-code">
            <Input
              id="totp-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              className="figures w-40 tracking-[0.25em]"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" loading={pending}>
              Confirm
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep({ name: "idle" })}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    );
  }

  if (enabled) {
    return step.name === "disable" ? (
      <form onSubmit={disable} className="max-w-sm space-y-4">
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Field
          label="Confirm your password to turn it off"
          htmlFor="tf-disable-password"
        >
          <Input
            id="tf-disable-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" variant="danger" loading={pending}>
            Turn off
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep({ name: "idle" })}
          >
            Cancel
          </Button>
        </div>
      </form>
    ) : (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-gain flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-5" />
          On — an authenticator code is required after your password.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setStep({ name: "disable" })}
        >
          Turn off
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={start} className="max-w-sm space-y-4">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Field label="Confirm your password to begin" htmlFor="tf-password">
        <Input
          id="tf-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Button type="submit" loading={pending}>
        Set up authenticator app
      </Button>
    </form>
  );
}
