"use client";

import { CircleAlert, CircleCheck } from "lucide-react";

import { Button } from "~/components/ui/button";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Section } from "~/components/ui/panel";
import { useFlash } from "~/components/ui/use-flash";
import { cn } from "~/lib/cn";
import { formatBytes, formatDateTime, formatRelative } from "~/lib/format";
import { api } from "~/trpc/react";

const integer = new Intl.NumberFormat("en-SG");
const plural = (n: number, word: string) =>
  `${integer.format(n)} ${word}${n === 1 ? "" : "s"}`;

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-3">{label}</dt>
          <dd className="min-w-0 font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CircleCheck : CircleAlert;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className={cn("size-4", ok ? "text-gain" : "text-warn")} />
      {children}
    </span>
  );
}

export function SystemAdmin() {
  const [info] = api.admin.system.info.useSuspenseQuery();
  const { flash, success, error, clear } = useFlash(10_000);
  const testEmail = api.admin.system.testEmail.useMutation({
    onMutate: clear,
    onSuccess: (r) =>
      success(`Test email sent to ${r.to}. Check the inbox (and spam).`),
    onError: error,
  });
  const { migrations } = info.database;
  const migrationsOk =
    migrations.applied !== null && migrations.applied >= migrations.expected;

  return (
    <div className="space-y-6">
      <Section title="App">
        <Rows
          rows={[
            ["Version", info.app.version],
            [
              "Running since",
              `${formatRelative(info.app.startedAt)} (${formatDateTime(info.app.startedAt)})`,
            ],
            ["Node", `${info.app.node} · ${info.app.platform}`],
            ["Mode", info.app.environment],
            ["Public URL", info.config.baseUrl],
          ]}
        />
      </Section>

      <Section title="Database">
        <Rows
          rows={[
            ["PostgreSQL", info.database.version],
            ["Size", formatBytes(info.database.sizeBytes)],
            [
              "Migrations",
              <Check key="m" ok={migrationsOk}>
                {migrations.applied === null
                  ? "Could not read the migrations table"
                  : `${migrations.applied} of ${migrations.expected} applied`}
                {migrations.latestTag ? (
                  <span className="text-ink-3 font-normal">
                    {" "}
                    · latest {migrations.latestTag}
                  </span>
                ) : null}
              </Check>,
            ],
            [
              "Rows",
              [
                plural(info.database.counts.users, "user"),
                plural(info.database.counts.accounts, "account"),
                plural(info.database.counts.transactions, "transaction"),
                plural(info.database.counts.documents, "upload"),
              ].join(" · "),
            ],
          ]}
        />
      </Section>

      <Section title="Storage">
        <Rows
          rows={[
            [
              "Uploaded statements",
              `${formatBytes(info.storage.uploads.bytes)} in ${integer.format(info.storage.uploads.files)} files${info.storage.uploads.truncated ? "+" : ""} · ${info.storage.uploads.directory}`,
            ],
            [
              "Backups",
              `${formatBytes(info.storage.backups.bytes)} in ${integer.format(info.storage.backups.files)} files · ${info.storage.backups.directory}`,
            ],
          ]}
        />
      </Section>

      <Section
        title="Configuration"
        description="Secrets are never shown, only whether they are set."
      >
        <Rows
          rows={[
            ["Data pack", info.config.preset],
            [
              "Two-step required by .env",
              info.config.requireTwoFactor
                ? "Yes (REQUIRE_TWO_FACTOR=true)"
                : "No — set on Admin → Security",
            ],
            [
              "Encryption key",
              <Check key="k" ok={info.config.encryptionKeySet}>
                {info.config.encryptionKeySet ? "Set" : "Missing"}
              </Check>,
            ],
            [
              "opencode server",
              <span key="o">
                {info.config.opencodeUrl}
                <span className="text-ink-3 font-normal">
                  {" "}
                  · password{" "}
                  {info.config.opencodePasswordSet ? "set" : "not set"}
                </span>
              </span>,
            ],
          ]}
        />
      </Section>

      <Section
        title="Email"
        description="Used for invite and reset links, review reminders and new-device alerts. Set SMTP_URL and SMTP_FROM in .env, then restart."
        actions={
          info.config.email.configured ? (
            <Button
              variant="secondary"
              size="sm"
              loading={testEmail.isPending}
              onClick={() => testEmail.mutate()}
            >
              Send me a test email
            </Button>
          ) : null
        }
      >
        <FlashNotice flash={flash} className="mb-3" />
        <Check ok={info.config.email.configured}>
          <span className="text-sm">
            {info.config.email.configured
              ? `Sending through ${info.config.email.host}`
              : "Not set up — links are shown to you to hand over"}
          </span>
        </Check>
      </Section>
    </div>
  );
}
