"use client";

import { useT, categoryLabel } from "~/i18n/client";
import type { Messages } from "~/i18n/messages";

import { FileText, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Checkbox, Field, Input, Select } from "~/components/ui/field";
import { Notice, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { cn } from "~/lib/cn";
import { formatBytes, formatMoney } from "~/lib/format";
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

type Run =
  | { state: "running" }
  | { state: "done"; result: PreviewResult }
  | { state: "error"; error: string };

const ACCEPTED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 20 * 1024 * 1024;

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

function checkFile(file: File, t: Messages) {
  if (!ACCEPTED.includes(file.type))
    return t.admin.playground.useAPdfPngJpegOrWebpFile;
  if (file.size > MAX_BYTES)
    return t.admin.playground.fileTooLarge(formatBytes(file.size));
  return null;
}

/** Same line on two statements read by different models: date and amount to the cent. */
const lineKey = (t: { date: string; amount: number }) =>
  `${t.date}|${t.amount.toFixed(2)}`;

/**
 * For each provider, the share of its transactions whose category matches the most common answer
 * for that line across providers. Lines only one provider found are left out.
 */
function categoryAgreement(results: Map<string, PreviewResult>) {
  const votes = new Map<string, Map<string, number>>();
  for (const result of results.values()) {
    for (const t of result.output.transactions) {
      const key = lineKey(t);
      const tally = votes.get(key) ?? new Map<string, number>();
      const category = t.categoryKey ?? "";
      tally.set(category, (tally.get(category) ?? 0) + 1);
      votes.set(key, tally);
    }
  }
  const agreement = new Map<string, { shared: number; agree: number }>();
  for (const [id, result] of results) {
    let shared = 0;
    let agree = 0;
    for (const t of result.output.transactions) {
      const tally = votes.get(lineKey(t))!;
      const total = [...tally.values()].reduce((a, b) => a + b, 0);
      if (total < 2) continue;
      shared++;
      const top = Math.max(...tally.values());
      if ((tally.get(t.categoryKey ?? "") ?? 0) === top) agree++;
    }
    agreement.set(id, { shared, agree });
  }
  return agreement;
}

function reconciles(out: StatementExtraction) {
  if (out.openingBalance === null || out.closingBalance === null) return null;
  const sum = out.transactions.reduce((acc, t) => acc + t.amount, 0);
  return Math.abs(out.closingBalance - (out.openingBalance + sum)) < 0.01;
}

export function ExtractionPlayground() {
  const t = useT();
  const [providers] = api.admin.ai.list.useSuspenseQuery();
  const institutions = api.catalog.institutions.useQuery();
  const categories = api.catalog.categories.useQuery();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<string[]>(() =>
    providers.filter((p) => p.isDefault).map((p) => p.id),
  );
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [viewing, setViewing] = useState<string | null>(null);
  const running = Object.values(runs).some((r) => r.state === "running");
  const elapsed = useElapsed(running);
  const fileInput = useRef<HTMLInputElement>(null);

  const categoryName = new Map(categories.data?.map((c) => [c.key, c.name]));
  const names = new Map(providers.map((p) => [p.id, p.name]));

  function pick(next: File | null | undefined) {
    if (!next) return;
    const problem = checkFile(next, t);
    setFileError(problem);
    setFile(problem ? null : next);
  }

  async function runOne(providerId: string, form: FormData) {
    const body = new FormData();
    for (const [key, value] of form) body.set(key, value);
    body.set("file", file!);
    body.set("providerId", providerId);
    try {
      const response = await fetch("/api/admin/extract-preview", {
        method: "POST",
        body,
      });
      const data = (await response.json()) as PreviewResult | { error: string };
      setRuns((r) => ({
        ...r,
        [providerId]:
          !response.ok || "error" in data
            ? {
                state: "error",
                error:
                  "error" in data
                    ? data.error
                    : t.admin.playground.extractionFailed,
              }
            : { state: "done", result: data },
      }));
    } catch (e) {
      setRuns((r) => ({
        ...r,
        [providerId]: {
          state: "error",
          error:
            e instanceof Error ? e.message : t.admin.playground.requestFailed,
        },
      }));
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || selected.length === 0) return;
    const form = new FormData(event.currentTarget);
    // A model override only makes sense for a single provider.
    if (selected.length > 1) form.delete("model");
    setRuns(
      Object.fromEntries(selected.map((id) => [id, { state: "running" }])),
    );
    setViewing(selected[0]!);
    void Promise.all(selected.map((id) => runOne(id, form)));
  }

  const done = new Map(
    Object.entries(runs).flatMap(([id, run]) =>
      run.state === "done" ? [[id, run.result] as const] : [],
    ),
  );
  const agreement = done.size > 1 ? categoryAgreement(done) : null;
  const viewed = viewing ? runs[viewing] : undefined;

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files[0]);
            }}
            className={cn(
              "hover:border-brand hover:bg-wash flex min-h-44 w-full flex-col items-center justify-center gap-3 border-2 border-dashed px-6 text-center transition-colors",
              dragging ? "border-brand bg-brand-soft" : "border-ink-3",
            )}
          >
            {file ? (
              <>
                <FileText className="text-brand size-8" />
                <span className="text-sm font-semibold break-all">
                  {file.name}
                </span>
                <span className="text-ink-3 text-[13px]">
                  {t.admin.playground.changeFile(formatBytes(file.size))}
                </span>
              </>
            ) : (
              <>
                <Upload
                  className={cn(
                    "size-8",
                    dragging ? "text-brand" : "text-ink-3",
                  )}
                />
                <span className="text-sm font-semibold">
                  {dragging
                    ? t.admin.playground.dropToUseThisFile
                    : t.admin.playground.dropAStatementOrScreenshot}
                </span>
                <span className="text-ink-3 text-[13px]">
                  {t.admin.playground.pdfPngJpegOrWebpUpTo20MbNothingIsSaved}
                </span>
              </>
            )}
          </button>
          {fileError ? (
            <p className="text-loss mt-2 text-[13px]">{fileError}</p>
          ) : null}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />

        <div className="space-y-4">
          <fieldset>
            <legend className="text-ink-2 mb-2 text-[13px] font-medium">
              {t.admin.playground.providers}
            </legend>
            <div className="space-y-2">
              {providers.map((p) => (
                <Checkbox
                  key={p.id}
                  label={t.admin.playground.providerOption(p.name, p.isDefault)}
                  description={
                    p.isEnabled
                      ? t.admin.playground.providerModel(
                          p.defaultModel,
                          p.supportsVision,
                        )
                      : t.admin.playground.disabledEnableItToTryItHere
                  }
                  disabled={!p.isEnabled}
                  checked={selected.includes(p.id)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked
                        ? [...s, p.id]
                        : s.filter((id) => id !== p.id),
                    )
                  }
                />
              ))}
            </div>
          </fieldset>
          {selected.length <= 1 ? (
            <Field
              label={t.admin.playground.modelOverride}
              htmlFor="pg-model"
              hint={t.admin.playground.leaveEmptyToUseTheProviderSModel}
            >
              <Input
                id="pg-model"
                name="model"
                placeholder={t.admin.playground.eGOpencodeGoDeepseekFlash41}
              />
            </Field>
          ) : null}
          <Field
            label={t.admin.playground.institution}
            htmlFor="pg-inst"
            hint={t.admin.playground.addsThatInstitutionSNotesToThePrompt}
          >
            <Select id="pg-inst" name="institutionId" defaultValue="">
              <option value="">{t.admin.playground.notSpecified}</option>
              {institutions.data?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            type="submit"
            disabled={!file || selected.length === 0}
            loading={running}
            className="w-full"
          >
            {running
              ? t.admin.playground.readingElapsed(elapsed)
              : selected.length > 1
                ? t.admin.playground.compareProviders(selected.length)
                : t.admin.playground.extract}
          </Button>
        </div>
      </form>

      {Object.keys(runs).length > 1 ? (
        <div className="animate-rise">
          <h3 className="mb-2 font-bold">{t.admin.playground.comparison}</h3>
          <Table>
            <thead>
              <tr>
                <Th>
                  <span className="sr-only">{t.admin.playground.measure}</span>
                </Th>
                {Object.keys(runs).map((id) => (
                  <Th key={id}>{names.get(id)}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  [
                    t.admin.playground.result,
                    (run: Run) =>
                      run.state === "running" ? (
                        <span className="text-ink-3">
                          {t.admin.playground.reading}
                        </span>
                      ) : run.state === "error" ? (
                        <span className="text-loss">
                          {t.admin.playground.failed}
                        </span>
                      ) : (
                        <span className="text-gain">
                          {t.common.actions.done}
                        </span>
                      ),
                  ],
                  [
                    t.admin.playground.took,
                    (run: Run) =>
                      run.state === "done"
                        ? t.admin.playground.duration(
                            (run.result.durationMs / 1000).toFixed(1),
                          )
                        : "—",
                  ],
                  [
                    t.admin.playground.tokens,
                    (run: Run) =>
                      run.state === "done"
                        ? t.admin.playground.tokenUsage(
                            run.result.usage.inputTokens ?? "?",
                            run.result.usage.outputTokens ?? "?",
                          )
                        : "—",
                  ],
                  [
                    t.admin.playground.transactions,
                    (run: Run) =>
                      run.state === "done"
                        ? run.result.output.transactions.length
                        : "—",
                  ],
                  [
                    t.admin.playground.holdings,
                    (run: Run) =>
                      run.state === "done"
                        ? run.result.output.positions.length
                        : "—",
                  ],
                  [
                    t.admin.playground.balancesReconcile,
                    (run: Run) => {
                      if (run.state !== "done") return "—";
                      const ok = reconciles(run.result.output);
                      return ok === null ? (
                        <span className="text-ink-3">
                          {t.admin.playground.noBalances}
                        </span>
                      ) : ok ? (
                        <span className="text-gain">
                          {t.admin.playground.yes}
                        </span>
                      ) : (
                        <span className="text-warn">
                          {t.admin.playground.no}
                        </span>
                      );
                    },
                  ],
                  [
                    t.admin.playground.categoryAgreement,
                    (run: Run, id: string) => {
                      const a = agreement?.get(id);
                      if (run.state !== "done" || !a) return "—";
                      return a.shared
                        ? t.admin.playground.agreement(
                            Math.round((a.agree / a.shared) * 100),
                            a.shared,
                          )
                        : t.admin.playground.noSharedLines;
                    },
                  ],
                  [
                    t.admin.playground.warnings,
                    (run: Run) =>
                      run.state === "done"
                        ? run.result.output.warnings.length
                        : "—",
                  ],
                ] as [string, (run: Run, id: string) => React.ReactNode][]
              ).map(([label, cell]) => (
                <Tr key={label}>
                  <Td className="text-ink-2 font-semibold whitespace-nowrap">
                    {label}
                  </Td>
                  {Object.entries(runs).map(([id, run]) => (
                    <Td key={id} className="figures">
                      {cell(run, id)}
                    </Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </Table>
          <p className="text-ink-3 mt-2 text-[13px]">
            {
              t.admin.playground
                .categoryAgreementComparesLinesFoundByMoreThanOneProviderSameDateAndAmountAgainstTheMostCommonCategoryForEach
            }
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-ink-2 text-[13px] font-semibold">
              {t.admin.playground.detailsFor}
            </span>
            {Object.keys(runs).map((id) => (
              <Button
                key={id}
                size="sm"
                variant={viewing === id ? "inverse" : "secondary"}
                onClick={() => setViewing(id)}
              >
                {names.get(id)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {viewed?.state === "error" ? (
        <Notice tone="error">
          <pre className="font-sans text-sm whitespace-pre-wrap">
            {viewed.error}
          </pre>
        </Notice>
      ) : null}
      {viewed?.state === "done" ? (
        <ResultDetail result={viewed.result} categoryName={categoryName} />
      ) : null}
    </div>
  );
}

function ResultDetail({
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
