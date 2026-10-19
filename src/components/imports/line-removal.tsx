"use client";

import Link from "next/link";

import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/dialog";
import { Notice } from "~/components/ui/panel";
import { errorMessage } from "~/lib/errors";
import { api } from "~/trpc/react";

export function ImportLineRemoval({
  jobId,
  rowId,
  accountId,
  onClose,
  onRemoved,
}: {
  jobId: string;
  rowId: string | null;
  accountId: string | null;
  onClose: () => void;
  onRemoved: () => Promise<void>;
}) {
  // Remounting for each selection resets both the review token and mutation errors.
  return rowId ? (
    <Review
      key={rowId}
      jobId={jobId}
      rowId={rowId}
      accountId={accountId}
      onClose={onClose}
      onRemoved={onRemoved}
    />
  ) : null;
}

function Review({
  jobId,
  rowId,
  accountId,
  onClose,
  onRemoved,
}: {
  jobId: string;
  rowId: string;
  accountId: string | null;
  onClose: () => void;
  onRemoved: () => Promise<void>;
}) {
  const preview = api.imports.lineRemovalPreview.useQuery(
    { jobId, rowId },
    { staleTime: 0, refetchOnWindowFocus: false, retry: false },
  );
  const remove = api.imports.removeLine.useMutation({ onSuccess: onRemoved });
  const line = preview.data;
  return (
    <Drawer
      open
      onClose={() => {
        if (!remove.isPending) onClose();
      }}
      title="Remove imported row"
      description="Review the saved record before removing it."
      footer={
        <>
          <Button variant="ghost" disabled={remove.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            disabled={
              !line || preview.isFetching || !!preview.error || !!remove.error
            }
            onClick={() => {
              if (line) remove.mutate({ jobId, rowId, version: line.version });
            }}
          >
            Remove row
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {preview.isLoading ? (
          <p className="text-ink-2 text-sm">Checking the saved row…</p>
        ) : null}
        {line ? (
          <>
            <p className="text-lg font-semibold break-words">{line.label}</p>
            <dl className="space-y-2 text-sm">
              {line.facts.map((fact) => (
                <div
                  key={fact.label}
                  className="flex flex-wrap justify-between gap-2"
                >
                  <dt className="text-ink-2">{fact.label}</dt>
                  <dd className="figures font-mono">{fact.value}</dd>
                </div>
              ))}
            </dl>
            <Notice tone="warn">{line.effect}</Notice>
            <p className="text-ink-2 text-sm">
              The original upload and extraction stay available, with this row
              marked Removed. Other imported rows stay saved. This removal
              cannot be undone here; you can add a corrected entry manually.
            </p>
          </>
        ) : null}
        {preview.error || remove.error ? (
          <Notice tone="error">
            {errorMessage((preview.error ?? remove.error)!)}
          </Notice>
        ) : null}
        {accountId ? (
          <Link
            href={`/accounts/${accountId}`}
            className="text-sm font-semibold underline underline-offset-4"
          >
            Open account and Entry history
          </Link>
        ) : null}
      </div>
    </Drawer>
  );
}
