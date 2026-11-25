"use client";

import { useT, categoryLabel } from "~/i18n/client";
import { Notice, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { formatMoney } from "~/lib/format";
import type { PreviewResult } from "./extraction-playground-types";

export function ResultDetail({
  result,
  categoryName,
}: {
  result: PreviewResult;
  categoryName: Map<string, string>;
}) {
  const messages = useT();
  const out = result.output;
  return (
    <div className="animate-rise space-y-8">
      <dl className="border-ink bg-line grid grid-cols-2 gap-px border-t-2 sm:grid-cols-4">
        {[
          [
            messages.admin.playground.document,
            out.documentType.replace(/_/g, " "),
          ],
          [messages.admin.playground.institution, out.institutionName ?? "—"],
          [
            messages.admin.playground.period,
            out.periodStart || out.periodEnd
              ? `${out.periodStart ?? "?"} → ${out.periodEnd ?? "?"}`
              : "—",
          ],
          [
            messages.admin.playground.account,
            [out.accountName, out.accountLast4 && `••${out.accountLast4}`]
              .filter(Boolean)
              .join(" ") || "—",
          ],
          [messages.admin.playground.model, result.model],
          [
            messages.admin.playground.took,
            messages.admin.playground.duration(
              (result.durationMs / 1000).toFixed(1),
            ),
          ],
          [
            messages.admin.playground.tokens,
            messages.admin.playground.tokenUsage(
              result.usage.inputTokens ?? "?",
              result.usage.outputTokens ?? "?",
            ),
          ],
          [
            messages.admin.playground.input,
            result.usedTextLayer
              ? messages.admin.playground.pdfText(result.pageCount)
              : messages.admin.playground.imageScannedFile,
          ],
        ].map(([label, value]) => (
          <div key={label} className="bg-canvas px-4 py-3">
            <dt className="text-ink-3 text-[12px] font-semibold">{label}</dt>
            <dd className="mt-0.5 text-sm font-semibold break-words capitalize first-letter:uppercase">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {out.warnings.length ? (
        <Notice tone="warn">
          <ul className="list-disc space-y-1 pl-4">
            {out.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {out.openingBalance !== null && out.closingBalance !== null ? (
        <BalanceCheck
          opening={out.openingBalance}
          closing={out.closingBalance}
          sum={out.transactions.reduce((acc, t) => acc + t.amount, 0)}
          currency={out.currency}
        />
      ) : null}

      {out.transactions.length ? (
        <div>
          <h3 className="mb-2 font-bold">
            Transactions{" "}
            <span className="figures text-ink-3 font-medium">
              {out.transactions.length}
            </span>
          </h3>
          <Table>
            <thead>
              <tr>
                <Th>{messages.common.fields.date}</Th>
                <Th>{messages.admin.playground.description}</Th>
                <Th>{messages.admin.playground.merchant}</Th>
                <Th>{messages.admin.playground.category}</Th>
                <Th className="text-right">{messages.common.fields.amount}</Th>
              </tr>
            </thead>
            <tbody>
              {out.transactions.map((t, i) => (
                <Tr key={i}>
                  <Td className="figures text-ink-2 whitespace-nowrap">
                    {t.date}
                  </Td>
                  <Td className="max-w-80 truncate" title={t.description}>
                    {t.description}
                  </Td>
                  <Td>{t.merchant ?? "—"}</Td>
                  <Td>
                    {t.isTransfer ? (
                      <Tag tone="outline" className="mr-1">
                        {messages.admin.playground.transfer}
                      </Tag>
                    ) : null}
                    {t.categoryKey ? (
                      categoryLabel(
                        messages,
                        categoryName.get(t.categoryKey) ?? t.categoryKey,
                      )
                    ) : (
                      <span className="text-ink-3">
                        {messages.admin.playground.uncategorised}
                      </span>
                    )}
                  </Td>
                  <Td
                    className={`figures text-right font-semibold whitespace-nowrap ${t.amount < 0 ? "text-ink" : "text-gain"}`}
                  >
                    {formatMoney(t.amount, t.currency, { signed: true })}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}

      {out.positions.length ? (
        <div>
          <h3 className="mb-2 font-bold">
            Holdings{" "}
            <span className="figures text-ink-3 font-medium">
              {out.positions.length}
            </span>
          </h3>
          <Table>
            <thead>
              <tr>
                <Th>{messages.admin.playground.symbol}</Th>
                <Th>{messages.common.fields.name}</Th>
                <Th>{messages.admin.playground.exchange}</Th>
                <Th className="text-right">
                  {messages.admin.playground.quantity}
                </Th>
                <Th className="text-right">
                  {messages.admin.playground.avgCost}
                </Th>
                <Th className="text-right">
                  {messages.admin.playground.value}
                </Th>
              </tr>
            </thead>
            <tbody>
              {out.positions.map((p, i) => (
                <Tr key={i}>
                  <Td className="font-bold">{p.symbol}</Td>
                  <Td className="text-ink-2">{p.name ?? "—"}</Td>
                  <Td className="text-ink-2">{p.exchange ?? "—"}</Td>
                  <Td className="figures text-right">{p.quantity}</Td>
                  <Td className="figures text-right">
                    {p.averageCost !== null
                      ? formatMoney(p.averageCost, p.currency)
                      : "—"}
                  </Td>
                  <Td className="figures text-right font-semibold">
                    {p.marketValue !== null
                      ? formatMoney(p.marketValue, p.currency)
                      : "—"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}

      <details className="border-line border">
        <summary className="hover:bg-wash cursor-pointer px-4 py-3 text-sm font-semibold">
          {messages.admin.playground.rawJson}
        </summary>
        <pre className="border-line bg-sunken text-ink-2 max-h-[32rem] overflow-auto border-t p-4 text-[12px] leading-relaxed">
          {JSON.stringify(out, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function BalanceCheck({
  opening,
  closing,
  sum,
  currency,
}: {
  opening: number;
  closing: number;
  sum: number;
  currency: string;
}) {
  const t = useT();
  const expected = opening + sum;
  const diff = Math.round((closing - expected) * 100) / 100;
  const ok = Math.abs(diff) < 0.01;
  return (
    <Notice tone={ok ? "success" : "warn"}>
      <strong>
        {ok
          ? t.admin.playground.balancesReconcile
          : t.admin.playground.balancesDoNotReconcile}
      </strong>{" "}
      {t.admin.playground.balanceEquation(
        formatMoney(opening, currency),
        formatMoney(sum, currency, { signed: true }),
        formatMoney(expected, currency),
        formatMoney(closing, currency),
        ok,
        formatMoney(diff, currency, { signed: true }),
      )}
    </Notice>
  );
}
