"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState, Notice, Section, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { formatDateTime } from "~/lib/format";
import { api } from "~/trpc/react";

const integer = new Intl.NumberFormat("en-SG");

const statusLabels: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  needs_review: "Needs review",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div>
      <dt className="text-ink-2 text-[13px] font-semibold">{label}</dt>
      <dd className="figures font-display text-2xl font-semibold">{value}</dd>
      {note ? <dd className="text-ink-3 text-[13px]">{note}</dd> : null}
    </div>
  );
}

export function AdminOverview() {
  const [stats] = api.admin.overview.stats.useSuspenseQuery();
  const [failed] = api.admin.overview.failedJobs.useSuspenseQuery();
  const withoutTwoFactor = stats.users.total - stats.users.twoFactor;
  const jobsThisWeek = stats.jobsByStatus.reduce((n, s) => n + s.count, 0);

  return (
    <div className="space-y-14">
      {stats.defaultProvider === null ? (
        <Notice tone="error">
          No default AI provider is enabled, so imports will fail.{" "}
          <Link
            href="/admin/ai"
            className="font-semibold underline underline-offset-4"
          >
            Set one up
          </Link>
          .
        </Notice>
      ) : null}

      <Section title="People">
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Figure
            label="Users"
            value={integer.format(stats.users.total)}
            note={`${stats.users.admins} admin${stats.users.admins === 1 ? "" : "s"}${stats.users.disabled ? `, ${stats.users.disabled} disabled` : ""}`}
          />
          <Figure
            label="Active in 30 days"
            value={integer.format(stats.activeUsers)}
            note={`${stats.activeSessions} signed-in session${stats.activeSessions === 1 ? "" : "s"}`}
          />
          <Figure
            label="Two-step on"
            value={`${stats.users.twoFactor} / ${stats.users.total}`}
            note={
              withoutTwoFactor > 0 ? (
                <span className="text-warn">
                  {withoutTwoFactor} without two-step
                </span>
              ) : (
                "Everyone is covered"
              )
            }
          />
          <Figure
            label="Pending invites"
            value={integer.format(stats.pendingInvites)}
            note={
              <Link
                href="/admin/users"
                className="text-brand font-semibold underline underline-offset-4"
              >
                Manage users
              </Link>
            }
          />
        </dl>
      </Section>

      <Section
        title="Imports"
        description={`Default provider: ${stats.defaultProvider ?? "none"}. Counts cover the last 7 days; token usage the last 30.`}
      >
        {jobsThisWeek === 0 && stats.usage.length === 0 ? (
          <p className="text-ink-3 text-sm">No imports yet.</p>
        ) : (
          <div className="space-y-8">
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Figure label="Jobs this week" value={jobsThisWeek} />
              {stats.jobsByStatus.map((s) => (
                <Figure
                  key={s.status}
                  label={statusLabels[s.status] ?? s.status}
                  value={integer.format(s.count)}
                />
              ))}
            </dl>
            {stats.usage.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Provider</Th>
                    <Th className="text-right">Jobs</Th>
                    <Th className="text-right">Input tokens</Th>
                    <Th className="text-right">Output tokens</Th>
                  </tr>
                </thead>
                <tbody>
                  {stats.usage.map((u) => (
                    <Tr key={u.providerId ?? "deleted"}>
                      <Td className="font-medium">
                        {u.providerName ?? "Deleted provider"}
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
            ) : null}
          </div>
        )}
      </Section>

      <Section
        title="Failed imports"
        description="The 25 most recent. Only job details are shown; documents and extracted data stay private to their owner."
      >
        {failed.length === 0 ? (
          <EmptyState title="Nothing has failed">
            Failed statement reads will show up here with the provider&apos;s
            error.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>User</Th>
                <Th>Provider</Th>
                <Th className="text-right">Attempts</Th>
                <Th>Error</Th>
              </tr>
            </thead>
            <tbody>
              {failed.map((job) => (
                <Tr key={job.id}>
                  <Td className="text-ink-2 whitespace-nowrap">
                    {formatDateTime(job.finishedAt ?? job.createdAt)}
                  </Td>
                  <Td>{job.ownerName}</Td>
                  <Td>
                    {job.providerName ?? "Deleted provider"}
                    {job.model ? (
                      <Tag tone="outline" className="ml-2">
                        {job.model}
                      </Tag>
                    ) : null}
                  </Td>
                  <Td className="figures text-right">{job.attempts}</Td>
                  <Td className="text-loss text-[13px] break-words">
                    {job.error ?? "No error recorded"}
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
