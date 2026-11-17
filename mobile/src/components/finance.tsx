import { SensitiveValue } from "./AmountPrivacy";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import Decimal from "decimal.js";
import { useFinfolio } from "../auth/Provider";
import { Eyebrow, Icon, Tag, Wordmark, colors, styles } from "./ui";
import {
  accountTypeLabels,
  assetClassLabels,
  formatDate,
  initials,
  isStale,
} from "../utils/labels";
import { money } from "../utils/money";

/** The phone header from the web app: wordmark, the amounts toggle and the account avatar. */
export function TopBar() {
  const { hidden, setHidden, user } = useFinfolio();
  const navigation = useNavigation<NavigationProp<{ Settings: undefined }>>();
  return (
    <View
      style={[
        styles.row,
        {
          height: 56,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
          backgroundColor: colors.desk,
        },
      ]}
    >
      <Wordmark />
      <View style={[styles.row, { gap: 4 }]}>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={hidden ? "Show amounts" : "Hide amounts"}
          accessibilityState={{ checked: hidden }}
          onPress={() => setHidden(!hidden)}
          hitSlop={4}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? colors.wash : "transparent",
          })}
        >
          <Icon
            name={hidden ? "eye-off" : "eye"}
            size={19}
            color={colors.ink2}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Account settings for ${user.name}`}
          onPress={() => navigation.navigate("Settings")}
          hitSlop={4}
        >
          <Avatar name={user.name} />
        </Pressable>
      </View>
    </View>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/);
  const letters =
    ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.cobalt,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={[
          styles.poster,
          { color: "#fff", fontSize: size * 0.4, letterSpacing: 0 },
        ]}
      >
        {letters}
      </Text>
    </View>
  );
}

/** Initials on a tile, as the web shows for institutions without a logo. */
export function InstitutionMark({
  name,
  size = 40,
}: {
  name: string;
  size?: number;
}) {
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.line2,
        backgroundColor: colors.wash,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={[styles.poster, { fontSize: 15, color: colors.ink2 }]}>
        {initials(name)}
      </Text>
    </View>
  );
}

/** "As of 2 Nov 2026", with the web's stale tag once a balance is over 45 days old. */
export function BalanceDate({ asOf }: { asOf: string | null }) {
  if (!asOf) return <Text style={styles.muted}>Not recorded</Text>;
  return (
    <View style={[styles.row, { justifyContent: "flex-start", gap: 6 }]}>
      <Text style={[styles.muted, { color: colors.ink2 }]}>
        As of {formatDate(asOf)}
      </Text>
      {isStale(asOf) && <Tag tone="warn">Stale</Tag>}
    </View>
  );
}

/** One account in a list: institution tile, name and type, and its balance on the right. */
export function AccountRow({
  name,
  last4,
  institution,
  type,
  asOf,
  amounts,
  hidden = false,
  negative = false,
  warning,
  onPress,
}: {
  name: string;
  last4?: string | null;
  institution: string | null;
  type: string;
  asOf: string | null;
  /** Balance lines, one per currency. */
  amounts: string[];
  hidden?: boolean;
  negative?: boolean;
  warning?: string;
  onPress?: () => void;
}) {
  const body = (
    <>
      <InstitutionMark name={institution ?? name} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={[styles.strong, { fontSize: 14 }]}>
          {name}
          {last4 ? (
            <Text style={{ color: colors.ink3, fontWeight: "400" }}>
              {"  ··" + last4}
            </Text>
          ) : null}
        </Text>
        <Text numberOfLines={1} style={styles.muted}>
          {[institution, accountTypeLabels[type] ?? type]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {asOf && (
          <View style={{ marginTop: 2 }}>
            <BalanceDate asOf={asOf} />
          </View>
        )}
      </View>
      <View style={{ alignItems: "flex-end", maxWidth: "45%" }}>
        {!asOf || amounts.length === 0 ? (
          <Text style={[styles.muted, { fontSize: 13 }]}>Not recorded</Text>
        ) : (
          amounts.map((a, i) => (
            <SensitiveValue
              key={i}
              hidden={hidden}
              render={(mask) => (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[styles.figure, negative && { color: colors.loss }]}
                >
                  {mask ? "••••" : a}
                </Text>
              )}
            />
          ))
        )}
        {negative && <Text style={[styles.muted, { fontSize: 11 }]}>Owed</Text>}
        {warning && (
          <Text style={[styles.warn, { fontSize: 11, textAlign: "right" }]}>
            {warning}
          </Text>
        )}
      </View>
      {onPress && <Icon name="chevron-right" size={16} color={colors.ink3} />}
    </>
  );
  const rowStyle = [
    styles.row,
    { paddingVertical: 11, gap: 12, alignItems: "center" as const },
  ];
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={"Open " + name}
      onPress={onPress}
      style={({ pressed }) => [
        rowStyle,
        {
          marginHorizontal: -8,
          paddingHorizontal: 8,
          borderRadius: 8,
          backgroundColor: pressed ? colors.wash : "transparent",
        },
      ]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={rowStyle}>{body}</View>
  );
}

/** The web's fixed fill per asset class, chosen for colour-blind separation on paper. */
const FILLS: Record<string, string> = {
  stock: "#2D4FA3",
  etf: "#0B8F84",
  fund: "#B07A10",
  bond: "#D0587F",
  crypto: "#2B261F",
  option: "#8A8070",
  other: "#B8AD99",
  cash: "#D9CDB3",
};
const ORDER = [
  "stock",
  "etf",
  "fund",
  "bond",
  "crypto",
  "option",
  "other",
  "cash",
];
export type Slice = { assetClass: string; share: number; display: string };

/** Stacked bar of the portfolio by asset class, with a legend that carries the values. */
export function Allocation({
  slices,
  hidden = false,
}: {
  slices: Slice[];
  /** Hide the percentages along with the amounts. */
  hidden?: boolean;
}) {
  const inBarOrder = ORDER.flatMap((k) =>
    slices.filter((s) => s.assetClass === k),
  );
  const bySize = [...slices].sort((a, b) => b.share - a.share);
  return (
    <View>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={bySize
          .map(
            (s) =>
              hidden
                ? (assetClassLabels[s.assetClass] ?? s.assetClass)
                : `${assetClassLabels[s.assetClass] ?? s.assetClass} ${s.share.toFixed(1)}%`,
          )
          .join(", ")}
        // The bar's proportions say as much as the percentages, so it goes too.
        style={{
          flexDirection: "row",
          height: 16,
          gap: 2,
          display: hidden ? "none" : "flex",
        }}
      >
        {inBarOrder.map((s, i) => (
          <View
            key={s.assetClass}
            style={{
              flexGrow: s.share,
              flexBasis: 0,
              minWidth: 3,
              backgroundColor: FILLS[s.assetClass] ?? colors.ink3,
              borderWidth: 1,
              borderColor: "rgba(22, 19, 15, 0.25)",
              borderTopLeftRadius: i === 0 ? 4 : 0,
              borderBottomLeftRadius: i === 0 ? 4 : 0,
              borderTopRightRadius: i === inBarOrder.length - 1 ? 4 : 0,
              borderBottomRightRadius: i === inBarOrder.length - 1 ? 4 : 0,
            }}
          />
        ))}
      </View>
      <View style={{ marginTop: 12 }}>
        {bySize.map((s) => (
          <View
            key={s.assetClass}
            style={[
              styles.row,
              {
                gap: 10,
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
              },
            ]}
          >
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                backgroundColor: FILLS[s.assetClass] ?? colors.ink3,
                borderWidth: 1,
                borderColor: "rgba(22, 19, 15, 0.25)",
              }}
            />
            <Text numberOfLines={1} style={[styles.text, { flex: 1, fontSize: 13 }]}>
              {assetClassLabels[s.assetClass] ?? s.assetClass}
            </Text>
            <Text style={[styles.figure, { fontSize: 12, fontWeight: "400" }]}>
              {s.display}
            </Text>
            <SensitiveValue
              hidden={hidden}
              render={(hidden) => (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.figure,
                    {
                      fontSize: 12,
                      fontWeight: "400",
                      color: colors.ink3,
                      minWidth: 48,
                      flexShrink: 0,
                      textAlign: "right",
                    },
                  ]}
                >
                  {hidden ? "••••" : `${s.share.toFixed(1)}%`}
                </Text>
              )}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Horizontal bars of where the month's money went, scaled to the largest category. */
export function CategoryBars({
  rows,
}: {
  rows: { id: string; name: string; spent: Decimal; display: string }[];
}) {
  const largest = rows[0]?.spent.isZero() === false ? rows[0].spent : new Decimal(1);
  return (
    <View style={{ gap: 10 }}>
      <Eyebrow>Where it went</Eyebrow>
      {rows.map((c) => (
        <View key={c.id} style={{ gap: 5 }}>
          <View style={styles.row}>
            <Text numberOfLines={1} style={[styles.text, { flex: 1, fontSize: 13 }]}>
              {c.name}
            </Text>
            <Text style={[styles.figure, { fontSize: 12, fontWeight: "500" }]}>
              {c.display}
            </Text>
          </View>
          <View
            style={{
              height: 8,
              backgroundColor: colors.wash,
              borderTopRightRadius: 4,
              borderBottomRightRadius: 4,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${c.spent.div(largest).times(100).toFixed(1)}%` as `${number}%`,
                backgroundColor: colors.rule,
                borderTopRightRadius: 4,
                borderBottomRightRadius: 4,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Month stepper, used on spending views. */
export function MonthStepper({
  label,
  onPrevious,
  onNext,
}: {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.paper,
          borderWidth: 1,
          borderColor: colors.cardBorder,
          borderRadius: 10,
          padding: 3,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        onPress={onPrevious}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? colors.wash : "transparent",
        })}
      >
        <Icon name="chevron-left" size={18} />
      </Pressable>
      <Text style={[styles.strong, { flexShrink: 1, textAlign: "center" }]}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next month"
        onPress={onNext}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? colors.wash : "transparent",
        })}
      >
        <Icon name="chevron-right" size={18} />
      </Pressable>
    </View>
  );
}

/** One transaction, laid out like the web's phone row: payee and amount, then date, then a category chip. */
export function TransactionRow({
  description,
  merchant,
  amount,
  currency,
  postedDate,
  accountName,
  categoryName,
  categoryColor,
  isTransfer,
  cleared,
  hidden,
}: {
  description: string;
  merchant?: string | null;
  amount: string;
  currency: string;
  postedDate: string;
  accountName?: string | null;
  categoryName: string | null;
  categoryColor?: string | null;
  isTransfer: boolean;
  cleared: boolean;
  hidden: boolean;
}) {
  const incoming = new Decimal(amount).gt(0);
  return (
    <View style={{ paddingVertical: 11, gap: 4 }}>
      <View style={[styles.row, { alignItems: "baseline", gap: 8 }]}>
        <Text
          numberOfLines={1}
          style={[styles.strong, { flex: 1, fontSize: 14 }]}
        >
          {merchant ?? description}
        </Text>
        <SensitiveValue
          hidden={hidden}
          render={(hidden) => (
            <Text
              style={[
                styles.figure,
                { fontSize: 13, fontWeight: "500" },
                incoming && { color: colors.gain },
              ]}
            >
              {money(amount, currency, { hidden, signed: true })}
            </Text>
          )}
        />
      </View>
      <Text numberOfLines={1} style={[styles.muted, { fontSize: 11 }]}>
        {[formatDate(postedDate), accountName].filter(Boolean).join(" · ")}
      </Text>
      <View
        style={[
          styles.row,
          { justifyContent: "flex-start", gap: 8, marginTop: 3 },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: colors.wash,
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 2,
            maxWidth: "75%",
          }}
        >
          {!isTransfer && (
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: categoryColor ?? colors.ink3,
              }}
            />
          )}
          <Text
            numberOfLines={1}
            style={{ fontSize: 11, color: colors.ink2, flexShrink: 1 }}
          >
            {isTransfer ? "Transfer" : (categoryName ?? "Not categorised")}
          </Text>
        </View>
        <Text style={[styles.muted, { fontSize: 11 }]}>
          {cleared ? "Cleared" : "Uncleared"}
        </Text>
      </View>
    </View>
  );
}
