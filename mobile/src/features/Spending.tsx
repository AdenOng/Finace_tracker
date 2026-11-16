import React, { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { usePreventRemove } from "@react-navigation/native";
import * as Crypto from "expo-crypto";
import Decimal from "decimal.js";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../src/server/api/root";
import { ListPage } from "../components/ListPage";
import { DateField, validDate } from "../components/DateField";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api } from "../api/client";
import { useFinfolio } from "../auth/Provider";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Notice,
  Page,
  Section,
  Segmented,
  Status,
  Tag,
  colors,
  styles,
} from "../components/ui";
import { MonthStepper, TopBar, TransactionRow } from "../components/finance";
import { Select } from "../components/Select";
import { SpendingSheet } from "./Overview";
import { fractionDigits, money, signedAmount } from "../utils/money";
import { formatMonth } from "../utils/labels";
import { shiftMonth, today } from "../utils/server";
type Transaction = inferRouterOutputs<AppRouter>["spending"]["get"];
export type SpendingStack = {
  Transactions: undefined;
  AddTransaction: { id?: string } | undefined;
  TransactionDetail: { id: string };
};
export function Spending({
  navigation,
}: NativeStackScreenProps<SpendingStack, "Transactions">) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const { hidden } = useFinfolio();
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);
  const q = api.spending.list.useInfiniteQuery(
    {
      month,
      search: term,
      accountId: accountId || null,
      categoryId: categoryId || null,
      limit: 30,
    },
    {
      getNextPageParam: (last) => {
        const row = last.at(-1);
        return last.length === 30 && row
          ? { id: row.id, postedDate: row.postedDate, createdAt: row.createdAt }
          : undefined;
      },
    },
  );
  const summary = api.spending.converted.useQuery({ month });
  const previous = api.spending.converted.useQuery({
    month: shiftMonth(month, -1),
  });
  const accounts = api.accounts.list.useQuery();
  const categories = api.catalog.categories.useQuery();
  const rows = q.data?.pages.flat() ?? [];
  return (
    <ListPage
      data={rows}
      topBar={<TopBar />}
      refreshing={q.isRefetching || summary.isRefetching}
      refresh={() => {
        void q.refetch();
        void summary.refetch();
        void previous.refetch();
      }}
      header={
        <View style={{ gap: 16 }}>
          <View style={styles.row}>
            <Text accessibilityRole="header" style={styles.title}>
              Spending
            </Text>
            <IconButton
              icon="plus"
              label="Add transaction"
              variant="ink"
              onPress={() => navigation.navigate("AddTransaction")}
            />
          </View>
          <Text style={styles.subtitle}>
            Money in and out of your bank and card accounts.
          </Text>
          <MonthStepper
            label={formatMonth(month)}
            onPrevious={() => setMonth(shiftMonth(month, -1))}
            onNext={() => setMonth(shiftMonth(month, 1))}
          />
          <SpendingSheet
            month={month}
            summary={summary.data}
            previous={previous.data}
            categories={categories.data}
            pending={summary.isPending}
            error={summary.error}
            retry={() => void summary.refetch()}
            hidden={hidden}
          />
          <Section
            title="Transactions"
            description={
              term
                ? "Searching all dates. The summary above stays on " +
                  formatMonth(month) +
                  "."
                : formatMonth(month)
            }
            action={
              q.data ? (
                <Tag>{`${rows.length}${q.hasNextPage ? "+" : ""}`}</Tag>
              ) : undefined
            }
          >
            <Field
              label="Search all dates"
              testID="transaction-search"
              placeholder="Description, merchant or notes"
              value={search}
              onChangeText={setSearch}
              maxLength={100}
              returnKeyType="search"
            />
            <Select
              label="Filter account"
              value={accountId}
              onChange={setAccountId}
              options={[
                { value: "", label: "All accounts" },
                ...(accounts.data ?? []).map((a) => ({
                  value: a.id,
                  label: a.name,
                })),
              ]}
            />
            <Select
              label="Filter category"
              value={categoryId}
              onChange={setCategoryId}
              options={[
                { value: "", label: "All categories" },
                ...(categories.data ?? []).map((c) => ({
                  value: c.id,
                  label: c.name,
                })),
              ]}
            />
            {accountId || categoryId ? (
              <Text style={styles.muted}>
                Filters apply to the transaction list. The summary includes all
                accounts and categories.
              </Text>
            ) : null}
            <Status
              pending={q.isPending}
              error={q.error}
              retry={() => void q.refetch()}
            />
            {!q.isPending && !q.error && !rows.length && (
              <EmptyState
                title={
                  term || accountId || categoryId
                    ? "No matching transactions"
                    : "A fresh start"
                }
                detail="Try other filters or tap + to add a transaction."
                icon="search"
              />
            )}
          </Section>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open transaction ${item.description}`}
          onPress={() =>
            navigation.navigate("TransactionDetail", { id: item.id })
          }
          style={styles.card}
        >
          <TransactionRow {...item} hidden={hidden} />
        </Pressable>
      )}
      footer={
        <View>
          {q.hasNextPage && (
            <Button
              title={q.isFetchingNextPage ? "Loading…" : "Load more"}
              variant="secondary"
              disabled={q.isFetchingNextPage}
              onPress={() => void q.fetchNextPage()}
            />
          )}
        </View>
      }
    />
  );
}

export function TransactionDetail({
  route,
  navigation,
}: NativeStackScreenProps<SpendingStack, "TransactionDetail">) {
  const { hidden } = useFinfolio();
  const q = api.spending.get.useQuery({ id: route.params.id });
  const utils = api.useUtils();
  const remove = api.spending.remove.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.spending.invalidate(),
        utils.accounts.invalidate(),
        utils.portfolio.invalidate(),
      ]);
      navigation.goBack();
    },
  });
  const t = q.data;
  return (
    <Page
      title="Transaction"
      refresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      <Button
        title="Spending"
        variant="ghost"
        icon="arrow-left"
        onPress={() => navigation.goBack()}
      />
      <Status
        pending={q.isPending}
        error={q.error}
        retry={() => void q.refetch()}
      />
      {t && (
        <Card>
          <Text style={styles.title}>{t.description}</Text>
          <Text style={styles.figure}>
            {money(t.amount, t.currency, { hidden, signed: true })}
          </Text>
          <Text style={styles.text}>
            {t.postedDate} · {t.accountName}
          </Text>
          <Text style={styles.text}>
            {t.categoryName ?? "Uncategorized"} ·{" "}
            {t.cleared ? "Cleared" : "Uncleared"}
          </Text>
          {!!t.merchant && (
            <Text style={styles.text}>Merchant: {t.merchant}</Text>
          )}
          {!!t.notes && <Text style={styles.text}>{t.notes}</Text>}
          <Text style={styles.muted}>
            Source: {t.source}
            {t.isTransfer ? " · transfer" : ""}
          </Text>
          {t.reconciliationId ? (
            <Notice>
              This transaction is reconciled. Manage changes in web
              Reconciliation.
            </Notice>
          ) : (
            <>
              <Button
                title="Edit transaction"
                disabled={remove.isPending}
                onPress={() =>
                  navigation.navigate("AddTransaction", { id: t.id })
                }
              />
              <Button
                title={remove.isPending ? "Deleting…" : "Delete transaction"}
                variant="danger"
                disabled={remove.isPending}
                onPress={() =>
                  Alert.alert(
                    "Delete transaction?",
                    "This permanently removes this transaction. Recorded account balances are separate entries.",
                    [
                      { text: "Cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => remove.mutate({ id: t.id }),
                      },
                    ],
                  )
                }
              />
            </>
          )}
          {remove.error && <Notice tone="error">{remove.error.message}</Notice>}
        </Card>
      )}
    </Page>
  );
}

export function AddTransaction({
  navigation,
  route,
}: NativeStackScreenProps<SpendingStack, "AddTransaction">) {
  const id = route.params?.id;
  const q = api.spending.get.useQuery({ id: id ?? "" }, { enabled: !!id });
  if (id && !q.data)
    return (
      <Page title="Edit transaction">
        <Status
          pending={q.isPending}
          error={q.error}
          retry={() => void q.refetch()}
        />
        <Button title="Spending" onPress={() => navigation.goBack()} />
      </Page>
    );
  return (
    <TransactionForm
      key={id ?? "new"}
      navigation={navigation}
      initial={q.data}
    />
  );
}
function TransactionForm({
  navigation,
  initial,
}: {
  navigation: NativeStackScreenProps<
    SpendingStack,
    "AddTransaction"
  >["navigation"];
  initial?: Transaction;
}) {
  const accounts = api.accounts.list.useQuery();
  const categories = api.catalog.categories.useQuery();
  const utils = api.useUtils();
  const [accountId, setAccount] = useState(initial?.accountId ?? "");
  const [categoryId, setCategory] = useState<string | null>(
    initial?.categoryId ?? null,
  );
  const [date, setDate] = useState(initial?.postedDate ?? today());
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(() => {
    if (!initial) return "";
    // Show 12.50 rather than 12.5, without dropping extra precision the server kept.
    const value = new Decimal(initial.amount).abs();
    return value.toFixed(
      Math.max(fractionDigits(initial.currency), value.decimalPlaces()),
    );
  });
  const [expense, setExpense] = useState(
    initial ? new Decimal(initial.amount).isNegative() : true,
  );
  const [merchant, setMerchant] = useState(initial?.merchant ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [details, setDetails] = useState(
    !!(initial?.merchant || initial?.notes),
  );
  const request = useRef<{ payload: string; key: string } | null>(null);
  const onSuccess = async () => {
    setSaved(true);
    await Promise.all([
      utils.spending.invalidate(),
      utils.accounts.invalidate(),
      utils.portfolio.invalidate(),
    ]);
  };
  const create = api.spending.create.useMutation({ onSuccess });
  const edit = api.spending.update.useMutation({ onSuccess });
  const pending = create.isPending || edit.isPending;
  const fields = {
    accountId,
    categoryId,
    date,
    description,
    amount,
    expense,
    merchant,
    notes,
  };
  const draft = JSON.stringify(fields);
  const original = useRef(draft);
  usePreventRemove(
    !saved && (pending || draft !== original.current),
    ({ data }) => {
      if (pending) {
        Alert.alert(
          "Saving transaction",
          "Wait for the save to finish before leaving this form.",
        );
        return;
      }
      Alert.alert(
        "Discard changes?",
        "Your unsaved transaction changes will be lost.",
        [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => navigation.dispatch(data.action),
          },
        ],
      );
    },
  );
  const available =
    accounts.data?.filter(
      (a) =>
        (!a.archivedAt || a.id === initial?.accountId) &&
        ["checking", "savings", "credit_card", "cash", "other"].includes(
          a.type,
        ),
    ) ?? [];
  async function save() {
    setError("");
    try {
      if (!accountId) throw new Error("Choose an account.");
      if (!description.trim()) throw new Error("Enter a description.");
      if (!validDate(date))
        throw new Error("Enter a valid date as YYYY-MM-DD.");
      const values = {
        accountId,
        categoryId,
        postedDate: date,
        description: description.trim(),
        amount: signedAmount(amount, expense),
        currency:
          initial && initial.accountId === accountId ? initial.currency : null,
        merchant: merchant.trim() || null,
        notes: notes.trim() || null,
        isTransfer: initial?.isTransfer ?? false,
        cleared: initial?.cleared ?? false,
      };
      if (initial) await edit.mutateAsync({ ...values, id: initial.id });
      else {
        const payload = JSON.stringify(values);
        if (request.current?.payload !== payload)
          request.current = { payload, key: Crypto.randomUUID() };
        await create.mutateAsync({
          ...values,
          idempotencyKey: request.current.key,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(
        /network request failed|failed to fetch|aborted/i.test(message)
          ? "Couldn’t reach your server. Your entries are kept. Save again once you’re back online."
          : message ||
              "Could not save. Your entries are kept. Refresh spending before changing and retrying.",
      );
    }
  }
  return (
    <Page
      title={initial ? "Edit transaction" : "Add transaction"}
      lead={
        <View style={{ alignSelf: "flex-start", marginLeft: -8 }}>
          <Button
            title={initial ? "Transaction" : "Spending"}
            variant="ghost"
            size="sm"
            icon="arrow-left"
            onPress={() =>
              navigation.canGoBack()
                ? navigation.goBack()
                : navigation.replace("Transactions")
            }
          />
        </View>
      }
      subtitle="Record money in or out of a bank, card or cash account."
    >
      <Status
        pending={accounts.isPending || categories.isPending}
        // A failed refresh of lists already on screen shouldn't block the form.
        error={
          (!accounts.data && accounts.error) ||
          (!categories.data && categories.error) ||
          null
        }
        retry={() => {
          void accounts.refetch();
          void categories.refetch();
        }}
      />
      {saved ? (
        <Card>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: colors.gainWash,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="check" color={colors.gain} />
          </View>
          <Text style={[styles.title, { fontSize: 26, lineHeight: 30 }]}>
            {initial ? "Transaction updated." : "Transaction saved."}
          </Text>
          <Text style={styles.subtitle}>Your spending has been updated.</Text>
          {!initial && (
            <Button
              title="Add another"
              variant="secondary"
              icon="plus"
              onPress={() => {
                // The cleared form is the new starting point, so leaving it untouched asks nothing.
                original.current = JSON.stringify({
                  ...fields,
                  description: "",
                  amount: "",
                  merchant: "",
                  notes: "",
                });
                setSaved(false);
                request.current = null;
                setDescription("");
                setAmount("");
                setMerchant("");
                setNotes("");
              }}
            />
          )}
          <Button
            title={initial ? "Back to transaction" : "Back to spending"}
            onPress={() =>
              navigation.canGoBack()
                ? navigation.goBack()
                : navigation.replace("Transactions")
            }
          />
        </Card>
      ) : (
        <>
          <Card>
            <Select
              label="Account"
              value={accountId}
              onChange={setAccount}
              options={available.map((a) => ({
                value: a.id,
                label: a.name + " · " + a.currency,
              }))}
            />
            {accounts.data && !available.length && (
              <Notice tone="warn">
                Add a bank, card or cash account on the web first.
              </Notice>
            )}
          </Card>
          <Card>
            <Segmented
              label="Transaction type"
              value={expense ? "out" : "in"}
              onChange={(v) => {
                setExpense(v === "out");
                setCategory(null);
              }}
              options={[
                { value: "out", label: "Money out" },
                { value: "in", label: "Money in" },
              ]}
            />
            <Field
              label={`Amount · ${available.find((a) => a.id === accountId)?.currency ?? "account currency"}`}
              testID="transaction-amount"
              accessibilityHint="Enter a positive amount"
              style={[
                styles.poster,
                {
                  fontSize: 34,
                  paddingVertical: 18,
                  color: expense ? colors.ink : colors.gain,
                },
              ]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
            <DateField label="Posted date" value={date} onChange={setDate} />
            <Field
              label="Description"
              testID="transaction-description"
              value={description}
              onChangeText={setDescription}
              maxLength={500}
            />
            <Button
              title={
                details ? "Hide optional details" : "Add merchant or notes"
              }
              variant="ghost"
              icon={details ? "minus" : "plus"}
              onPress={() => setDetails(!details)}
            />
            {details && (
              <>
                <Field
                  label="Merchant (optional)"
                  value={merchant}
                  onChangeText={setMerchant}
                  maxLength={200}
                />
                <Field
                  label="Notes (optional)"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  maxLength={2000}
                />
              </>
            )}
          </Card>
          <Card>
            <Select
              label="Category"
              value={categoryId ?? ""}
              onChange={(value) => setCategory(value || null)}
              options={[
                { value: "", label: "Automatic / uncategorized" },
                ...(categories.data ?? [])
                  .filter((c) => c.kind === (expense ? "expense" : "income"))
                  .map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </Card>
          <Text style={styles.muted}>
            Transfers, reconciliation and cleared status are managed on the web.
          </Text>
          {!!error && <Notice tone="error">{error}</Notice>}
          <Button
            title={
              pending
                ? "Saving…"
                : initial
                  ? "Save changes"
                  : "Save transaction"
            }
            icon="check"
            disabled={
              pending ||
              !available.length ||
              !accounts.data ||
              !categories.data
            }
            onPress={() => void save()}
          />
        </>
      )}
    </Page>
  );
}
