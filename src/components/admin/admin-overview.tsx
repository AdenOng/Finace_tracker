"use client";

import { useT } from "~/i18n/client";

import { ArrowRight, CircleAlert, CircleCheck, Info } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Section, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { cn } from "~/lib/cn";
import { api } from "~/trpc/react";

const integer = new Intl.NumberFormat("en-SG");

const statusOrder = [
  "queued",
  "running",
  "needs_review",
  "completed",
  "failed",
] as const;

function Figure({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <dt className="text-ink-2 text-[13px] font-semibold">{label}</dt>
      <dd className="figures font-display text-2xl font-semibold">{value}</dd>
      {note ? <dd className="text-ink-3 text-[13px]">{note}</dd> : null}
    </>
  );
  return href ? (
    <Link
      href={href}
      className="rounded-ctl hover:bg-wash -m-2 block p-2 transition-colors"
    >
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}

const toneStyles = {
  error: { icon: CircleAlert, className: "text-loss" },
  warn: { icon: CircleAlert, className: "text-warn" },
  info: { icon: Info, className: "text-ink-3" },
} as const;

function Attention() {
  const t = useT();
  const [items] = api.admin.overview.attention.useSuspenseQuery();
  if (items.length === 0) {
    return (
      <div className="card flex items-center gap-3 p-5 text-sm">
        <CircleCheck className="text-gain size-5 shrink-0" />
        <span>
          <strong>{t.admin.overview.nothingNeedsAttention}</strong>{" "}
          {t.admin.overview.providersImportsBackupsAndSignInsAllLookNormal}
        </span>
      </div>
    );
  }
  return (
    <Section
      title={t.admin.overview.needsAttention}
      description={t.admin.overview.attentionCount(items.length)}
    >
      <ul className="border-line divide-line -my-1 divide-y">
        {items.map((item) => {
          const tone = toneStyles[item.tone];
          const Icon = tone.icon;
          return (
            <li
              key={`${item.title}-${item.href}`}
              className="flex flex-wrap items-start gap-3 py-3"
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", tone.className)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.title}</p>
                {item.detail ? (
                  <p className="text-ink-2 text-[13px] break-words">
                    {item.detail}
                  </p>
                ) : null}
              </div>
              <Link
                href={item.href}
                className="text-brand inline-flex items-center gap-1 text-[13px] font-semibold whitespace-nowrap underline-offset-4 hover:underline"
              >
                {item.action}
                <ArrowRight className="size-3.5" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function AdminOverview() {
  const t = useT();
  const [stats] = api.admin.overview.stats.useSuspenseQuery();
  const withoutTwoFactor = stats.users.total - stats.users.twoFactor;
  const counts = new Map(stats.jobsByStatus.map((s) => [s.status, s.count]));
  const jobsThisWeek = stats.jobsByStatus.reduce((n, s) => n + s.count, 0);

  return (
    <div className="space-y-6">
      <Attention />

      <Section title={t.admin.overview.people}>
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Figure
            label={t.admin.overview.users}
            href="/admin/users"
            value={integer.format(stats.users.total)}
            note={t.admin.overview.usersNote(
              stats.users.admins,
              stats.users.disabled,
            )}
          />
          <Figure
            label={t.admin.overview.activeIn30Days}
            value={integer.format(stats.activeUsers)}
            note={t.admin.overview.sessions(stats.activeSessions)}
          />
          <Figure
            label={t.admin.overview.twoStepOn}
            href={
              withoutTwoFactor > 0 ? "/admin/users?filter=no2fa" : undefined
            }
            value={`${stats.users.twoFactor} / ${stats.users.total}`}
            note={
              withoutTwoFactor > 0 ? (
                <span className="text-warn">
                  {t.admin.overview.withoutTwoStep(withoutTwoFactor)}
                </span>
              ) : (
                t.admin.overview.everyoneIsCovered
              )
            }
          />
          <Figure
            label={t.admin.overview.pendingInvites}
            href="/admin/users"
            value={integer.format(stats.pendingInvites)}
            note={t.admin.overview.singleUse7Days}
          />
        </dl>
      </Section>

      <Section
        title={t.admin.overview.importsThisWeek}
        description={t.admin.overview.importsDescription(
          stats.defaultProvider,
          jobsThisWeek,
          integer.format(jobsThisWeek),
        )}
        actions={
          <Link
            href="/admin/imports"
            className="text-brand inline-flex items-center gap-1 text-[13px] font-semibold underline-offset-4 hover:underline"
          >
            {t.admin.overview.allImportJobs}
            <ArrowRight className="size-3.5" />
          </Link>
        }
      >
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-5">
          {statusOrder.map((status) => {
            const n = counts.get(status) ?? 0;
            return (
              <Figure
                key={status}
                label={t.admin.jobStatus[status]}
                href={`/admin/imports?filter=${status}`}
                value={
                  <span
                    className={cn(
                      status === "failed" && n > 0 && "text-loss",
                      n === 0 && "text-ink-3",
                    )}
                  >
                    {integer.format(n)}
                  </span>
                }
              />
            );
          })}
        </dl>
      </Section>

      <Section
        title={t.admin.overview.aiUsageLast30Days}
        actions={
          <Link
            href="/admin/ai/usage"
            className="text-brand inline-flex items-center gap-1 text-[13px] font-semibold underline-offset-4 hover:underline"
          >
            {t.admin.overview.usageCost}
            <ArrowRight className="size-3.5" />
          </Link>
        }
      >
        {stats.usage.length === 0 ? (
          <p className="text-ink-3 text-sm">
            {t.admin.overview.noStatementsReadYet}
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t.admin.overview.provider}</Th>
                <Th>{t.admin.overview.model}</Th>
                <Th className="text-right">{t.admin.overview.jobs}</Th>
                <Th className="text-right">{t.admin.overview.inputTokens}</Th>
                <Th className="text-right">{t.admin.overview.outputTokens}</Th>
              </tr>
            </thead>
            <tbody>
              {stats.usage.map((u) => (
                <Tr key={`${u.providerId ?? "none"}-${u.model ?? "none"}`}>
                  <Td className="font-medium">
                    {u.providerName ??
                      (u.providerId ? (
                        t.admin.overview.deletedProvider
                      ) : (
                        <span
                          className="text-ink-3"
                          title={
                            t.admin.overview
                              .importsReadBeforeProviderTrackingWasAdded
                          }
                        >
                          {t.admin.overview.notRecorded}
                        </span>
                      ))}
                  </Td>
                  <Td>
                    {u.model ? (
                      <Tag tone="outline">{u.model}</Tag>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </Td>
                  <Td className="figures text-right">
                    {integer.format(u.jobs)}
                  </Td>
                  <Td className="figures text-right">
                    {integer.format(u.inputTokens || 0)}
                  </Td>
                  <Td className="figures text-right">
                    {integer.format(u.outputTokens || 0)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </div>
  );
}
