import React, { useCallback, useState } from "react";
import { BackHandler, Linking, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Decimal from "decimal.js";
import { api } from "../api/client";
import { useFinfolio } from "../auth/Provider";
import {
  Button,
  Card,
  EmptyState,
  Eyebrow,
  HeroFigure,
  Notice,
  Page,
  Section,
  Segmented,
  Status,
  Tag,
  colors,
  styles,
} from "../components/ui";
import {
  AccountRow,
  BalanceDate,
  InstitutionMark,
  TopBar,
  TransactionRow,
} from "../components/finance";
import { money } from "../utils/money";
import {
  accountGroupOf,
  accountTypeLabels,
  assetClassLabels,
  formatMonth,
  groupLabels,
  type AccountGroup,
} from "../utils/labels";
import { today } from "../utils/server";

export type AccountsStack = {
  AccountList: undefined;
  /** `from: "overview"` sends Back to the Overview tab that opened it. */
  AccountDetail: { id: string; from?: "overview" };
};

/** Same groups and copy as the web Accounts page. */
const GROUPS: { group: AccountGroup; description: string; empty: string }[] = [
  {
    group: "investments",
    description:
      "Brokerage, retirement and crypto accounts, valued from their holdings.",
    empty:
      "Add a brokerage, robo-adviser or crypto account and list what it holds.",
  },
  {
    group: "banking",
    description:
      "Savings, current and credit card accounts. Their transactions feed Spending.",
    empty:
      "Add a bank account or credit card, record its balance, then add transactions.",
  },
  {
    group: "cpf_srs",
    description:
      "Retirement money you can't spend yet. Shown apart on the overview.",
    empty: "Add your CPF balances, or an SRS account with your bank or platform.",
  },
];

const isNegative = (amount: string) => amount.trim().startsWith("-");

export function Accounts({
  navigation,
}: NativeStackScreenProps<AccountsStack, "AccountList">) {
  const q = api.accounts.list.useQuery();
  const { hidden, origin } = useFinfolio();
  const [filter, setFilter] = useState<"open" | "archived">("open");
  const open = q.data?.filter((a) => !a.archivedAt) ?? [];
  const archived = q.data?.filter((a) => a.archivedAt) ?? [];
  const visible = filter === "open" ? open : archived;
  return (
    <Page
      header={<TopBar />}
      title="Accounts"
      subtitle="Investments are valued from what they hold; bank and card accounts from their balance and transactions. Each keeps its own currency."
      refresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      <Status
        pending={q.isPending}
        error={q.error}
        retry={() => void q.refetch()}
      />
      {q.data && (
        <>
          <Segmented
            label="Filter accounts"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "open", label: `Open · ${open.length}` },
              { value: "archived", label: `Archived · ${archived.length}` },
            ]}
          />
          {q.data.length === 0 && (
            <EmptyState
              title="Your accounts belong here"
              detail="Add your first account on the web, then pull down here to refresh."
              icon="credit-card"
              action={
                <Button
                  title="Add an account on the web"
                  variant="secondary"
                  icon="external-link"
                  onPress={() => void Linking.openURL(origin + "/accounts")}
                />
              }
            />
          )}
          {q.data.length > 0 &&
            GROUPS.map((g) => {
              const items = visible.filter(
                (a) => accountGroupOf(a.type) === g.group,
              );
              if (!items.length && (filter === "archived" || g.group === "cpf_srs"))
                return null;
              return (
                <Section
                  key={g.group}
                  title={groupLabels[g.group]}
                  description={g.description}
                >
                  {items.length === 0 ? (
                    <View
                      style={{
                        borderWidth: 1,
                        borderStyle: "dashed",
                        borderColor: colors.line2,
                        borderRadius: 10,
                        paddingHorizontal: 16,
                        paddingVertical: 18,
                      }}
                    >
                      <Text style={[styles.muted, { fontSize: 13, color: colors.ink2 }]}>
                        {g.empty}
                      </Text>
                    </View>
                  ) : (
                    <View>
                      {items.map((a, i) => (
                        <View
                          key={a.id}
                          style={
                            i > 0 && {
                              borderTopWidth: 1,
                              borderTopColor: colors.line,
                            }
                          }
                        >
                          <AccountRow
                            name={a.name}
                            last4={a.last4}
                            institution={a.institutionName}
                            type={a.type}
                            asOf={a.asOf}
                            amounts={a.totals.map((t) =>
                              money(t.amount, t.currency, { hidden }),
                            )}
                            negative={a.totals.some((t) => isNegative(t.amount))}
                            warning={
                              a.unpriced > 0
                                ? `${a.unpriced} unpriced`
                                : undefined
                            }
                            onPress={() =>
                              navigation.navigate("AccountDetail", { id: a.id })
                            }
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </Section>
              );
            })}
          {filter === "archived" && archived.length === 0 && (
            <Text style={styles.muted}>
              Accounts you remove that still have history end up here.
            </Text>
          )}
        </>
      )}
    </Page>
  );
}

export function AccountDetail({
  route,
  navigation,
}: NativeStackScreenProps<AccountsStack, "AccountDetail">) {
  const q = api.accounts.get.useQuery({ id: route.params.id });
  const { hidden, origin } = useFinfolio();
  const a = q.data;
  const group = a ? accountGroupOf(a.type) : null;
  const investments = group === "investments";
  const h = a?.holdings ?? null;
  const fromOverview = route.params.from === "overview";
  const back = useCallback(() => {
    if (fromOverview) {
      // Return to the tab that opened this account, and leave Accounts on its list.
      navigation.getParent()?.navigate("Overview");
      navigation.popToTop();
    } else if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace("AccountList");
  }, [fromOverview, navigation]);
  useFocusEffect(
    useCallback(() => {
      if (!fromOverview) return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        back();
        return true;
      });
      return () => sub.remove();
    }, [fromOverview, back]),
  );
  return (
    <Page
      lead={
        <View style={{ alignSelf: "flex-start", marginLeft: -8 }}>
          <Button
            title={fromOverview ? "Overview" : "Accounts"}
            variant="ghost"
            size="sm"
            icon="arrow-left"
            onPress={back}
          />
        </View>
      }
      title={a?.name ?? "Account"}
      subtitle={
        a
          ? [
              accountTypeLabels[a.type] ?? a.type,
              a.institutionName,
              a.last4 ? `··${a.last4}` : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : undefined
      }
      refresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      <Status
        pending={q.isPending}
        error={q.error}
        retry={() => void q.refetch()}
      />
      {a && group && (
        <>
          <View style={[styles.row, { justifyContent: "flex-start" }]}>
            <InstitutionMark name={a.institutionName ?? a.name} size={48} />
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Tag tone="outline">{groupLabels[group]}</Tag>
              {a.currency && <Tag>{a.currency}</Tag>}
            </View>
          </View>
          {a.archivedAt && (
            <Notice tone="warn">
              This account is archived. It is left out of your totals until
              you restore it on the web.
            </Notice>
          )}
          <Section title={investments ? "Value" : "Balance"}>
            {h ? (
              <View style={{ gap: 8 }}>
                <BalanceDate asOf={h.asOf} />
                {h.totals.length === 0 ? (
                  <Text style={styles.muted}>Nothing held.</Text>
                ) : (
                  h.totals.map((t) => (
                    <HeroFigure
                      key={t.currency}
                      size={h.totals.length > 1 ? 34 : 44}
                      value={money(t.amount, t.currency, { hidden })}
                    />
                  ))
                )}
                {h.unpriced > 0 && (
                  <Text style={styles.warn}>
                    {h.unpriced} holdings have no price, so this value is
                    partial.
                  </Text>
                )}
              </View>
            ) : (
              <EmptyState
                title="Nothing recorded yet"
                detail={
                  investments
                    ? "Enter what this account holds and its cash to include it in your totals."
                    : "Enter the current balance to include this account in your totals."
                }
                action={
                  <Button
                    title={investments ? "Record holdings on the web" : "Record balance on the web"}
                    variant="secondary"
                    icon="external-link"
                    onPress={() =>
                      void Linking.openURL(`${origin}/accounts/${a.id}`)
                    }
                  />
                }
              />
            )}
          </Section>
          {h && h.positions.length > 0 && (
            <Section
              title="Holdings"
              description={`${h.positions.length} ${h.positions.length === 1 ? "position" : "positions"} in this entry`}
            >
              <View>
                {h.positions.map((p, i) => (
                  <View
                    key={p.id}
                    style={[
                      styles.row,
                      { paddingVertical: 11, alignItems: "flex-start" },
                      i > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={[styles.figure, { fontSize: 13 }]}>
                        {p.symbol}
                        {!!p.exchange && (
                          <Text style={{ color: colors.ink3, fontWeight: "400" }}>
                            {" · " + p.exchange}
                          </Text>
                        )}
                      </Text>
                      <Text numberOfLines={1} style={styles.muted}>
                        {p.name ?? assetClassLabels[p.assetClass] ?? p.assetClass}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 2 }}>
                      <Text style={[styles.figure, { fontSize: 13 }]}>
                        {p.value
                          ? money(p.value.amount, p.value.currency, { hidden })
                          : "No price"}
                      </Text>
                      <Text style={[styles.muted, { fontFamily: styles.figure.fontFamily }]}>
                        {hidden ? "••••" : new Decimal(p.quantity).toFixed()} units
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </Section>
          )}
          {h && h.cash.length > 0 && investments && (
            <Section title="Cash">
              <View>
                {h.cash.map((c, i) => (
                  <View
                    key={c.currency + (c.bucket ?? "")}
                    style={[
                      styles.row,
                      { minHeight: 40 },
                      i > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                    ]}
                  >
                    <Text style={[styles.text, { color: colors.ink2 }]}>
                      {c.currency}
                    </Text>
                    <Text style={styles.figure}>
                      {money(c.amount, c.currency, { hidden })}
                    </Text>
                  </View>
                ))}
              </View>
            </Section>
          )}
          {group === "banking" && <AccountTransactions accountId={a.id} />}
          {a.notes && (
            <Card>
              <Eyebrow>Notes</Eyebrow>
              <Text style={styles.text}>{a.notes}</Text>
            </Card>
          )}
          <Button
            title="Edit or update on the web"
            variant="secondary"
            icon="external-link"
            onPress={() => void Linking.openURL(`${origin}/accounts/${a.id}`)}
          />
        </>
      )}
    </Page>
  );
}

/** This month's activity on a bank or card account, as on the web's account page. */
function AccountTransactions({ accountId }: { accountId: string }) {
  const month = today().slice(0, 7);
  const { hidden } = useFinfolio();
  const q = api.spending.list.useQuery({
    month,
    search: "",
    accountId,
    categoryId: null,
    limit: 10,
  });
  return (
    <Section title="Transactions" description={formatMonth(month)}>
      <Status
        pending={q.isPending}
        error={q.error}
        retry={() => void q.refetch()}
      />
      {q.data?.length === 0 && (
        <Text style={styles.muted}>Nothing recorded for {formatMonth(month)}.</Text>
      )}
      {!!q.data?.length && (
        <View>
          {q.data.map((t, i) => (
            <View
              key={t.id}
              style={i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }}
            >
              <TransactionRow {...t} accountName={null} hidden={hidden} />
            </View>
          ))}
        </View>
      )}
    </Section>
  );
}
