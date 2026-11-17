import { SensitiveValue } from "../components/AmountPrivacy";
import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import Decimal from "decimal.js";
import { api } from "../api/client";
import { useFinfolio } from "../auth/Provider";
import {
  Card,
  EmptyState,
  Eyebrow,
  Field,
  FigureGrid,
  HeroFigure,
  Icon,
  InkStrip,
  Notice,
  Page,
  Section,
  Status,
  Tag,
  colors,
  styles,
  Button,
} from "../components/ui";
import {
  Allocation,
  InstitutionMark,
  TopBar,
  type Slice,
} from "../components/finance";
import { money as format } from "../utils/money";
import { assetClassLabels, formatDate } from "../utils/labels";

const signedPercent = (p: string) => (p.startsWith("-") ? "−" + p.slice(1) : "+" + p) + "%";
const MASK = "••••";

export function Portfolio() {
  const q = api.portfolio.consolidated.useQuery();
  const { hidden, origin } = useFinfolio();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const d = q.data;
  const currency = d?.currency ?? "";
  const money = (
    v: string | null | undefined,
    signed = false,
    mask = hidden,
  ) =>
    v === null || v === undefined
      ? "—"
      : format(v, currency, { hidden: mask, signed });
  const units = (v: string, mask = hidden) =>
    mask ? "••••" : new Decimal(v).toFixed();

  // Allocation by asset class, shown only when every holding is valued (as on the web).
  const slices: Slice[] = (() => {
    if (!d || d.incomplete || d.total === null) return [];
    if (d.positions.some((p) => p.total === null)) return [];
    const byClass = new Map<string, Decimal>();
    for (const p of d.positions)
      byClass.set(
        p.assetClass,
        (byClass.get(p.assetClass) ?? new Decimal(0)).plus(p.total!),
      );
    if (d.cash.total) byClass.set("cash", new Decimal(d.cash.total));
    const positive = [...byClass].filter(([, v]) => v.isPositive());
    const sum = positive.reduce((s, [, v]) => s.plus(v), new Decimal(0));
    if (sum.isZero()) return [];
    return positive.map(([assetClass, v]) => ({
      assetClass,
      share: v.div(sum).times(100).toNumber(),
      display: money(v.toFixed(2)),
    }));
  })();

  const term = search.trim().toLocaleLowerCase();
  const positions =
    d?.positions.filter(
      (p) =>
        !term ||
        p.symbol.toLocaleLowerCase().includes(term) ||
        (p.name ?? "").toLocaleLowerCase().includes(term),
    ) ?? [];
  const unrecorded = d?.brokers.filter((b) => !b.asOf) ?? [];

  return (
    <Page
      header={<TopBar />}
      title="Portfolio"
      subtitle="Every holding across your brokers, added up."
      refresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      <Status
        pending={q.isPending}
        error={q.error}
        retry={() => void q.refetch()}
      />
      {d && (
        <>
          <Card flush>
            <InkStrip />
            <View style={{ padding: 20, gap: 10 }}>
              <View style={styles.row}>
                <Eyebrow style={{ flex: 1 }}>{`All brokers · ${currency}`}</Eyebrow>
                {d.incomplete && <Tag tone="warn">Partial</Tag>}
              </View>
              {d.total === null ? (
                <Text style={[styles.poster, { fontSize: 44, color: colors.ink3 }]}>
                  {d.oldestEntry ? "Not valued" : "Not recorded"}
                </Text>
              ) : (
                <SensitiveValue
                  hidden={hidden}
                  render={(hidden) => (
                    <HeroFigure value={money(d.total, false, hidden)} />
                  )}
                />
              )}
              <SensitiveValue
                hidden={hidden}
                render={(hidden) => (
                  <Text
                    style={[styles.subtitle, { fontSize: 14, lineHeight: 20 }]}
                  >
                    {`${d.positions.length} holding${d.positions.length === 1 ? "" : "s"} across ${d.selectedBrokerCount} account${d.selectedBrokerCount === 1 ? "" : "s"}${d.newestEntry ? `, up to ${formatDate(d.newestEntry)}` : ""}.`}
                    {d.srs?.total && !new Decimal(d.srs.total).isZero()
                      ? ` Includes ${money(d.srs.total, false, hidden)} in SRS.`
                      : ""}
                  </Text>
                )}
              />
              {unrecorded.length > 0 && (
                <Text style={styles.muted}>
                  Nothing recorded yet for{" "}
                  {unrecorded.map((b) => b.name).join(", ")}.
                </Text>
              )}
              {slices.length > 0 && (
                <View style={{ marginTop: 10 }}>
                  <Allocation slices={slices} hidden={hidden} />
                </View>
              )}
            </View>
            <FigureGrid
              items={[
                {
                  label: "Holdings",
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
                          {money(d.securities.total, false, hidden)}
                        </Text>
                      )}
                    />
                  ),
                },
                {
                  label: "Broker cash",
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
                          {money(d.cash.total, false, hidden)}
                        </Text>
                      )}
                    />
                  ),
                },
              ]}
            />
            <FigureGrid
              items={[
                {
                  label: "Unrealised gain",
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
                          {d.gain ? money(d.gain.amount, true, hidden) : "—"}
                        </Text>
                      )}
                    />
                  ),
                  tone: d.gain
                    ? new Decimal(d.gain.amount).isNegative()
                      ? "loss"
                      : "gain"
                    : undefined,
                  note: d.gain
                    ? `${d.gain.percent !== null ? (hidden ? MASK : signedPercent(d.gain.percent)) + " · " : ""}${d.gain.holdings} of ${d.positions.length} holdings have a cost`
                    : "Add average costs to see this",
                },
              ]}
            />
          </Card>

          {d.incomplete && (
            <Notice tone="warn">
              <View style={{ gap: 4 }}>
                {d.unpriced > 0 && (
                  <Text style={[styles.text, { fontSize: 14 }]}>
                    {`${d.unpriced} position${d.unpriced === 1 ? " has" : "s have"} no price and ${d.unpriced === 1 ? "is" : "are"} excluded from the value.`}
                  </Text>
                )}
                {d.unconverted.length > 0 && (
                  <Text style={[styles.text, { fontSize: 14 }]}>
                    Waiting for exchange rates:{" "}
                    {[...new Set(d.unconverted.map((u) => u.currency))].join(
                      ", ",
                    )}
                  </Text>
                )}
              </View>
            </Notice>
          )}

          <Section
            title={`Holdings · ${d.positions.length}`}
            description={
              d.positions.some((p) => p.brokers.length > 1)
                ? "Tap a holding held with several brokers to see each one."
                : undefined
            }
          >
            {d.positions.length > 6 && (
              <Field
                label="Search holdings"
                placeholder="Symbol or name"
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
                autoCapitalize="none"
              />
            )}
            {positions.length === 0 ? (
              <EmptyState
                icon="pie-chart"
                title={term ? "No matching holdings" : "No holdings recorded"}
                detail={
                  term
                    ? "Try another symbol or company name."
                    : "Import a statement or add a snapshot on the web."
                }
              />
            ) : (
              <View>
                {positions.map((p, i) => {
                  const several = p.brokers.length > 1;
                  const open = expanded === p.securityId;
                  const partial = p.unpriced > 0 || p.unconverted.length > 0;
                  const body = (
                    <View
                      style={[
                        styles.row,
                        { alignItems: "flex-start", paddingVertical: 12 },
                      ]}
                    >
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <View
                          style={[
                            styles.row,
                            { justifyContent: "flex-start", gap: 6 },
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.strong,
                              { fontSize: 14, flexShrink: 1 },
                            ]}
                          >
                            {p.symbol}
                          </Text>
                          {p.inSrs && <Tag tone="outline">SRS</Tag>}
                        </View>
                        <Text numberOfLines={1} style={styles.muted}>
                          {[
                            p.name ?? assetClassLabels[p.assetClass] ?? p.assetClass,
                            several
                              ? `${p.brokers.length} brokers`
                              : p.brokers[0]?.accountName,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                        <SensitiveValue
                          hidden={hidden}
                          render={(hidden) => (
                            <Text
                              style={[
                                styles.muted,
                                { fontFamily: styles.figure.fontFamily },
                              ]}
                            >
                              {units(p.quantity, hidden)} units ·{" "}
                              {hidden
                                ? MASK
                                : p.weight !== null
                                  ? `${p.weight}%`
                                  : "—"}
                            </Text>
                          )}
                        />
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 2 }}>
                        <SensitiveValue
                          hidden={hidden}
                          render={(hidden) => (
                            <Text style={styles.figure}>
                              {money(p.total, false, hidden)}
                            </Text>
                          )}
                        />
                        {partial && (
                          <Text style={[styles.warn, { fontSize: 11 }]}>
                            Partial
                          </Text>
                        )}
                        {p.gain && (
                          <SensitiveValue
                            hidden={hidden}
                            render={(hidden) => (
                              <Text
                                style={[
                                  styles.figure,
                                  {
                                    fontSize: 12,
                                    fontWeight: "500",
                                    color: new Decimal(
                                      p.gain!.amount,
                                    ).isNegative()
                                      ? colors.loss
                                      : colors.gain,
                                  },
                                ]}
                              >
                                {money(p.gain!.amount, true, hidden)}
                                {p.gain!.percent !== null
                                  ? ` · ${hidden ? MASK : signedPercent(p.gain!.percent)}`
                                  : ""}
                              </Text>
                            )}
                          />
                        )}
                      </View>
                      {several && (
                        <View style={{ paddingTop: 2 }}>
                          <Icon
                            name={open ? "chevron-up" : "chevron-down"}
                            size={16}
                            color={colors.ink3}
                          />
                        </View>
                      )}
                    </View>
                  );
                  return (
                    <View
                      key={p.securityId}
                      style={
                        i > 0 && {
                          borderTopWidth: 1,
                          borderTopColor: colors.line,
                        }
                      }
                    >
                      {several ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ expanded: open }}
                          accessibilityLabel={`${p.symbol}, held with ${p.brokers.length} brokers`}
                          onPress={() => setExpanded(open ? null : p.securityId)}
                          style={({ pressed }) => pressed && { backgroundColor: colors.wash }}
                        >
                          {body}
                        </Pressable>
                      ) : (
                        body
                      )}
                      {several && open && (
                        <View
                          style={{
                            backgroundColor: colors.wash,
                            borderRadius: 8,
                            padding: 12,
                            gap: 10,
                            marginBottom: 12,
                          }}
                        >
                          {p.brokers.map((b) => (
                            <View key={b.accountId} style={{ gap: 2 }}>
                              <View style={styles.row}>
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    styles.strong,
                                    { fontSize: 13, flex: 1 },
                                  ]}
                                >
                                  {b.accountName}
                                </Text>
                                <SensitiveValue
                                  hidden={hidden}
                                  render={(hidden) => (
                                    <Text
                                      style={[styles.figure, { fontSize: 13 }]}
                                    >
                                      {money(b.total, false, hidden)}
                                    </Text>
                                  )}
                                />
                              </View>
                              <SensitiveValue
                                hidden={hidden}
                                render={(hidden) => (
                                  <Text style={styles.muted}>
                                    {units(b.quantity, hidden)} units · as of{" "}
                                    {formatDate(b.asOf)} ·{" "}
                                    {b.source === "statement"
                                      ? "Imported"
                                      : b.source === "manual"
                                        ? "Manual"
                                        : "Synced"}
                                  </Text>
                                )}
                              />
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </Section>

          {d.cashBalances.length > 0 && (
            <Section title="Broker cash">
              <View>
                {d.cashBalances.map((c, i) => (
                  <View
                    key={c.currency}
                    style={[
                      styles.row,
                      { minHeight: 44 },
                      i > 0 && {
                        borderTopWidth: 1,
                        borderTopColor: colors.line,
                      },
                    ]}
                  >
                    <Text style={[styles.text, { color: colors.ink2 }]}>{c.currency}</Text>
                    <View style={{ alignItems: "flex-end" }}>
                      <SensitiveValue
                        hidden={hidden}
                        render={(hidden) => (
                          <Text style={styles.figure}>
                            {format(c.amount, c.currency, { hidden })}
                          </Text>
                        )}
                      />
                      {c.currency !== currency && c.total !== null && (
                        <SensitiveValue
                          hidden={hidden}
                          render={(hidden) => (
                            <Text style={styles.muted}>
                              ≈ {money(c.total, false, hidden)}
                            </Text>
                          )}
                        />
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </Section>
          )}

          <Section title="By broker">
            <View>
              {d.brokers.map((b, i) => (
                <View
                  key={b.id}
                  style={[
                    styles.row,
                    { paddingVertical: 11 },
                    i > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                  ]}
                >
                  <InstitutionMark name={b.institutionName ?? b.name} size={36} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text numberOfLines={1} style={[styles.strong, { fontSize: 14 }]}>
                      {b.name}
                    </Text>
                    <Text numberOfLines={1} style={styles.muted}>
                      {b.asOf ? `As of ${formatDate(b.asOf)}` : "Nothing recorded"}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <SensitiveValue
                      hidden={hidden}
                      render={(hidden) => (
                        <Text style={styles.figure}>
                          {b.asOf ? money(b.total, false, hidden) : "—"}
                        </Text>
                      )}
                    />
                    {b.unpriced > 0 && (
                      <Text style={[styles.warn, { fontSize: 11 }]}>Partial</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </Section>

          <Text style={styles.muted}>
            Values use the latest quotes, which may be newer than your statement
            dates.
          </Text>
          <Button
            title="Manage accounts on the web"
            variant="secondary"
            icon="external-link"
            onPress={() => void Linking.openURL(origin + "/accounts")}
          />
        </>
      )}
    </Page>
  );
}
