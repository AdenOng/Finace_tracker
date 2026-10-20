"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Checkbox, Field, Input, Select } from "~/components/ui/field";
import { EmptyState, Notice, Section, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { FilterTabs } from "~/components/ui/tabs";
import { useFlash } from "~/components/ui/use-flash";
import { formatDateTime, formatRelative } from "~/lib/format";
import { api } from "~/trpc/react";

type Outcome = "all" | "failed" | "new_device";

const methodLabels: Record<string, string> = {
  password: "Password",
  two_factor: "Two-step code",
  backup_code: "Backup code",
  passkey: "Passkey",
};

const policyHelp = {
  everyone:
    "Everyone sets up an authenticator app before they can use Finfolio.",
  admins:
    "Admins must use two-step; members can choose. Recommended at minimum.",
  off: "Nobody is required to. People can still turn it on in Settings.",
} as const;

function PolicyForm() {
  const utils = api.useUtils();
  const [settings] = api.admin.security.settings.useSuspenseQuery();
  const { flash, success, error } = useFlash();
  const [policy, setPolicy] = useState(settings.twoFactorPolicy);
  const [limitSessions, setLimitSessions] = useState(
    settings.maxSessionDays !== null,
  );
  const update = api.admin.security.updateSettings.useMutation({
    onSuccess: async () => {
      success("Security settings saved.");
      await utils.admin.security.settings.invalidate();
    },
    onError: error,
  });

  const missing =
    policy === "everyone"
      ? settings.withoutTwoFactor.admins + settings.withoutTwoFactor.members
      : policy === "admins"
        ? settings.withoutTwoFactor.admins
        : 0;

  return (
    <Section
      title="Policy"
      description="Applies to everyone on this Finfolio, including you."
    >
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const days = Number(form.get("maxSessionDays"));
          update.mutate({
            twoFactorPolicy: policy,
            maxSessionDays: limitSessions && days > 0 ? days : null,
            workspaceInviteSignups: form.get("workspaceInviteSignups") === "on",
            newDeviceAlerts: form.get("newDeviceAlerts") === "on",
          });
        }}
      >
        <FlashNotice flash={flash} />
        <div className="grid gap-6 md:grid-cols-2">
          <Field
            label="Who must use two-step verification"
            htmlFor="sec-policy"
            hint={
              settings.twoFactorForcedByEnv
                ? "Set to everyone by REQUIRE_TWO_FACTOR=true in .env. Change it there to choose here."
                : policyHelp[policy]
            }
          >
            <Select
              id="sec-policy"
              value={policy}
              disabled={settings.twoFactorForcedByEnv}
              onChange={(e) => setPolicy(e.target.value as typeof policy)}
            >
              <option value="everyone">Everyone</option>
              <option value="admins">Admins only</option>
              <option value="off">Not required</option>
            </Select>
          </Field>
          <div className="space-y-2">
            <Checkbox
              label="Sign people out after a fixed time"
              description="Even if they keep using the app. Idle sessions already end after 7 days."
              checked={limitSessions}
              onChange={(e) => setLimitSessions(e.target.checked)}
            />
            {limitSessions ? (
              <div className="flex items-center gap-2 pl-6.5 text-sm">
                <Input
                  name="maxSessionDays"
                  type="number"
                  min={1}
                  max={365}
                  required
                  defaultValue={settings.maxSessionDays ?? 7}
                  aria-label="Days before signing out"
                  className="h-9 w-20"
                />
                days after signing in
              </div>
            ) : null}
          </div>
        </div>
        {missing > 0 && !settings.twoFactorForcedByEnv ? (
          <Notice tone="warn">
            {missing} {missing === 1 ? "person" : "people"} covered by this
            policy {missing === 1 ? "has" : "have"} not set up two-step. They
            will be held on Settings until they do.{" "}
            <Link
              href="/admin/users?filter=no2fa"
              className="font-semibold underline underline-offset-4"
            >
              See who
            </Link>
          </Notice>
        ) : null}
        <div className="space-y-3">
          <p className="text-[13px] font-semibold">Sign-up</p>
          <p className="text-ink-2 text-sm">
            Accounts can only be created with an invitation. The first account
            on a new install becomes the admin.
          </p>
          <Checkbox
            name="workspaceInviteSignups"
            label="Workspace invitations can create new accounts"
            description="Off: a workspace invite only works for someone who already has an account; new people need an admin invite."
            defaultChecked={settings.workspaceInviteSignups}
          />
          <Checkbox
            name="newDeviceAlerts"
            label="Email people when they sign in from a new device"
            description={
              settings.emailConfigured
                ? "Sent to the account's own address."
                : "Needs email to be set up on Admin → System."
            }
            defaultChecked={settings.newDeviceAlerts}
          />
        </div>
        <Button type="submit" loading={update.isPending}>
          Save security settings
        </Button>
      </form>
    </Section>
  );
}

function Summary() {
  const [summary] = api.admin.security.summary.useSuspenseQuery();
  return (
    <Section title="Last 7 days">
      <dl className="grid grid-cols-3 gap-6">
        {[
          ["Sign-ins", summary.succeeded, null],
          [
            "Failed attempts",
            summary.failed,
            summary.failed > 0 ? "text-loss" : null,
          ],
          [
            "From a new device",
            summary.newDevices,
            summary.newDevices > 0 ? "text-warn" : null,
          ],
        ].map(([label, value, tone]) => (
          <div key={label as string}>
            <dt className="text-ink-2 text-[13px] font-semibold">{label}</dt>
            <dd
              className={`figures font-display text-2xl font-semibold ${tone ?? ""}`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {summary.noisyAddresses.length ? (
        <Notice tone="warn" className="mt-5">
          Repeated failures from{" "}
          {summary.noisyAddresses
            .map((a) => `${a.ipAddress} (${a.failures})`)
            .join(", ")}
          . Sign-in is rate-limited to 5 tries a minute per address.
        </Notice>
      ) : null}
    </Section>
  );
}

function SignInHistory() {
  const params = useSearchParams();
  const [outcome, setOutcome] = useState<Outcome>(() => {
    const value = params.get("outcome");
    return value === "failed" || value === "new_device" ? value : "all";
  });
  const userId = params.get("user") ?? undefined;
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const log = api.admin.security.signIns.useInfiniteQuery(
    { outcome, userId, query: submitted || undefined },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const items = log.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Section
      title="Sign-in history"
      description="Every attempt, including failures. Passwords and codes are never recorded."
    >
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <FilterTabs
          label="Filter sign-ins"
          value={outcome}
          onChange={setOutcome}
          options={[
            { value: "all", label: "All" },
            { value: "failed", label: "Failed" },
            { value: "new_device", label: "New device" },
          ]}
        />
        <form
          className="relative ml-auto w-full max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(query);
          }}
        >
          <Search className="text-ink-3 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            aria-label="Search sign-ins"
            placeholder="Name, email or IP, then Enter"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
      </div>
      {userId ? (
        <p className="text-ink-2 mb-4 text-sm">
          Showing one person.{" "}
          <Link
            href="/admin/security"
            className="font-semibold underline underline-offset-4"
          >
            Show everyone
          </Link>
        </p>
      ) : null}

      {log.isLoading ? (
        <p className="text-ink-3 text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState title="No sign-ins yet">
          Attempts are recorded from now on.
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Result</Th>
                <Th>Device</Th>
                <Th>IP address</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <Tr key={e.id}>
                  <Td
                    className="text-ink-2 whitespace-nowrap"
                    title={formatDateTime(e.createdAt)}
                  >
                    {formatRelative(e.createdAt)}
                  </Td>
                  <Td>
                    <p className="font-medium">
                      {e.userName ?? e.email ?? "Unknown"}
                    </p>
                    {e.userName && e.email ? (
                      <p className="text-ink-3 text-[12px]">{e.email}</p>
                    ) : null}
                  </Td>
                  <Td>
                    {e.success ? (
                      <span>
                        Signed in
                        <span className="text-ink-3">
                          {" "}
                          · {methodLabels[e.method] ?? e.method}
                        </span>
                      </span>
                    ) : (
                      <span className="text-loss">
                        Failed
                        <span className="text-ink-3">
                          {" "}
                          · {e.reason ?? methodLabels[e.method]}
                        </span>
                      </span>
                    )}
                  </Td>
                  <Td title={e.userAgent ?? undefined}>
                    {e.device ?? "Unknown"}
                    {e.newDevice ? (
                      <Tag tone="warn" className="ml-2">
                        New
                      </Tag>
                    ) : null}
                  </Td>
                  <Td className="figures text-ink-2">{e.ipAddress ?? "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {log.hasNextPage ? (
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              loading={log.isFetchingNextPage}
              onClick={() => void log.fetchNextPage()}
            >
              Load older
            </Button>
          ) : null}
        </>
      )}
    </Section>
  );
}

export function SecurityAdmin() {
  return (
    <div className="space-y-6">
      <Summary />
      <PolicyForm />
      <SignInHistory />
    </div>
  );
}
