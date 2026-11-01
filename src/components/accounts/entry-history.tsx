"use client";

import { useT, useLocale } from "~/i18n/client";

import { FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { SnapshotDrawer } from "~/components/accounts/snapshot-drawer";
import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/dialog";
import { Notice, Section, Tag } from "~/components/ui/panel";
import { errorMessage } from "~/lib/errors";
import { formatDate } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Entry = RouterOutputs["portfolio"]["history"]["entries"][number];

export function EntryHistory({
  account,
  editId,
  onEdit,
  onAdd,
  onChanged,
}: {
  account: RouterOutputs["accounts"]["get"];
  editId: string | null;
  onEdit: (id: string | null) => void;
  onAdd: () => void;
  onChanged: (message: string) => Promise<void>;
}) {
  const t = useT();
  const locale = useLocale();
  const history = api.portfolio.history.useInfiniteQuery(
    { accountId: account.id },
    { getNextPageParam: (page) => page.nextCursor ?? undefined },
  );
  const detail = api.portfolio.snapshot.useQuery(
    { accountId: account.id, snapshotId: editId ?? "" },
    { enabled: !!editId, staleTime: 0, refetchOnWindowFocus: false },
  );
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const remove = api.portfolio.removeSnapshot.useMutation({
    onSuccess: async () => {
      setDeleting(null);
      await onChanged(
        t.accounts.history.entryDeletedTheAccountNowUsesItsLatestRemainingDated,
      );
    },
  });
  const currentId = history.data?.pages[0]?.currentId;
  const entries = history.data?.pages.flatMap((page) => page.entries) ?? [];
  return (
    <>
      <Section
        title={t.accounts.history.entryHistory}
        description={
          t.accounts.history
            .manageHoldingsAndCashEnteredManuallyOrImportedFromStatements
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={onAdd}
            disabled={!!account.archivedAt}
          >
            <Plus className="size-3.5" />
            {t.accounts.history.addEntry}
          </Button>
        }
      >
        {history.error ? (
          <Notice tone="error">{errorMessage(history.error)}</Notice>
        ) : null}
        {detail.error && editId ? (
          <Notice tone="error" className="mb-3">
            {errorMessage(detail.error)}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => onEdit(null)}
            >
              {t.accounts.history.dismiss}
            </button>
          </Notice>
        ) : null}
        {detail.isFetching && editId ? (
          <p className="text-ink-3 text-sm">
            {t.accounts.history.loadingEntry}
          </p>
        ) : null}
        {history.isLoading ? (
          <p className="text-ink-3 text-sm">
            {t.accounts.history.loadingHistory}
          </p>
        ) : null}
        {!history.isLoading && !history.error && !entries.length ? (
          <p className="text-ink-3 text-sm">
            {
              t.accounts.history
                .noEntriesYetAddHoldingsManuallyOrImportAStatement
            }
          </p>
        ) : null}
        <ul className="divide-line divide-y">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">
                    {formatDate(entry.asOf, locale)}
                  </span>
                  {entry.id === currentId ? (
                    <Tag>{t.accounts.history.current}</Tag>
                  ) : null}
                  {!entry.positionCount && !entry.cashCount ? (
                    <Tag tone="warn">{t.accounts.history.blankEntry}</Tag>
                  ) : null}
                </div>
                <p className="text-ink-3 mt-1 text-[12px]">
                  {t.accounts.history.summary(
                    entry.source === "manual"
                      ? t.accounts.history.manual
                      : entry.source === "statement"
                        ? t.accounts.history.imported
                        : t.accounts.history.synced,
                    entry.adjusted,
                    entry.positionCount,
                    entry.cashCount,
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {entry.importId ? (
                  <Link
                    href={`/imports/${entry.importId}`}
                    aria-label={t.accounts.history.viewImport(
                      formatDate(entry.asOf, locale),
                    )}
                    className="hover:bg-wash rounded-ctl grid size-10 place-items-center"
                  >
                    <FileUp className="size-4" />
                  </Link>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10"
                  disabled={!!account.archivedAt}
                  onClick={() => onEdit(entry.id)}
                  aria-label={t.accounts.history.editEntry(
                    formatDate(entry.asOf, locale),
                  )}
                >
                  <Pencil className="size-3.5" />
                  {t.common.actions.edit}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-loss size-10 px-0"
                  disabled={!!account.archivedAt}
                  onClick={() => {
                    remove.reset();
                    setDeleting(entry);
                  }}
                  aria-label={t.accounts.history.deleteEntry(
                    formatDate(entry.asOf, locale),
                  )}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {history.hasNextPage ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            loading={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
          >
            {t.accounts.history.loadOlderEntries}
          </Button>
        ) : null}
      </Section>
      {editId && detail.data && !detail.isFetching ? (
        <SnapshotDrawer
          key={`${detail.data.id}:${detail.data.version}`}
          account={account}
          entry={detail.data}
          open
          onClose={() => onEdit(null)}
          onSaved={async (message) => {
            onEdit(null);
            await onChanged(message);
          }}
        />
      ) : null}
      <Drawer
        open={!!deleting}
        onClose={() => {
          if (!remove.isPending) setDeleting(null);
        }}
        title={t.accounts.history.deleteEntryTitle}
        description={
          deleting
            ? t.accounts.history.removeConfirm(
                formatDate(deleting.asOf, locale),
              )
            : undefined
        }
        footer={
          <>
            <Button
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => setDeleting(null)}
            >
              {t.common.actions.cancel}
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => {
                if (deleting)
                  remove.mutate({
                    accountId: account.id,
                    snapshotId: deleting.id,
                    version: deleting.version,
                  });
              }}
            >
              {t.accounts.history.deleteEntryTitle}
            </Button>
          </>
        }
      >
        {deleting ? (
          <div className="space-y-4">
            <p className="text-sm">
              {t.accounts.history.removeCount(
                deleting.positionCount,
                deleting.cashCount,
              )}
            </p>
            <Notice tone={deleting.id === currentId ? "warn" : "info"}>
              {t.accounts.history.ifThisIsTheCurrentEntryTheMostRecentRemaining}
            </Notice>
            {remove.error ? (
              <Notice tone="error">{errorMessage(remove.error)}</Notice>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
