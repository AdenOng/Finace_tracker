"use client";

import { useT, useLocale } from "~/i18n/client";
import type { Messages } from "~/i18n/messages";

import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Input } from "~/components/ui/field";
import { EmptyState, Section, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { FilterTabs } from "~/components/ui/tabs";
import { useFlash } from "~/components/ui/use-flash";
import { cn } from "~/lib/cn";
import { formatBytes, formatDateTime, formatRelative } from "~/lib/format";
import { api, type RouterInputs } from "~/trpc/react";

type JobFilter = NonNullable<RouterInputs["admin"]["jobs"]["list"]["filter"]>;

const filterOptions = (t: Messages): { value: JobFilter; label: string }[] => [
  { value: "all", label: t.adminManage.imports.all },
  { value: "failed", label: t.adminManage.imports.failed },
  { value: "stuck", label: t.adminManage.imports.stuck },
  { value: "waiting", label: t.adminManage.imports.waitingForReview },
  { value: "queued", label: t.adminManage.imports.queued },
  { value: "running", label: t.adminManage.imports.running },
  { value: "needs_review", label: t.adminManage.imports.needsReview },
  { value: "completed", label: t.adminManage.imports.completed },
];

const statusTones = {
  failed: "loss",
  needs_review: "warn",
  completed: "soft",
  running: "brand",
  queued: "neutral",
  cancelled: "outline",
} as const;

const getKindLabels = (t: Messages): Record<string, string> => ({
  bank_statement: t.adminManage.imports.bankStatement,
  card_statement: t.adminManage.imports.cardStatement,
  brokerage_statement: t.adminManage.imports.brokerageStatement,
  trade_confirmation: t.adminManage.imports.tradeConfirmation,
  screenshot: t.adminManage.imports.screenshot,
  csv: t.adminManage.imports.csv,
  other: t.adminManage.imports.document,
});

export function ImportJobsAdmin({
  emailConfigured,
}: {
  emailConfigured: boolean;
}) {
  const locale = useLocale();
  const t = useT();
  const filters = filterOptions(t);
  const kindLabels = getKindLabels(t);
  const utils = api.useUtils();
  const params = useSearchParams();
  const [filter, setFilter] = useState<JobFilter>(() => {
    const value = params.get("filter");
    return filters.some((f) => f.value === value)
      ? (value as JobFilter)
      : "all";
  });
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { flash, success, error, clear } = useFlash();
  const [counts] = api.admin.jobs.counts.useSuspenseQuery();
  const jobs = api.admin.jobs.list.useInfiniteQuery(
    { filter, query: submitted || undefined },
    {
      getNextPageParam: (page) => page.nextCursor,
      // Running and queued jobs change on their own; keep the list current.
      refetchInterval: (q) =>
        q.state.data?.pages.some((p) =>
          p.items.some((j) => j.status === "running" || j.status === "queued"),
        )
          ? 5000
          : false,
    },
  );
  const items = jobs.data?.pages.flatMap((p) => p.items) ?? [];

  const refresh = () =>
    Promise.all([
      utils.admin.jobs.list.invalidate(),
      utils.admin.jobs.counts.invalidate(),
      utils.admin.overview.attention.invalidate(),
    ]);
  const retry = api.admin.jobs.retry.useMutation({
    onMutate: clear,
    onSuccess: async () => {
      success(t.adminManage.imports.queuedToBeReadAgain);
      await refresh();
    },
    onError: error,
  });
  const cancel = api.admin.jobs.cancel.useMutation({
    onMutate: clear,
    onSuccess: async () => {
      success(t.adminManage.imports.readStopped);
      await refresh();
    },
    onError: error,
  });
  const remind = api.admin.jobs.remind.useMutation({
    onMutate: clear,
    onSuccess: () => success(t.adminManage.imports.reminderSent),
    onError: error,
  });

  return (
    <Section
      title={t.adminManage.imports.jobs}
      description={t.adminManage.imports.privacyHelp}
    >
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <FilterTabs
          label={t.adminManage.imports.filterImportJobs}
          value={filter}
          onChange={setFilter}
          options={filters
            .filter(
              (f) =>
                ["all", "failed", "stuck", "waiting"].includes(f.value) ||
                counts[f.value] > 0,
            )
            .map((f) => ({ ...f, count: counts[f.value] }))}
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
            aria-label={t.adminManage.imports.searchByOwner}
            placeholder={t.adminManage.imports.ownerNameOrEmailThenEnter}
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
      </div>
      <FlashNotice flash={flash} onDismiss={clear} className="mb-4" />

      {jobs.isLoading ? (
        <p className="text-ink-3 text-sm">{t.common.status.loading}</p>
      ) : items.length === 0 ? (
        <EmptyState
          title={
            filter === "failed" || filter === "stuck"
              ? t.adminManage.imports.nothingHere
              : t.adminManage.imports.noImports
          }
        >
          {filter === "stuck"
            ? t.adminManage.imports.noStuckJobs
            : filter === "failed"
              ? t.adminManage.imports.failedJobsHelp
              : t.adminManage.imports.emptyJobsHelp}
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>{t.adminManage.imports.uploaded}</Th>
                <Th>{t.adminManage.imports.owner}</Th>
                <Th>{t.adminManage.imports.document}</Th>
                <Th>{t.common.fields.status}</Th>
                <Th>{t.adminManage.imports.provider}</Th>
                <Th className="text-right">
                  <span className="sr-only">
                    {t.adminManage.imports.actions}
                  </span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {items.map((job) => (
                <Tr key={job.id}>
                  <Td
                    className="text-ink-2 whitespace-nowrap"
                    title={formatDateTime(job.createdAt, locale)}
                  >
                    {formatRelative(job.createdAt, undefined, locale)}
                  </Td>
                  <Td>
                    <p className="font-medium">{job.ownerName}</p>
                    <p className="text-ink-3 text-[12px]">{job.ownerEmail}</p>
                  </Td>
                  <Td className="text-ink-2 text-[13px]">
                    {kindLabels[job.documentKind] ??
                      t.adminManage.imports.document}{" "}
                    · {formatBytes(job.sizeBytes)}
                    {job.filePurged ? (
                      <span className="text-ink-3">
                        {" "}
                        {t.adminManage.imports.fileRemoved}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="max-w-80">
                    <Tag tone={statusTones[job.status]}>
                      {(
                        t.admin.jobStatus as Record<string, string | undefined>
                      )[job.status] ?? job.status}
                    </Tag>
                    {job.stale ? (
                      <Tag tone="warn" className="ml-1">
                        {t.adminManage.imports.stuck}
                      </Tag>
                    ) : null}
                    {job.attempts > 1 ? (
                      <span className="text-ink-3 ml-2 text-[12px]">
                        {t.adminManage.imports.attempts(job.attempts)}
                      </span>
                    ) : null}
                    {job.error ? (
                      <p className="text-loss mt-1 text-[12px] break-words">
                        {job.error}
                      </p>
                    ) : null}
                  </Td>
                  <Td className="text-[13px]">
                    {job.providerName ??
                      (job.model ? null : (
                        <span className="text-ink-3">—</span>
                      ))}
                    {job.model ? (
                      <p
                        className={cn(
                          "break-all",
                          job.providerName && "text-ink-3 text-[12px]",
                        )}
                      >
                        {job.model}
                      </p>
                    ) : null}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    {job.status === "failed" || job.stale ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={job.filePurged}
                        loading={
                          retry.isPending && retry.variables?.id === job.id
                        }
                        onClick={() => retry.mutate({ id: job.id })}
                      >
                        {t.common.actions.retry}
                      </Button>
                    ) : null}
                    {job.status === "queued" || job.status === "running" ? (
                      <ConfirmButton
                        variant="ghost"
                        size="sm"
                        className="ml-1"
                        confirmLabel={t.adminManage.imports.stopThisRead}
                        onConfirm={() => cancel.mutate({ id: job.id })}
                      >
                        {t.adminManage.imports.stop}
                      </ConfirmButton>
                    ) : null}
                    {job.status === "needs_review" && emailConfigured ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={
                          remind.isPending && remind.variables?.id === job.id
                        }
                        onClick={() => remind.mutate({ id: job.id })}
                      >
                        {t.adminManage.imports.emailReminder}
                      </Button>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {jobs.hasNextPage ? (
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              loading={jobs.isFetchingNextPage}
              onClick={() => void jobs.fetchNextPage()}
            >
              {t.adminManage.imports.loadOlder}
            </Button>
          ) : null}
        </>
      )}
    </Section>
  );
}
