"use client";

import { FileImage, FileText, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { InstitutionMark } from "~/components/accounts/institution-mark";
import { ImportStatus, isReading } from "~/components/imports/import-status";
import { Button } from "~/components/ui/button";
import { Notice, Section } from "~/components/ui/panel";
import {
  type AccountGroup,
  accountGroupOf,
  accountGroups,
  accountTypeLabels,
} from "~/lib/accounts";
import { cn } from "~/lib/cn";
import { formatDate, formatDateTime } from "~/lib/format";
import { api } from "~/trpc/react";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";
const MAX_BYTES = 20 * 1024 * 1024;

const WHAT_IT_READS: Record<AccountGroup, string> = {
  investments:
    "Holdings, cash and trades from a brokerage statement or app screenshot.",
  banking:
    "Every transaction and the closing balance from a bank or card statement.",
  cpf_srs:
    "SRS holdings, cash and top-ups, or your CPF balance. Split CPF into its accounts by hand afterwards.",
};

export function ImportsView({
  initialAccountId,
}: {
  initialAccountId: string | null;
}) {
  const router = useRouter();
  const [accounts] = api.accounts.list.useSuspenseQuery();
  const open = accounts.filter((a) => !a.archivedAt);
  const [accountId, setAccountId] = useState<string | null>(
    open.some((a) => a.id === initialAccountId) ? initialAccountId : null,
  );
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<{
    message: string;
    jobId?: string;
  } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const jobs = api.imports.list.useQuery(undefined, {
    refetchInterval: (query) =>
      query.state.data?.some((j) => isReading(j.status, j.stale))
        ? 3000
        : false,
  });
  const account = open.find((a) => a.id === accountId);
  const group = account ? accountGroupOf(account.type) : null;

  async function upload(file: File) {
    if (!account) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError({ message: "That file is larger than 20 MB." });
      return;
    }
    if (!ACCEPT.split(",").includes(file.type)) {
      setError({ message: "Use a PDF, PNG, JPEG or WebP file." });
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("accountId", account.id);
      const response = await fetch("/api/imports", { method: "POST", body });
      const json = (await response.json().catch(() => ({}))) as {
        jobId?: string;
        error?: string;
      };
      if (response.status === 202 && json.jobId) {
        router.push(`/imports/${json.jobId}`);
        return;
      }
      setError({
        message: json.error ?? "The upload failed. Try again.",
        jobId: json.jobId,
      });
    } catch {
      setError({ message: "The upload failed. Check your connection." });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <div className="ink-strip h-1.5" />
        <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* 1. Which account */}
          <div>
            <p className="eyebrow">1 · Which account is it for?</p>
            {open.length === 0 ? (
              <p className="text-ink-2 mt-4 text-sm">
                Add an account first, so the statement has somewhere to go.{" "}
                <Link
                  href="/accounts"
                  className="font-semibold underline underline-offset-4"
                >
                  Add one
                </Link>
                .
              </p>
            ) : (
              <div className="mt-4 space-y-5">
                {(Object.keys(accountGroups) as AccountGroup[]).map((g) => {
                  const items = open.filter(
                    (a) => accountGroupOf(a.type) === g,
                  );
                  if (items.length === 0) return null;
                  return (
                    <div key={g}>
                      <p className="text-ink-3 mb-2 text-[12px] font-semibold">
                        {accountGroups[g].label}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {items.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setAccountId(a.id)}
                            aria-pressed={a.id === accountId}
                            className={cn(
                              "rounded-ctl flex min-w-0 items-center gap-3 border p-2.5 text-left transition-colors",
                              a.id === accountId
                                ? "border-ink bg-ink text-paper"
                                : "border-line-2 hover:border-ink",
                            )}
                          >
                            <InstitutionMark
                              institutionKey={a.institutionKey}
                              name={a.institutionName ?? a.name}
                              className="size-8"
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-semibold">
                                {a.name}
                              </span>
                              <span
                                className={cn(
                                  "block truncate text-[11px]",
                                  a.id === accountId
                                    ? "text-paper/70"
                                    : "text-ink-3",
                                )}
                              >
                                {accountTypeLabels[a.type]}
                                {a.last4 ? ` ··${a.last4}` : ""}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. The file */}
          <div>
            <p className="eyebrow">2 · Drop the statement</p>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (account) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) void upload(file);
              }}
              className={cn(
                "rounded-card mt-4 flex min-h-64 flex-col items-center justify-center border-2 border-dashed px-6 py-8 text-center transition-colors",
                !account
                  ? "border-line-2 text-ink-3"
                  : dragging
                    ? "border-art-cobalt bg-art-cobalt/5"
                    : "border-ink/40",
              )}
            >
              <span
                className={cn(
                  "grid size-14 place-items-center rounded-full",
                  account ? "bg-art-cobalt text-white" : "bg-wash",
                )}
              >
                <Upload
                  className={cn("size-6", uploading && "animate-bounce")}
                />
              </span>
              <p className="font-poster mt-4 text-[22px] font-bold">
                {uploading
                  ? "Uploading…"
                  : account
                    ? `Statement for ${account.name}`
                    : "Pick an account first"}
              </p>
              <p className="text-ink-2 mt-1 max-w-sm text-[13px]">
                {group
                  ? WHAT_IT_READS[group]
                  : "Then drop a PDF or screenshot here."}
              </p>
              <input
                ref={input}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void upload(file);
                }}
              />
              <Button
                className="mt-5"
                disabled={!account}
                loading={uploading}
                onClick={() => input.current?.click()}
              >
                Choose file
              </Button>
              <p className="text-ink-3 mt-3 font-mono text-[11px] tracking-wide">
                PDF · PNG · JPEG · WEBP — UP TO 20 MB
              </p>
            </div>
            {error ? (
              <Notice tone="error" className="mt-3">
                {error.message}{" "}
                {error.jobId ? (
                  <Link
                    href={`/imports/${error.jobId}`}
                    className="font-semibold underline underline-offset-4"
                  >
                    Open it
                  </Link>
                ) : null}
              </Notice>
            ) : null}
          </div>
        </div>
      </section>

      <Section
        title="Recent imports"
        description="Open one to check what was read before it's saved."
      >
        {(jobs.data ?? []).length === 0 ? (
          <p className="text-ink-2 text-sm">Nothing uploaded yet.</p>
        ) : (
          <ul className="-mx-2">
            {jobs.data!.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/imports/${j.id}`}
                  className="hover:bg-wash flex items-center gap-3.5 rounded-[8px] px-2 py-3 transition-colors"
                >
                  <span className="bg-wash grid size-10 shrink-0 place-items-center rounded-[8px]">
                    {j.mimeType.startsWith("image/") ? (
                      <FileImage className="size-5" strokeWidth={1.6} />
                    ) : (
                      <FileText className="size-5" strokeWidth={1.6} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">
                      {j.fileName}
                    </span>
                    <span className="text-ink-3 block truncate text-[12px]">
                      {[
                        j.accountName ?? "Removed account",
                        j.periodStart && j.periodEnd
                          ? `${formatDate(j.periodStart)} – ${formatDate(j.periodEnd)}`
                          : null,
                        formatDateTime(j.createdAt),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <ImportStatus status={j.status} stale={j.stale} />
                    {j.status === "needs_review" ? (
                      <span className="text-ink-3 text-[11px]">
                        {j.accepted} of {j.rows} selected
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
