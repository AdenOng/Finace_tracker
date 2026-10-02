"use client";

import { FileText, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Field, Input, Select } from "~/components/ui/field";
import { Notice, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { formatMoney } from "~/lib/format";
import type { StatementExtraction } from "~/server/modules/extraction/schemas";
import { api } from "~/trpc/react";

type PreviewResult = {
  output: StatementExtraction;
  model: string;
  usage: { inputTokens?: number; outputTokens?: number };
  durationMs: number;
  usedTextLayer: boolean;
  pageCount: number | null;
};

function useElapsed(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    setSeconds(0);
    const started = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      500,
    );
    return () => clearInterval(timer);
  }, [running]);
  return seconds;
}

export function ExtractionPlayground() {
  const [providers] = api.admin.ai.list.useSuspenseQuery();
  const institutions = api.catalog.institutions.useQuery();
  const categories = api.catalog.categories.useQuery();
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const elapsed = useElapsed(running);
  const fileInput = useRef<HTMLInputElement>(null);

  const categoryName = new Map(categories.data?.map((c) => [c.key, c.name]));

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const form = new FormData(event.currentTarget);
    form.set("file", file);
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/admin/extract-preview", {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as PreviewResult | { error: string };
      if (!response.ok || "error" in body) {
        setError("error" in body ? body.error : "Extraction failed");
      } else {
        setResult(body);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setRunning(false);
    }
  }

  const out = result?.output;

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files[0];
            if (dropped) setFile(dropped);
          }}
          className="border-ink-3 hover:border-forest hover:bg-wash flex min-h-44 flex-col items-center justify-center gap-3 border-2 border-dashed px-6 text-center transition-colors"
        >
          {file ? (
            <>
              <FileText className="text-forest size-8" />
              <span className="text-sm font-semibold break-all">
                {file.name}
              </span>
              <span className="text-ink-3 text-[13px]">
                {(file.size / 1024).toFixed(0)} KB · click to change
              </span>
            </>
          ) : (
            <>
              <Upload className="text-ink-3 size-8" />
              <span className="text-sm font-semibold">
                Drop a statement or screenshot
              </span>
              <span className="text-ink-3 text-[13px]">
                PDF, PNG, JPEG or WebP, up to 20 MB. Nothing is saved.
              </span>
            </>
          )}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <div className="space-y-4">
          <Field label="Provider" htmlFor="pg-provider">
            <Select
              id="pg-provider"
              name="providerId"
              defaultValue={providers.find((p) => p.isDefault)?.id ?? ""}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? " (default)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Model override"
            htmlFor="pg-model"
            hint="Leave empty to use the provider's model."
          >
            <Input
              id="pg-model"
              name="model"
              placeholder="e.g. opencode-go/deepseek-flash-4.1"
            />
          </Field>
          <Field
            label="Institution"
            htmlFor="pg-inst"
            hint="Adds that institution's notes to the prompt."
          >
            <Select id="pg-inst" name="institutionId" defaultValue="">
              <option value="">Not specified</option>
              {institutions.data?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            type="submit"
            disabled={!file}
            loading={running}
            className="w-full"
          >
            {running ? `Reading… ${elapsed}s` : "Extract"}
          </Button>
        </div>
      </form>

      {error ? (
        <Notice tone="error">
          <pre className="font-sans text-sm whitespace-pre-wrap">{error}</pre>
        </Notice>
      ) : null}

      {result && out ? (
        <div className="animate-rise space-y-8">
          <dl className="border-ink bg-line grid grid-cols-2 gap-px border-t-2 sm:grid-cols-4">
            {[
              ["Document", out.documentType.replace(/_/g, " ")],
              ["Institution", out.institutionName ?? "—"],
              [
                "Period",
                out.periodStart || out.periodEnd
                  ? `${out.periodStart ?? "?"} → ${out.periodEnd ?? "?"}`
                  : "—",
              ],
              [
                "Account",
                [out.accountName, out.accountLast4 && `••${out.accountLast4}`]
                  .filter(Boolean)
                  .join(" ") || "—",
              ],
              ["Model", result.model],
              ["Took", `${(result.durationMs / 1000).toFixed(1)}s`],
              [
                "Tokens",
                `${result.usage.inputTokens ?? "?"} in / ${result.usage.outputTokens ?? "?"} out`,
              ],
              [
                "Input",
                result.usedTextLayer
                  ? `PDF text, ${result.pageCount} pages`
                  : "Image / scanned file",
              ],
            ].map(([label, value]) => (
              <div key={label} className="bg-canvas px-4 py-3">
                <dt className="text-ink-3 text-[12px] font-semibold">
                  {label}
                </dt>
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
                    <Th>Date</Th>
                    <Th>Description</Th>
                    <Th>Merchant</Th>
                    <Th>Category</Th>
                    <Th className="text-right">Amount</Th>
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
                            Transfer
                          </Tag>
                        ) : null}
                        {t.categoryKey ? (
                          (categoryName.get(t.categoryKey) ?? t.categoryKey)
                        ) : (
                          <span className="text-ink-3">Uncategorised</span>
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
                    <Th>Symbol</Th>
                    <Th>Name</Th>
                    <Th>Exchange</Th>
                    <Th className="text-right">Quantity</Th>
                    <Th className="text-right">Avg cost</Th>
                    <Th className="text-right">Value</Th>
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
              Raw JSON
            </summary>
            <pre className="border-line bg-forest-3 text-mint-soft max-h-[32rem] overflow-auto border-t p-4 text-[12px] leading-relaxed">
              {JSON.stringify(out, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
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
  const expected = opening + sum;
  const diff = Math.round((closing - expected) * 100) / 100;
  const ok = Math.abs(diff) < 0.01;
  return (
    <Notice tone={ok ? "success" : "warn"}>
      <strong>
        {ok ? "Balances reconcile." : "Balances do not reconcile."}
      </strong>{" "}
      Opening {formatMoney(opening, currency)} + transactions{" "}
      {formatMoney(sum, currency, { signed: true })} ={" "}
      {formatMoney(expected, currency)}; statement closing is{" "}
      {formatMoney(closing, currency)}
      {ok
        ? "."
        : ` (off by ${formatMoney(diff, currency, { signed: true })}). Some rows may be missing or misread.`}
    </Notice>
  );
}
