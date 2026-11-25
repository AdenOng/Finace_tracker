"use client";

import { useT, useLocale } from "~/i18n/client";
import type { Messages } from "~/i18n/messages";

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

const getMethodLabels = (t: Messages): Record<string, string> => ({
  password: t.adminManage.security.password,
  two_factor: t.adminManage.security.twoStepCode,
  backup_code: t.adminManage.security.backupCode,
  passkey: t.adminManage.security.passkey,
});

const getPolicyHelp = (t: Messages) =>
  ({
    everyone: t.adminManage.security.everyonePolicyHelp,
    admins: t.adminManage.security.adminsPolicyHelp,
    off: t.adminManage.security.optionalPolicyHelp,
  }) as const;

function PolicyForm() {
  const t = useT();
  const policyHelp = getPolicyHelp(t);
  const utils = api.useUtils();
  const [settings] = api.admin.security.settings.useSuspenseQuery();
  const { flash, success, error, clear } = useFlash();
  const [policy, setPolicy] = useState(settings.twoFactorPolicy);
  const [limitSessions, setLimitSessions] = useState(
    settings.maxSessionDays !== null,
  );
  const update = api.admin.security.updateSettings.useMutation({
    onSuccess: async () => {
      success(t.adminManage.security.securitySettingsSaved);
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
      title={t.adminManage.security.policy}
      description={t.adminManage.security.policyScopeHelp}
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
        <FlashNotice flash={flash} onDismiss={clear} />
        <div className="grid gap-6 md:grid-cols-2">
          <Field
            label={t.adminManage.security.twoStepPolicyLabel}
            htmlFor="sec-policy"
            hint={
              settings.twoFactorForcedByEnv
                ? t.adminManage.security.environmentPolicyHelp
                : policyHelp[policy]
            }
          >
            <Select
              id="sec-policy"
              value={policy}
              disabled={settings.twoFactorForcedByEnv}
              onChange={(e) => setPolicy(e.target.value as typeof policy)}
            >
              <option value="everyone">
                {t.adminManage.security.everyone}
              </option>
              <option value="admins">
                {t.adminManage.security.adminsOnly}
              </option>
              <option value="off">{t.adminManage.security.notRequired}</option>
            </Select>
          </Field>
          <div className="space-y-2">
            <Checkbox
              label={t.adminManage.security.sessionExpiryLabel}
              description={t.adminManage.security.sessionExpiryHelp}
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
                  aria-label={t.adminManage.security.daysBeforeSigningOut}
                  className="h-9 w-20"
                />
                {t.adminManage.security.daysAfterSigningIn}
              </div>
            ) : null}
          </div>
        </div>
        {missing > 0 && !settings.twoFactorForcedByEnv ? (
          <Notice tone="warn">
            {t.adminManage.security.missingTwoFactor(missing)}{" "}
            <Link
              href="/admin/users?filter=no2fa"
              className="font-semibold underline underline-offset-4"
            >
              {t.adminManage.security.seeWho}
            </Link>
          </Notice>
        ) : null}
        <div className="space-y-3">
          <p className="text-[13px] font-semibold">
            {t.adminManage.security.signup}
          </p>
          <p className="text-ink-2 text-sm">
            {t.adminManage.security.invitationOnlyHelp}
          </p>
          <Checkbox
            name="workspaceInviteSignups"
            label={t.adminManage.security.workspaceSignupLabel}
            description={t.adminManage.security.workspaceSignupHelp}
            defaultChecked={settings.workspaceInviteSignups}
          />
          <Checkbox
            name="newDeviceAlerts"
            label={t.adminManage.security.newDeviceEmailLabel}
            description={
              settings.emailConfigured
                ? t.adminManage.security.newDeviceEmailHelp
                : t.adminManage.security.emailSetupHelp
            }
            defaultChecked={settings.newDeviceAlerts}
          />
        </div>
        <Button type="submit" loading={update.isPending}>
          {t.adminManage.security.saveSecuritySettings}
        </Button>
      </form>
    </Section>
  );
}

function Summary() {
  const t = useT();
  const [summary] = api.admin.security.summary.useSuspenseQuery();
  return (
    <Section title={t.adminManage.security.last7Days}>
      <dl className="grid grid-cols-3 gap-6">
        {[
          [t.adminManage.security.signins, summary.succeeded, null],
          [
            t.adminManage.security.failedAttempts,
            summary.failed,
            summary.failed > 0 ? "text-loss" : null,
          ],
          [
            t.adminManage.security.fromANewDevice,
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
          {t.adminManage.security.noisyAddresses(
            summary.noisyAddresses
              .map((a) => `${a.ipAddress} (${a.failures})`)
              .join(", "),
          )}
        </Notice>
      ) : null}
    </Section>
  );
}

function SignInHistory() {
  const locale = useLocale();
  const t = useT();
  const methodLabels = getMethodLabels(t);
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
      title={t.adminManage.security.signinHistory}
      description={t.adminManage.security.signinHistoryHelp}
    >
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <FilterTabs
          label={t.adminManage.security.filterSignins}
          value={outcome}
          onChange={setOutcome}
          options={[
            { value: "all", label: t.adminManage.security.all },
            { value: "failed", label: t.adminManage.security.failed },
            { value: "new_device", label: t.adminManage.security.newDevice },
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
            aria-label={t.adminManage.security.searchSignins}
            placeholder={t.adminManage.security.nameEmailOrIPThenEnter}
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
      </div>
      {userId ? (
        <p className="text-ink-2 mb-4 text-sm">
          {t.adminManage.security.showingOnePerson}{" "}
          <Link
            href="/admin/security"
            className="font-semibold underline underline-offset-4"
          >
            {t.adminManage.security.showEveryone}
          </Link>
        </p>
      ) : null}

      {log.isLoading ? (
        <p className="text-ink-3 text-sm">{t.common.status.loading}</p>
      ) : items.length === 0 ? (
        <EmptyState title={t.adminManage.security.noSigninsYet}>
          {t.adminManage.security.attemptsAreRecordedFromNowOn}
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>{t.adminManage.security.when}</Th>
                <Th>{t.adminManage.security.who}</Th>
                <Th>{t.adminManage.security.result}</Th>
                <Th>{t.adminManage.security.device}</Th>
                <Th>{t.adminManage.security.ipAddress}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <Tr key={e.id}>
                  <Td
                    className="text-ink-2 whitespace-nowrap"
                    title={formatDateTime(e.createdAt, locale)}
                  >
                    {formatRelative(e.createdAt, undefined, locale)}
                  </Td>
                  <Td>
                    <p className="font-medium">
                      {e.userName ?? e.email ?? t.adminManage.security.unknown}
                    </p>
                    {e.userName && e.email ? (
                      <p className="text-ink-3 text-[12px]">{e.email}</p>
                    ) : null}
                  </Td>
                  <Td>
                    {e.success ? (
                      <span>
                        {t.adminManage.security.signedIn}
                        <span className="text-ink-3">
                          {" "}
                          · {methodLabels[e.method] ?? e.method}
                        </span>
                      </span>
                    ) : (
                      <span className="text-loss">
                        {t.adminManage.security.failed}
                        <span className="text-ink-3">
                          {" "}
                          · {e.reason ?? methodLabels[e.method]}
                        </span>
                      </span>
                    )}
                  </Td>
                  <Td title={e.userAgent ?? undefined}>
                    {e.device ?? t.adminManage.security.unknown}
                    {e.newDevice ? (
                      <Tag tone="warn" className="ml-2">
                        {t.adminManage.security.new}
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
              {t.adminManage.security.loadOlder}
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
