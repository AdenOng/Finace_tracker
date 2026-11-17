import { SensitiveValue } from "../components/AmountPrivacy";
import React from "react";
import { Text, View } from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import Decimal from "decimal.js";
import { api } from "../api/client";
import { useFinfolio } from "../auth/Provider";
import {
  Button,
  Card,
  Eyebrow,
  FigureGrid,
  HeroFigure,
  InkStrip,
  Notice,
  Page,
  SheetHeader,
  Status,
  Tag,
  colors,
  styles,
} from "../components/ui";
import {
  AccountRow,
  Allocation,
  CategoryBars,
  TopBar,
  type Slice,
} from "../components/finance";
import { money as format } from "../utils/money";
import {
  accountGroupOf,
  formatDate,
  formatMonth,
  groupLabels,
} from "../utils/labels";
import { shiftMonth, today } from "../utils/server";

type Nav = NavigationProp<{
  Accounts:
    | undefined
    | {
        screen: "AccountDetail";
        params: { id: string; from: "overview" };
        initial: false;
      };
  Spending: undefined | { screen: "AddTransaction"; initial: false };
  Portfolio: undefined;
}>;

const sum = (values: (string | null | undefined)[]) =>
  values.reduce((total, v) => (v ? total.plus(v) : total), new Decimal(0));

export function Overview() {
  const month = today().slice(0, 7);
  const q = api.portfolio.netWorth.useQuery();
  const categories = api.catalog.categories.useQuery();
  const thisMonth = api.spending.converted.useQuery({ month });
  const lastMonth = api.spending.converted.useQuery({
    month: shiftMonth(month, -1),
  });
  const { hidden, user } = useFinfolio();
  const navigation = useNavigation<Nav>();
  const d = q.data;
  const currency = d?.currency ?? "";
  const money = (
    v: string | Decimal | null | undefined,
    signed = false,
    mask = hidden,
  ) => format(v, currency, { hidden: mask, signed });
  const openAccount = (id: string) =>
    navigation.navigate("Accounts", {
      screen: "AccountDetail",
      params: { id, from: "overview" },
      initial: false,
    });
  const refresh = () => {
    void q.refetch();
    void thisMonth.refetch();
    void lastMonth.refetch();
    void categories.refetch();
  };
  const firstName = user.name.split(" ")[0];

  return (
    <Page
      header={<TopBar />}
      refresh={refresh}
      refreshing={q.isRefetching || thisMonth.isRefetching}
    >
      <Status
        pending={q.isPending}
        error={q.error}
        retry={() => void q.refetch()}
      />
      {d &&
        (() => {
          const recorded = d.asOf !== null;
          const investing = d.accounts.filter(
            (a) => accountGroupOf(a.type) === "investments",
          );
          const banking = d.accounts.filter(
            (a) => accountGroupOf(a.type) === "banking",
          );
          const forLater = d.accounts.filter(
            (a) => accountGroupOf(a.type) === "cpf_srs",
          );
          const investTotal = sum(d.allocation.map((a) => a.total));
          const bankTotal = new Decimal(d.banking.total ?? 0);
          const forLaterTotal = new Decimal(d.cpfSrs.total ?? 0);
          const owed = sum(
            banking.map((a) =>
              a.total && new Decimal(a.total).isNegative() ? a.total : null,
            ),
          ).abs();
          // Shares of a known total would let an onlooker work the amounts back out.
          const share = (part: Decimal) =>
            hidden
              ? "••••"
              : d.total && !new Decimal(d.total).isZero()
              ? `${part.div(d.total).times(100).toFixed(0)}%`
              : "—";
          const accounts = (n: number) => `${n} account${n === 1 ? "" : "s"}`;
          const investmentIncomplete = investing.some(
            (a) => a.unconverted.length > 0 || a.unpriced > 0,
          );
          const positive = d.allocation.filter(
            (a) => a.total && new Decimal(a.total).isPositive(),
          );
          const positiveSum = sum(positive.map((a) => a.total));
          const slices: Slice[] = positive.map((a) => ({
            assetClass: a.assetClass,
            share: positiveSum.isZero()
              ? 0
              : new Decimal(a.total!).div(positiveSum).times(100).toNumber(),
            display: money(a.total),
          }));
          const change = d.prices?.change;
          const priceChange =
            change?.total && change.unconverted.length === 0
              ? new Decimal(change.total)
              : null;
          const row = (a: (typeof d.accounts)[number]) => (
            <AccountRow
              hidden={hidden}
              key={a.id}
              name={a.name}
              last4={a.last4}
              institution={a.institutionName}
              type={a.type}
              asOf={a.asOf}
              amounts={
                a.total === null ? [] : [money(a.total, false, false)]
              }
              negative={!!a.total && new Decimal(a.total).isNegative()}
              warning={
                a.unpriced > 0
                  ? `${a.unpriced} without a price`
                  : a.unconverted.length > 0
                    ? "Exchange rate unavailable"
                    : undefined
              }
              onPress={() => openAccount(a.id)}
            />
          );
          return (
            <>
              {/* Net worth */}
              <Card flush>
                <InkStrip />
                <View style={{ padding: 20, gap: 10 }}>
                  <View style={styles.row}>
                    <Eyebrow style={{ flex: 1 }}>
                      {firstName
                        ? `Total net worth · ${firstName}`
                        : "Total net worth"}
                    </Eyebrow>
                    <Tag tone="outline">{d.currency}</Tag>
                  </View>
                  {(d.unconverted.length > 0 || d.unpriced > 0) && (
                    <Text style={[styles.warn, { fontWeight: "600" }]}>
                      Partial total
                    </Text>
                  )}
                  <SensitiveValue
                    hidden={hidden}
                    render={(hidden) => (
                      <HeroFigure
                        value={money(d.total ?? "0", false, hidden)}
                        muted={!recorded}
                      />
                    )}
                  />
                  <View style={{ gap: 4 }}>
                    <Text
                      style={[
                        styles.text,
                        { fontSize: 13, color: colors.ink2 },
                      ]}
                    >
                      {!recorded
                        ? "Nothing to total yet. Add an account on the web and record what it holds."
                        : d.oldestAsOf && d.oldestAsOf !== d.asOf
                          ? `Latest recorded balances, from ${formatDate(d.oldestAsOf)} to ${formatDate(d.asOf)}.`
                          : `Latest recorded balances, as of ${formatDate(d.asOf)}.`}
                    </Text>
                    {priceChange && !priceChange.isZero() && (
                      <SensitiveValue
                        hidden={hidden}
                        render={(hidden) => (
                          <Text style={{ fontSize: 13 }}>
                            <Text
                              style={[
                                styles.figure,
                                {
                                  fontSize: 13,
                                  color: priceChange.isPositive()
                                    ? colors.gain
                                    : colors.loss,
                                },
                              ]}
                            >
                              {money(priceChange.toFixed(2), true, hidden)}
                            </Text>
                            <Text style={{ color: colors.ink2 }}>
                              {" "}
                              since the previous close
                            </Text>
                          </Text>
                        )}
                      />
                    )}
                    {d.transferWarnings.length > 0 && (
                      <Text style={styles.warn}>
                        Transfer timing may affect these balances. Review them
                        on the web.
                      </Text>
                    )}
                    {d.unconverted.length > 0 && (
                      <SensitiveValue
                        hidden={hidden}
                        render={(hidden) => (
                          <Text style={styles.warn}>
                            Not converted to {d.currency}:{" "}
                            {d.unconverted
                              .map((a) =>
                                format(a.amount, a.currency, { hidden }),
                              )
                              .join(", ")}
                            .
                          </Text>
                        )}
                      />
                    )}
                    {d.unpriced > 0 && (
                      <Text style={styles.warn}>
                        {d.unpriced} holding
                        {d.unpriced === 1 ? " has" : "s have"} no price yet.
                      </Text>
                    )}
                    {d.fxAsOf && (
                      <Text style={styles.muted}>
                        Converted to {d.currency} · exchange rates as of{" "}
                        {formatDate(d.fxAsOf)}.
                      </Text>
                    )}
                  </View>
                </View>
                <FigureGrid
                  items={[
                    {
                      label: groupLabels.investments,
                      value: (
                        <SensitiveValue
                          hidden={hidden}
                          render={(hidden) => (
                            <Text
                              style={[
                                styles.poster,
                                { fontSize: 20, lineHeight: 25 },
                              ]}
                            >
                              {money(investTotal, false, hidden)}
                            </Text>
                          )}
                        />
                      ),
                      note: `${accounts(investing.length)} · ${share(investTotal)}`,
                      onPress: () => navigation.navigate("Portfolio"),
                    },
                    {
                      label: groupLabels.banking,
                      value: (
                        <SensitiveValue
                          hidden={hidden}
                          render={(hidden) => (
                            <Text
                              style={[
                                styles.poster,
                                { fontSize: 20, lineHeight: 25 },
                              ]}
                            >
                              {money(bankTotal, false, hidden)}
                            </Text>
                          )}
                        />
                      ),
                      note: owed.isZero()
                        ? `${accounts(banking.length)} · ${share(bankTotal)}`
                        : `After ${money(owed)} card debt`,
                      onPress: () => navigation.navigate("Accounts"),
                    },
                  ]}
                />
                {forLater.length > 0 && (
                  <FigureGrid
                    items={[
                      {
                        label: groupLabels.cpf_srs,
                        value: (
                          <SensitiveValue
                            hidden={hidden}
                            render={(hidden) => (
                              <Text
                                style={[
                                  styles.poster,
                                  { fontSize: 20, lineHeight: 25 },
                                ]}
                              >
                                {money(forLaterTotal, false, hidden)}
                              </Text>
                            )}
                          />
                        ),
                        note: d.countCpfSrs
                          ? `Locked for later · ${share(forLaterTotal)}`
                          : "Not counted in net worth",
                      },
                    ]}
                  />
                )}
              </Card>

              <View style={[styles.row, { alignItems: "stretch" }]}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Add transaction"
                    icon="plus"
                    onPress={() =>
                      navigation.navigate("Spending", {
                        screen: "AddTransaction",
                        initial: false,
                      })
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="All accounts"
                    icon="credit-card"
                    variant="secondary"
                    onPress={() => navigation.navigate("Accounts")}
                  />
                </View>
              </View>

              {/* Investments */}
              <Card>
                <SensitiveValue
                  hidden={hidden}
                  render={(hidden) => (
                    <SheetHeader
                      eyebrow={groupLabels.investments}
                      figure={money(investTotal, false, hidden)}
                      link={{
                        label: "Portfolio",
                        onPress: () => navigation.navigate("Portfolio"),
                      }}
                    />
                  )}
                />
                {investmentIncomplete && (
                  <Text style={styles.warn}>
                    Partial investment total. The allocation appears once every
                    holding has a price and exchange rate.
                  </Text>
                )}
                {!investmentIncomplete && slices.length > 0 && (
                  <Allocation slices={slices} hidden={hidden} />
                )}
                {investing.length === 0 ? (
                  <Text style={[styles.subtitle, { fontSize: 14 }]}>
                    Brokerage, retirement and crypto accounts are valued from
                    their holdings. Add one on the web.
                  </Text>
                ) : (
                  <View>{investing.map(row)}</View>
                )}
              </Card>

              {/* Spending this month, then bank and card balances */}
              <SpendingSheet
                month={month}
                summary={thisMonth.data}
                previous={lastMonth.data}
                categories={categories.data}
                pending={thisMonth.isPending}
                error={thisMonth.error}
                retry={() => void thisMonth.refetch()}
                hidden={hidden}
                onOpen={() => navigation.navigate("Spending")}
              >
                <View
                  style={[
                    styles.row,
                    {
                      borderBottomWidth: 2,
                      borderBottomColor: colors.rule,
                      paddingBottom: 8,
                      marginTop: 10,
                    },
                  ]}
                >
                  <Eyebrow>{groupLabels.banking}</Eyebrow>
                  <SensitiveValue
                    hidden={hidden}
                    render={(hidden) => (
                      <Text style={[styles.figure, { fontSize: 13 }]}>
                        {money(bankTotal, false, hidden)}
                      </Text>
                    )}
                  />
                </View>
                {banking.length === 0 ? (
                  <Text style={[styles.subtitle, { fontSize: 14 }]}>
                    Savings, current and credit card accounts carry a balance
                    and feed Spending. Add one on the web.
                  </Text>
                ) : (
                  <View>{banking.map(row)}</View>
                )}
              </SpendingSheet>

              {(d.cpfSrsEnabled || forLater.length > 0) && (
                <Card>
                  <SensitiveValue
                    hidden={hidden}
                    render={(hidden) => (
                      <SheetHeader
                        eyebrow={groupLabels.cpf_srs}
                        figure={money(forLaterTotal, false, hidden)}
                      />
                    )}
                  />
                  <Text style={styles.muted}>
                    {d.countCpfSrs
                      ? "Counted in your net worth. CPF opens up from 55; SRS can be withdrawn without penalty from your statutory retirement age."
                      : "Not counted in net worth. Retirement money you can’t spend yet."}
                  </Text>
                  {forLater.length > 0 && <View>{forLater.map(row)}</View>}
                </Card>
              )}
            </>
          );
        })()}
    </Page>
  );
}

type Summary = {
  currency: string;
  spent: string;
  received: string;
  unconverted: string[];
  categories: { categoryId: string | null; spent: string }[];
};

export function SpendingSheet({
  month,
  summary,
  previous,
  categories,
  pending,
  error,
  retry,
  hidden,
  onOpen,
  children,
}: React.PropsWithChildren<{
  month: string;
  summary: Summary | undefined;
  previous: Summary | undefined;
  categories: { id: string; name: string; parentId: string | null }[] | undefined;
  pending: boolean;
  error: { message: string } | null;
  retry: () => void;
  hidden: boolean;
  onOpen?: () => void;
}>) {
  const currency = summary?.currency ?? "";
  const money = (v: string | Decimal, signed = false, mask = hidden) =>
    format(v, currency, { hidden: mask, signed });
  const moneyIn = new Decimal(summary?.received ?? 0);
  const moneyOut = new Decimal(summary?.spent ?? 0);
  // A partial last month would make the comparison misleading.
  const lastOut =
    previous && previous.unconverted.length === 0
      ? new Decimal(previous.spent)
      : new Decimal(0);
  const parentOf = new Map(
    (categories ?? []).map((c) => [c.id, c.parentId ?? c.id]),
  );
  const nameOf = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const byCategory = new Map<string, Decimal>();
  for (const r of summary?.categories ?? []) {
    if (new Decimal(r.spent).isZero()) continue;
    const root = r.categoryId
      ? (parentOf.get(r.categoryId) ?? r.categoryId)
      : "none";
    byCategory.set(
      root,
      (byCategory.get(root) ?? new Decimal(0)).plus(r.spent),
    );
  }
  const ranked = [...byCategory]
    .map(([id, spent]) => ({
      id,
      name: id === "none" ? "Not categorised" : (nameOf.get(id) ?? "Other"),
      spent,
    }))
    .sort((a, b) => b.spent.comparedTo(a.spent));
  const shown = ranked.slice(0, 6);
  const rest = ranked.slice(6).reduce((t, r) => t.plus(r.spent), new Decimal(0));
  const bars = [
    ...shown,
    ...(rest.isZero() ? [] : [{ id: "rest", name: "Everything else", spent: rest }]),
  ].map((c) => ({ ...c, display: money(c.spent.toFixed(2)) }));

  return (
    <Card key={month}>
      <SensitiveValue
        hidden={hidden}
        render={(hidden) => (
          <SheetHeader
            eyebrow={`Spending · ${formatMonth(month)}`}
            figure={summary ? money(moneyOut.toFixed(2), false, hidden) : "—"}
            link={onOpen && { label: "Transactions", onPress: onOpen }}
          />
        )}
      />
      {pending ? (
        <Text style={styles.muted}>Getting this month’s spending…</Text>
      ) : error ? (
        <Notice tone="error">
          <Text style={[styles.text, { fontSize: 14 }]}>{error.message}</Text>
          <View style={{ alignSelf: "flex-start" }}>
            <Button title="Try again" size="sm" variant="secondary" onPress={retry} />
          </View>
        </Notice>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {[
              { label: "Money in", value: moneyIn, color: colors.gain },
              { label: "Money out", value: moneyOut, color: colors.loss },
              {
                label: "Left over",
                value: moneyIn.minus(moneyOut),
                color: colors.ink,
              },
            ].map((f) => (
              <View key={f.label} style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Eyebrow>{f.label}</Eyebrow>
                <SensitiveValue
                  hidden={hidden}
                  render={(hidden) => (
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      style={[styles.figure, { fontSize: 14, color: f.color }]}
                    >
                      {money(f.value.toFixed(2), false, hidden)}
                    </Text>
                  )}
                />
              </View>
            ))}
          </View>
          {!lastOut.isZero() && (
            <SensitiveValue
              hidden={hidden}
              render={(hidden) => (
                <Text style={styles.muted}>
                  {money(
                    moneyOut.minus(lastOut).abs().toFixed(2),
                    false,
                    hidden,
                  )}{" "}
                  {moneyOut.lessThan(lastOut) ? "less" : "more"} than{" "}
                  {formatMonth(shiftMonth(month, -1))}. Transfers between your
                  own accounts aren’t counted.
                </Text>
              )}
            />
          )}
          {bars.length > 0 ? (
            <CategoryBars rows={bars} />
          ) : (
            <Text style={[styles.subtitle, { fontSize: 14 }]}>
              No spending recorded for {formatMonth(month)} yet.
            </Text>
          )}
          {!!summary?.unconverted.length && (
            <Text style={styles.muted}>
              Not included, no exchange rate yet:{" "}
              {summary.unconverted.join(", ")}.
            </Text>
          )}
        </>
      )}
      {children}
    </Card>
  );
}
