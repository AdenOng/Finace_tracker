import { SensitiveValue } from "../components/AmountPrivacy";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { inferRouterOutputs } from "@trpc/server";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import type { AppRouter } from "../../../src/server/api/root";
import { api } from "../api/client";
import { useFinfolio } from "../auth/Provider";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Notice,
  Page,
  Section,
  Segmented,
  Status,
  styles,
} from "../components/ui";
import { ListPage } from "../components/ListPage";
import { Select } from "../components/Select";
import { DateField, validDate } from "../components/DateField";
import { money, normalizeDecimal } from "../utils/money";

/** "-12,50" and "1,234.50" as typed on a phone, as a plain signed decimal. */
const signedDecimal = (input: string) => {
  const value = input.trim();
  return value.startsWith("-")
    ? "-" + normalizeDecimal(value.slice(1))
    : normalizeDecimal(value);
};
import { reading, STATEMENT_TYPES, statementType } from "../utils/imports";
import { today } from "../utils/server";

export type MoreStack = {
  MoreHome: undefined;
  Imports: undefined;
  ImportReview: { id: string };
};
type Job = inferRouterOutputs<AppRouter>["imports"]["get"];
type Row = Job["rows"][number];

export function Imports({
  navigation,
}: NativeStackScreenProps<MoreStack, "Imports">) {
  const { origin, auth, expireSession } = useFinfolio();
  const accounts = api.accounts.list.useQuery();
  const jobs = api.imports.list.useInfiniteQuery({}, {
    getNextPageParam: (last) => {
      const job = last.at(-1);
      return last.length === 100 && job
        ? { id: job.id, createdAt: job.cursorCreatedAt }
        : undefined;
    },
    refetchInterval: (q) =>
      q.state.data?.pages.some((page) => page.some(reading)) ? 2500 : false,
  });
  const rows = jobs.data?.pages.flat() ?? [];
  const availability = api.imports.availability.useQuery(undefined, {
    staleTime: 30_000,
    retry: false,
  });
  const [accountId, setAccount] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = useRef<XMLHttpRequest | null>(null);
  useEffect(
    () => () => {
      upload.current?.abort();
    },
    [],
  );

  async function choose() {
    setError("");
    setBusy(true);
    let file: File | undefined;
    try {
      const selected = await DocumentPicker.getDocumentAsync({
        type: STATEMENT_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (selected.canceled) return;
      const asset = selected.assets[0]!;
      file = new File(asset.uri);
      const mime = statementType(asset.name, asset.mimeType, file.size);
      const cookie = await auth.getCookie();
      const form = new FormData();
      form.append("accountId", accountId);
      form.append("file", {
        uri: asset.uri,
        name: asset.name,
        type: mime,
      } as unknown as Blob);
      const interrupted = new Error(
        "Upload was interrupted. Refresh Imports before retrying; the server may have received the file.",
      );
      let dropped = false;
      const send = () =>
        new Promise<string>((resolve, reject) => {
          dropped = false;
          const xhr = new XMLHttpRequest();
          upload.current = xhr;
          xhr.open("POST", origin + "/api/imports");
          xhr.withCredentials = false;
          xhr.setRequestHeader("Cookie", cookie);
          xhr.timeout = 120_000;
          xhr.upload.onprogress = (e) =>
            setProgress(
              e.lengthComputable
                ? Math.round((e.loaded / e.total) * 100)
                : null,
            );
          xhr.onerror = () => {
            dropped = true;
            reject(interrupted);
          };
          xhr.ontimeout = () => reject(interrupted);
          xhr.onabort = () =>
            reject(
              new Error(
                "Upload cancelled. Refresh Imports to check whether the server received the file.",
              ),
            );
          xhr.onload = () => {
            if (xhr.status === 401) {
              expireSession();
              reject(
                new Error(
                  "Your session ended. Sign in again before uploading.",
                ),
              );
              return;
            }
            try {
              const result = JSON.parse(xhr.responseText) as {
                jobId?: string;
                error?: string;
              };
              if ((xhr.status === 202 || xhr.status === 409) && result.jobId)
                resolve(result.jobId);
              else
                reject(
                  new Error(
                    result.error ??
                      "Upload failed. Refresh Imports before trying again.",
                  ),
                );
            } catch {
              reject(
                new Error(
                  "The server returned an unexpected upload response. Refresh Imports before retrying.",
                ),
              );
            }
          };
          xhr.send(form);
        });
      // Android cuts a backgrounded app's connections while the file picker is open, so the
      // first request can go out on a dead socket. The server answers a re-sent file with the
      // original job (409), so one retry after a dropped connection cannot import it twice.
      const jobId = await send().catch(async (e: unknown) => {
        if (!dropped) throw e;
        await new Promise((r) => setTimeout(r, 400));
        return send();
      });
      void jobs.refetch();
      navigation.navigate("ImportReview", { id: jobId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      upload.current = null;
      setBusy(false);
      setProgress(null);
      try {
        if (file?.exists) file.delete();
      } catch {
        /* OS cache cleanup remains available. */
      }
    }
  }
  return (
    <ListPage
      data={rows}
      refreshing={jobs.isRefetching}
      refresh={() => {
        void jobs.refetch();
        void availability.refetch();
      }}
      header={
        <View style={{ gap: 16 }}>
          <Button
            title="More"
            variant="ghost"
            icon="arrow-left"
            onPress={() => navigation.goBack()}
          />
          <Text accessibilityRole="header" style={styles.title}>
            Imports
          </Text>
          <Text style={styles.subtitle}>
            Upload a statement, check what was read, then choose what to save.
          </Text>
          <Section
            title="Import statement"
            description="PDF, PNG, JPEG or WebP · up to 20 MB"
          >
            <Select
              label="Import account"
              value={accountId}
              onChange={setAccount}
              options={(accounts.data ?? [])
                .filter((a) => !a.archivedAt)
                .map((a) => ({
                  value: a.id,
                  label: a.name + " · " + a.currency,
                }))}
            />
            <Status
              pending={accounts.isPending}
              error={accounts.error}
              retry={() => void accounts.refetch()}
            />
            <Status
              pending={availability.isPending}
              error={availability.error}
              retry={() => void availability.refetch()}
            />
            {availability.data && (
              <Notice tone={availability.data.available ? "info" : "warn"}>
                {availability.data.message}
              </Notice>
            )}
            <Button
              title="Check AI connection"
              variant="ghost"
              disabled={availability.isFetching}
              onPress={() => void availability.refetch()}
            />
            <Button
              title={
                busy
                  ? progress === null
                    ? "Preparing upload…"
                    : `Uploading ${progress}%…`
                  : "Choose statement"
              }
              icon="upload"
              disabled={
                busy ||
                !accountId ||
                !!accounts.error ||
                availability.data?.available !== true
              }
              onPress={() => void choose()}
            />
            {busy && (
              <Button
                title="Cancel upload"
                variant="ghost"
                onPress={() => upload.current?.abort()}
              />
            )}
            {accounts.data?.length === 0 && (
              <Notice>
                Add an account in Finfolio before importing a statement.
              </Notice>
            )}
            {!!error && <Notice tone="error">{error}</Notice>}
          </Section>
          <Text accessibilityRole="header" style={styles.strong}>
            Recent imports
          </Text>
          <Status
            pending={jobs.isPending}
            error={jobs.error}
            retry={() => void jobs.refetch()}
          />
          {!jobs.isPending && !jobs.error && rows.length === 0 && (
            <EmptyState
              title="No imports yet"
              detail="Choose an account and a statement to begin."
              icon="upload"
            />
          )}
        </View>
      }
      renderItem={({ item }) => (
        <Card>
          <Text style={styles.strong}>{item.fileName}</Text>
          <Text style={styles.muted}>
            {item.accountName ?? "Account unavailable"} ·{" "}
            {item.status.replaceAll("_", " ")}
            {item.stale ? " · interrupted" : ""}
          </Text>
          <Button
            title={`Review ${item.fileName}`}
            variant="secondary"
            onPress={() => navigation.navigate("ImportReview", { id: item.id })}
          />
        </Card>
      )}
      footer={
        jobs.hasNextPage ? (
          <Button
            title={jobs.isFetchingNextPage ? "Loading…" : "Load older imports"}
            variant="secondary"
            disabled={jobs.isFetchingNextPage}
            onPress={() => void jobs.fetchNextPage()}
          />
        ) : undefined
      }
    />
  );
}

export function ImportReview({
  route,
  navigation,
}: NativeStackScreenProps<MoreStack, "ImportReview">) {
  const id = route.params.id;
  const { hidden } = useFinfolio();
  const categories = api.catalog.categories.useQuery();
  const utils = api.useUtils();
  const q = api.imports.get.useQuery(
    { id },
    {
      refetchInterval: (q) =>
        q.state.data && reading(q.state.data) ? 2500 : false,
    },
  );
  const [date, setDate] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const update = api.imports.updateRows.useMutation({
    onSuccess: () => utils.imports.get.invalidate({ id }),
  });
  const commit = api.imports.commit.useMutation({
    onSuccess: async () => {
      setSaved(true);
      await Promise.all([
        utils.imports.invalidate(),
        utils.accounts.invalidate(),
        utils.portfolio.invalidate(),
        utils.spending.invalidate(),
      ]);
    },
  });
  const retry = api.imports.retry.useMutation({
    onSuccess: () => utils.imports.get.invalidate({ id }),
  });
  async function act(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not complete this action. Refresh before retrying.",
      );
    }
  }
  const job = q.data;
  if (!job)
    return (
      <Page title="Import review">
        <Button
          title="Imports"
          variant="ghost"
          onPress={() => navigation.goBack()}
        />
        <Status
          pending={q.isPending}
          error={q.error}
          retry={() => void q.refetch()}
        />
      </Page>
    );
  const check = job.balanceCheck;
  const balanceKey = JSON.stringify(check);
  const needsDate = job.rows.some(
    (r) => r.decision === "accept" && r.kind !== "transaction",
  );
  const asOf = date ?? job.summary?.periodEnd ?? (needsDate ? "" : today());
  const unresolved = job.rows.some(
    (r) =>
      r.decision === "pending" ||
      (r.decision === "accept" &&
        r.kind === "transaction" &&
        r.data.signMismatch),
  );
  const busy = update.isPending || commit.isPending || retry.isPending;
  const editable = job.status === "needs_review" && !busy;
  return (
    <ListPage
      data={job.rows}
      refreshing={q.isRefetching}
      refresh={() => void q.refetch()}
      header={
        <View style={{ gap: 16 }}>
          <Button
            title="Imports"
            icon="arrow-left"
            variant="ghost"
            onPress={() => navigation.goBack()}
          />
          <Text accessibilityRole="header" style={styles.title}>
            Review statement
          </Text>
          <Text style={styles.strong}>{job.fileName}</Text>
          <Text style={styles.subtitle}>
            {job.accountName ?? "Account unavailable"} ·{" "}
            {job.status.replaceAll("_", " ")}
          </Text>
          <Status error={q.error} retry={() => void q.refetch()} />
          {reading(job) && (
            <Notice>
              Your statement is being read. You can leave this screen and return
              from Imports.
            </Notice>
          )}
          {(job.status === "failed" || job.stale) && (
            <Card>
              <Notice tone="error">
                {job.error ?? "This read was interrupted."}
              </Notice>
              <Button
                title="Read statement again"
                disabled={busy}
                onPress={() => void act(() => retry.mutateAsync({ jobId: id }))}
              />
            </Card>
          )}
          {job.summary?.warnings.map((warning, i) => (
            <Notice key={i} tone="warn">
              {warning}
            </Notice>
          ))}
          {job.latestHoldingsAsOf && (
            <Text style={styles.muted}>
              Latest account entry: {job.latestHoldingsAsOf}. Earlier statements
              remain historical entries.
            </Text>
          )}
          {check.complete && (
            <Section title="Statement balance check">
              {check.currencies.map((c) => (
                <SensitiveValue
                  key={c.currency}
                  hidden={hidden}
                  render={(hidden) => (
                    <Text style={styles.text}>
                      {c.currency}: opening{" "}
                      {money(c.openingBalance, c.currency, { hidden })} +
                      kept/recorded{" "}
                      {money(c.saved.total, c.currency, { hidden })} = closing{" "}
                      {money(c.closingBalance, c.currency, { hidden })}
                      {c.saved.balances === false ? " · does not balance" : ""}
                    </Text>
                  )}
                />
              ))}
              {check.requiresAcknowledgment && (
                <Notice tone="warn">
                  The statement or kept rows do not balance. Check amounts and
                  skipped rows before saving.
                </Notice>
              )}
            </Section>
          )}
          {job.status === "completed" && !saved && (
            <Notice>
              This import has been saved. Skipped and duplicate rows are
              retained here for reference.
            </Notice>
          )}
          {saved && (
            <Notice>
              Statement saved. Your accounts and spending have been refreshed.
            </Notice>
          )}
          {!!error && <Notice tone="error">{error}</Notice>}
        </View>
      }
      renderItem={({ item }) => (
        <ReviewRow
          key={item.id}
          row={item}
          hidden={hidden}
          editable={editable}
          categories={categories.data ?? []}
          onCategory={(categoryId) =>
            void act(() =>
              update.mutateAsync({
                jobId: id,
                ids: [item.id],
                patch: { categoryId },
              }),
            )
          }
          onDecision={(decision) =>
            void act(() =>
              update.mutateAsync({ jobId: id, ids: [item.id], decision }),
            )
          }
          onAmount={(amount) =>
            void act(() =>
              update.mutateAsync({
                jobId: id,
                ids: [item.id],
                patch: { amount, confirmAmount: true },
              }),
            )
          }
        />
      )}
      footer={
        <View style={{ gap: 16 }}>
          {job.status === "needs_review" && (
            <Card>
              {needsDate && (
                <DateField
                  label="Statement date"
                  value={asOf}
                  onChange={setDate}
                />
              )}
              {needsDate && job.statementDates.includes(asOf) ? (
                <Notice tone="warn">
                  Saving replaces the account entry already recorded for {asOf}.
                  Review the holdings and cash carefully.
                </Notice>
              ) : needsDate && job.latestHoldingsAsOf === asOf ? (
                // A same-day statement sits beside a manual entry and becomes the balance shown.
                <Notice tone="warn">
                  This account already has an entry for {asOf}. Saving makes
                  this statement&apos;s holdings and cash the latest values for
                  that date. The earlier entry is kept and can be edited on the
                  web.
                </Notice>
              ) : null}
              {unresolved && (
                <Notice tone="warn">
                  Choose Keep or Skip for pending rows and confirm flagged
                  amounts before saving.
                </Notice>
              )}
              {check.requiresAcknowledgment && (
                <Button
                  title={
                    acknowledged === balanceKey
                      ? "Balance difference acknowledged"
                      : "Acknowledge balance difference"
                  }
                  variant="secondary"
                  disabled={busy || unresolved || check.provisional}
                  onPress={() =>
                    Alert.alert(
                      "Save an unbalanced statement?",
                      "Confirm that you reviewed the difference and still want to save the kept rows.",
                      [
                        { text: "Cancel" },
                        {
                          text: "Acknowledge",
                          onPress: () => setAcknowledged(balanceKey),
                        },
                      ],
                    )
                  }
                />
              )}
              <Button
                title={
                  commit.isPending
                    ? "Saving statement…"
                    : "Save reviewed statement"
                }
                disabled={
                  busy ||
                  unresolved ||
                  !validDate(asOf) ||
                  !job.accountId ||
                  !!job.accountArchivedAt ||
                  !!q.error ||
                  (check.requiresAcknowledgment && acknowledged !== balanceKey)
                }
                onPress={() =>
                  Alert.alert(
                    "Save reviewed statement?",
                    "Only kept rows will be saved. Duplicate rows already recorded will not be added twice.",
                    [
                      { text: "Cancel" },
                      {
                        text: "Save",
                        onPress: () =>
                          void act(() =>
                            commit.mutateAsync({
                              jobId: id,
                              asOf,
                              acknowledgeBalanceMismatch:
                                acknowledged === balanceKey,
                            }),
                          ),
                      },
                    ],
                  )
                }
              />
            </Card>
          )}
        </View>
      }
    />
  );
}

function ReviewRow({
  row,
  hidden,
  editable,
  onDecision,
  onAmount,
  categories,
  onCategory,
}: {
  row: Row;
  hidden: boolean;
  editable: boolean;
  onDecision: (value: "accept" | "skip") => void;
  onAmount: (value: string) => void;
  categories: { id: string; name: string }[];
  onCategory: (value: string | null) => void;
}) {
  const [amount, setAmount] = useState(
    "amount" in row.data ? row.data.amount : "",
  );
  const [editing, setEditing] = useState(false);
  const d = row.data;
  let description: string;
  let detail: (hidden: boolean) => string;
  switch (row.kind) {
    case "transaction":
      description = row.data.description;
      detail = (hidden) =>
        `${row.data.postedDate} · ${money(row.data.amount, row.data.currency, { hidden, signed: true })}`;
      break;
    case "position":
      description = row.data.name ?? row.data.symbol;
      detail = (hidden) =>
        `${row.data.symbol} · ${hidden ? "••••" : row.data.quantity} units · price ${money(row.data.price, row.data.currency, { hidden })} · cost ${money(row.data.averageCost, row.data.currency, { hidden })}`;
      break;
    case "cash_balance":
      description = `Cash balance${row.data.bucket ? " · " + row.data.bucket : ""}`;
      detail = (hidden) =>
        money(row.data.amount, row.data.currency, { hidden });
      break;
    case "investment_transaction":
      description = row.data.description ?? row.data.type;
      detail = (hidden) =>
        `${row.data.tradeDate} · ${row.data.symbol ?? row.data.type} · ${money(row.data.amount, row.data.currency, { hidden, signed: true })}`;
      break;
  }
  return (
    <Card>
      <Text style={styles.strong}>{description}</Text>
      <SensitiveValue
        hidden={hidden}
        render={(hidden) => <Text style={styles.text}>{detail(hidden)}</Text>}
      />
      {row.kind === "transaction" && (
        <Text style={styles.muted}>
          {categories.find((c) => c.id === row.data.categoryId)?.name ??
            "Uncategorized"}
          {row.data.isTransfer ? " · transfer" : ""}
          {row.data.merchant ? " · " + row.data.merchant : ""}
          {row.data.reference ? " · " + row.data.reference : ""}
        </Text>
      )}
      {row.kind === "position" && (
        <SensitiveValue
          hidden={hidden}
          render={(hidden) => (
            <Text style={styles.muted}>
              {row.data.exchange || "Exchange unspecified"} · value{" "}
              {money(row.data.value, row.data.currency, { hidden })}
            </Text>
          )}
        />
      )}
      {row.kind === "investment_transaction" && (
        <SensitiveValue
          hidden={hidden}
          render={(hidden) => (
            <Text style={styles.muted}>
              Quantity {hidden ? "••••" : (row.data.quantity ?? "—")} · price{" "}
              {money(row.data.price, row.data.currency, { hidden })} · fees{" "}
              {money(row.data.fees, row.data.currency, { hidden })}
              {row.data.settleDate ? " · settles " + row.data.settleDate : ""}
            </Text>
          )}
        />
      )}
      <Text style={styles.muted}>
        {row.removed
          ? "Removed"
          : row.committedRecordId
            ? "Saved"
            : `${row.matchStatus.replaceAll("_", " ")} · ${row.decision === "accept" ? "Keep" : row.decision === "skip" ? "Skip" : "Decision needed"}`}
      </Text>
      {row.kind === "transaction" && row.data.signMismatch && (
        <SensitiveValue
          hidden={hidden}
          render={(hidden) =>
            row.kind === "transaction" ? (
              <Notice tone="warn">
                Printed {row.data.printedDirection ?? "direction"}:{" "}
                {money(row.data.printedAmount, row.data.currency, { hidden })}.
                Suggested amount:{" "}
                {money(row.data.suggestedAmount, row.data.currency, {
                  hidden,
                  signed: true,
                })}
                . Edit or confirm the signed amount.
              </Notice>
            ) : null
          }
        />
      )}
      {editable && !row.committedRecordId && (
        <>
          {row.kind === "transaction" && (
            <Select
              label={`Category for ${description}`}
              value={row.data.categoryId ?? ""}
              onChange={(value) => onCategory(value || null)}
              options={[
                { value: "", label: "Uncategorized" },
                ...categories.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          )}
          <Segmented
            label={`Decision for ${description}`}
            value={row.decision}
            options={[
              { value: "accept", label: "Keep" },
              { value: "skip", label: "Skip" },
            ]}
            onChange={(value) => onDecision(value as "accept" | "skip")}
          />
          {"amount" in d && (
            <Button
              title={
                editing
                  ? "Cancel amount edit"
                  : `Edit amount for ${description}`
              }
              variant="ghost"
              size="sm"
              onPress={() => {
                setAmount("amount" in row.data ? row.data.amount : "");
                setEditing(!editing);
              }}
            />
          )}
          {editing && (
            <>
              <Field
                label="Signed amount"
                value={amount}
                onChangeText={setAmount}
                autoCapitalize="none"
                hint="Negative for money out, positive for money in."
              />
              <Button
                title="Confirm amount"
                disabled={!/^-?\d+(\.\d{1,4})?$/.test(signedDecimal(amount))}
                onPress={() => {
                  onAmount(signedDecimal(amount));
                  setEditing(false);
                }}
              />
            </>
          )}
        </>
      )}
    </Card>
  );
}
