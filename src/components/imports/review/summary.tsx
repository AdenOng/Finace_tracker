"use client";

import Decimal from "decimal.js";
import { AlertTriangle } from "lucide-react";

import { Tag } from "~/components/ui/panel";
import { useLocale, useT } from "~/i18n/client";
import { formatDate } from "~/lib/format";
import type { checkImportBalance } from "~/lib/import-balance-check";

import { documentLabels, money, shortDate, type Job } from "./types";

export function Summary({
  job,
  check,
}: {
  job: Job;
  check: ReturnType<typeof checkImportBalance>;
}) {
  const t = useT();
  const locale = useLocale();
  const s = job.summary;
  if (!s) return null;
  const currency = check.currency;
  const facts = [
    {
      label: t.imports.importReview.document,
      value:
        documentLabels(t)[s.documentType] ?? t.imports.importReview.document,
    },
    {
      label: t.imports.importReview.period,
      value:
        s.periodStart && s.periodEnd
          ? s.periodStart === s.periodEnd
            ? formatDate(s.periodEnd, locale)
            : `${s.periodStart.slice(0, 4) === s.periodEnd.slice(0, 4) ? shortDate(s.periodStart, locale) : formatDate(s.periodStart, locale)} – ${formatDate(s.periodEnd, locale)}`
          : s.periodEnd
            ? formatDate(s.periodEnd, locale)
            : t.imports.importReview.notShown,
    },
    ...(check.openingBalance !== null
      ? [
          {
            label: t.imports.importReview.opening,
            value: money(check.openingBalance, currency),
          },
        ]
      : []),
    ...(check.closingBalance !== null
      ? [
          {
            label: t.imports.importReview.closing,
            value: money(check.closingBalance, currency),
          },
        ]
      : []),
  ];
  return (
    <section className="card overflow-hidden">
      <div className="ink-strip h-1.5" />
      <div className="p-5 sm:p-8">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="eyebrow">{f.label}</dt>
              <dd className="figures mt-1 text-[15px] font-semibold">
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 space-y-3 text-[13px]">
          {check.provisional ? (
            <Tag tone="warn">
              {t.imports.importReview.provisionalDecidePossibleDuplicates}
            </Tag>
          ) : null}
          {!check.complete ? (
            <p className="text-ink-2">
              {t.imports.summary.unverified(
                check.openingBalance !== null && check.closingBalance !== null,
              )}
            </p>
          ) : null}
          {check.currencies.map((c) =>
            c.extraction.difference === null ? (
              c.lineCount > 0 ? (
                <p key={c.currency} className="text-ink-2">
                  {t.imports.summary.excluded(c.lineCount, c.currency)}
                </p>
              ) : null
            ) : (
              <div key={c.currency} className="space-y-1">
                <p className="font-semibold">
                  {t.imports.summary.balanceCheck(c.currency)}
                </p>
                {(
                  [
                    [t.imports.importReview.extractionBalances, c.extraction],
                    [t.imports.importReview.savedRecordsWillBalance, c.saved],
                  ] as const
                ).map(([label, result]) => (
                  <p
                    key={label}
                    className={result.balances ? "text-gain" : "text-warn"}
                  >
                    {t.imports.summary.result(
                      label,
                      result.balances,
                      money(new Decimal(result.difference!).abs(), c.currency),
                      new Decimal(result.difference!).isPositive(),
                    )}
                  </p>
                ))}
                {c.skippedRows.length > 0 ? (
                  <div className="text-ink-2">
                    <p>
                      {t.imports.summary.skipped(
                        c.skippedExplainDifference,
                        money(c.skippedTotal, c.currency, true),
                      )}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {c.skippedRows.map((r) => (
                        <li key={r.id}>
                          {r.postedDate
                            ? `${shortDate(r.postedDate, locale)} · `
                            : ""}
                          {r.description} · {money(r.amount, c.currency, true)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ),
          )}
          {s.balanceAcknowledgment ? (
            <Tag tone="warn">
              {t.imports.importReview.savedWithAnAcknowledgedBalance}
            </Tag>
          ) : null}
        </div>
        {s.warnings.length > 0 ? (
          <ul className="mt-4 space-y-1">
            {s.warnings.map((w) => (
              <li key={w} className="text-warn flex gap-2 text-[13px]">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        ) : null}
        {job.model ? (
          <p className="text-ink-3 mt-4 font-mono text-[11px] tracking-wide">
            {t.imports.summary.readBy(job.model.toUpperCase())}
          </p>
        ) : null}
      </div>
    </section>
  );
}
