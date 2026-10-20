"use client";

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
import { jobStatusLabels } from "./admin-overview";

type JobFilter = NonNullable<RouterInputs["admin"]["jobs"]["list"]["filter"]>;

const filters: { value: JobFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "failed", label: "Failed" },
  { value: "stuck", label: "Stuck" },
  { value: "waiting", label: "Waiting for review" },
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "needs_review", label: "Needs review" },
  { value: "completed", label: "Completed" },
];

const statusTones = {
  failed: "loss",
  needs_review: "warn",
  completed: "soft",
  running: "brand",
  queued: "neutral",
  cancelled: "outline",
} as const;

const kindLabels: Record<string, string> = {
  bank_statement: "Bank statement",
  card_statement: "Card statement",
  brokerage_statement: "Brokerage statement",
  trade_confirmation: "Trade confirmation",
  screenshot: "Screenshot",
  csv: "CSV",
  other: "Document",
};

export function ImportJobsAdmin({
  emailConfigured,
}: {
  emailConfigured: boolean;
}) {
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
      success("Queued to be read again.");
      await refresh();
    },
    onError: error,
  });
  const cancel = api.admin.jobs.cancel.useMutation({
    onMutate: clear,
    onSuccess: async () => {
      success("Stopped. The owner can read it again from Imports.");
      await refresh();
    },
    onError: error,
  });
  const remind = api.admin.jobs.remind.useMutation({
    onMutate: clear,
    onSuccess: () => success("Reminder sent."),
    onError: error,
  });

  return (
    <Section
      title="Jobs"
      description="Metadata only. File names, contents and what the AI read stay private to their owner."
    >
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <FilterTabs
          label="Filter import jobs"
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
            aria-label="Search by owner"
            placeholder="Owner name or email, then Enter"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
      </div>
      <FlashNotice flash={flash} className="mb-4" />

      {jobs.isLoading ? (
        <p className="text-ink-3 text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title={
            filter === "failed" || filter === "stuck"
              ? "Nothing here"
              : "No imports"
          }
        >
          {filter === "stuck"
            ? "No job has been queued or running for more than six minutes."
            : filter === "failed"
              ? "Failed statement reads show up here with the provider's error."
              : "Statements people upload will be listed here."}
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Uploaded</Th>
                <Th>Owner</Th>
                <Th>Document</Th>
                <Th>Status</Th>
                <Th>Provider</Th>
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {items.map((job) => (
                <Tr key={job.id}>
                  <Td
                    className="text-ink-2 whitespace-nowrap"
                    title={formatDateTime(job.createdAt)}
                  >
                    {formatRelative(job.createdAt)}
                  </Td>
                  <Td>
                    <p className="font-medium">{job.ownerName}</p>
                    <p className="text-ink-3 text-[12px]">{job.ownerEmail}</p>
                  </Td>
                  <Td className="text-ink-2 text-[13px]">
                    {kindLabels[job.documentKind] ?? "Document"} ·{" "}
                    {formatBytes(job.sizeBytes)}
                    {job.filePurged ? (
                      <span className="text-ink-3"> · file removed</span>
                    ) : null}
                  </Td>
                  <Td className="max-w-80">
                    <Tag tone={statusTones[job.status]}>
                      {jobStatusLabels[job.status]}
                    </Tag>
                    {job.stale ? (
                      <Tag tone="warn" className="ml-1">
                        Stuck
                      </Tag>
                    ) : null}
                    {job.attempts > 1 ? (
                      <span className="text-ink-3 ml-2 text-[12px]">
                        {job.attempts} attempts
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
                        Retry
                      </Button>
                    ) : null}
                    {job.status === "queued" || job.status === "running" ? (
                      <ConfirmButton
                        variant="ghost"
                        size="sm"
                        className="ml-1"
                        confirmLabel="Stop this read?"
                        onConfirm={() => cancel.mutate({ id: job.id })}
                      >
                        Stop
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
                        Email reminder
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
              Load older
            </Button>
          ) : null}
        </>
      )}
    </Section>
  );
}
