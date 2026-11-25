"use client";

import { integer } from "./data-number-format";
import { useT } from "~/i18n/client";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Checkbox, Input } from "~/components/ui/field";
import { Section } from "~/components/ui/panel";
import { useFlash } from "~/components/ui/use-flash";
import { formatBytes } from "~/lib/format";
import { api } from "~/trpc/react";

export function StorageAdmin() {
  const t = useT();
  const utils = api.useUtils();
  const [storage] = api.admin.data.storage.useSuspenseQuery();
  const [enabled, setEnabled] = useState(storage.retentionDays !== null);
  const [days, setDays] = useState(storage.retentionDays ?? 90);
  const preview = api.admin.data.retentionPreview.useQuery(
    { days },
    { enabled: enabled && days > 0 },
  );
  const { flash, success, error, clear } = useFlash(10_000);
  const invalidate = () => utils.admin.data.storage.invalidate();
  const save = api.admin.data.setRetention.useMutation({
    onMutate: clear,
    onSuccess: async (_, input) => {
      success(
        input.days
          ? t.adminManage.data.retentionSaved(input.days)
          : t.adminManage.data.statementFilesAreKeptForever,
      );
      await invalidate();
    },
    onError: error,
  });
  const purge = api.admin.data.purgeNow.useMutation({
    onMutate: clear,
    onSuccess: async (r) => {
      success(
        r.files
          ? t.adminManage.data.filesDeleted(r.files, formatBytes(r.bytes))
          : t.adminManage.data.nothingToCleanUp,
      );
      await invalidate();
    },
    onError: error,
  });
  const dirty = enabled
    ? storage.retentionDays !== days
    : storage.retentionDays !== null;

  return (
    <div className="space-y-6">
      <Section title={t.adminManage.data.storedStatements}>
        <dl className="grid grid-cols-3 gap-6">
          {[
            [t.adminManage.data.filesKept, integer.format(storage.stats.files)],
            [t.adminManage.data.spaceUsed, formatBytes(storage.stats.bytes)],
            [
              t.adminManage.data.alreadyCleanedUp,
              integer.format(storage.stats.purged),
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-ink-2 text-[13px] font-semibold">{label}</dt>
              <dd className="figures font-display text-2xl font-semibold">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        title={t.adminManage.data.retention}
        description={t.adminManage.data.retentionHelp}
      >
        <div className="space-y-4">
          <FlashNotice flash={flash} onDismiss={clear} />
          <Checkbox
            label={t.adminManage.data.deleteCompletedFiles}
            description={t.adminManage.data.duplicateDetectionHelp}
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          {enabled ? (
            <div className="flex flex-wrap items-center gap-2 pl-6.5 text-sm">
              {t.adminManage.data.keepFor}
              <Input
                type="number"
                min={1}
                max={3650}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                aria-label={t.adminManage.data.daysToKeepFiles}
                className="h-9 w-24"
              />
              {t.adminManage.data.days}
              {preview.data ? (
                <span className="text-ink-3 ml-2">
                  {preview.data.files
                    ? t.adminManage.data.cleanupPreview(
                        preview.data.files,
                        formatBytes(preview.data.bytes),
                      )
                    : t.adminManage.data.nothingOldEnoughToDeleteYet}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!dirty || (enabled && !(days > 0))}
              loading={save.isPending}
              onClick={() => save.mutate({ days: enabled ? days : null })}
            >
              {t.common.actions.save}
            </Button>
            {storage.retentionDays && storage.eligible?.files ? (
              <ConfirmButton
                variant="danger"
                loading={purge.isPending}
                confirmLabel={t.adminManage.data.deleteFiles(
                  storage.eligible.files,
                )}
                onConfirm={() => purge.mutate()}
              >
                {t.adminManage.data.cleanUpNow}
              </ConfirmButton>
            ) : null}
          </div>
        </div>
      </Section>
    </div>
  );
}
