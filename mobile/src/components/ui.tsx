import React, { createContext, useContext, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";

/**
 * Finfolio "desk" tokens, matching the signed-in web app (src/styles/globals.css): cream paper
 * sheets on a warm stone desk, ink type, and colour spent only on meaning (gain, loss, warning)
 * and on the four-ink brand motif.
 */
export const colors = {
  desk: "#E6DFD0",
  paper: "#F8F4EA",
  paper2: "#F3EEE3",
  sunken: "#FFFDF8",
  ink: "#16130F",
  ink2: "#4D4538",
  ink3: "#6E6453",
  line: "rgba(22, 19, 15, 0.11)",
  line2: "rgba(22, 19, 15, 0.22)",
  rule: "rgba(22, 19, 15, 0.8)",
  wash: "rgba(22, 19, 15, 0.06)",
  cardBorder: "rgba(22, 19, 15, 0.1)",
  brand2: "#2B261F",
  onInk: "#F8F4EA",
  gain: "#1B7A4C",
  gainWash: "rgba(27, 122, 76, 0.1)",
  loss: "#C4361D",
  lossWash: "rgba(196, 54, 29, 0.1)",
  warn: "#8F6208",
  warnWash: "rgba(143, 98, 8, 0.12)",
  red: "#E0442B",
  green: "#1F8A5B",
  mustard: "#E8B13A",
  cobalt: "#2D4FA3",
};
/**
 * The dark "wall" the web shows before sign-in (landing, two-step, setup): warm charcoal with
 * cream ink. Inside <OnWall>, fields, buttons and notices switch to these tokens.
 */
export const wall = {
  canvas: "#12110F",
  surface: "#1A1815",
  surface2: "#22201C",
  sunken: "#0D0C0A",
  ink: "#EFE6D2",
  ink2: "#B8AD99",
  ink3: "#7F7666",
  line: "#2A2622",
  line2: "#3A352F",
  wash: "#25221E",
  brand: "#EFE6D2",
  brand2: "#FFF7E6",
  onBrand: "#16130F",
  loss: "#EF5A3C",
  lossWash: "rgba(239, 90, 60, 0.12)",
  warn: "#E8B13A",
  warnWash: "rgba(232, 177, 58, 0.12)",
  gain: "#3FB47C",
};
const Surface = createContext<"paper" | "wall">("paper");
export const useOnWall = () => useContext(Surface) === "wall";
/** Content on the dark wall; components inside read cream-on-charcoal tokens. */
export function OnWall({ children }: React.PropsWithChildren) {
  return <Surface.Provider value="wall">{children}</Surface.Provider>;
}
/** Back to paper, for a cream card laid on the wall. */
export function OnPaper({ children }: React.PropsWithChildren) {
  return <Surface.Provider value="paper">{children}</Surface.Provider>;
}

export const fonts = {
  /** Instrument labels and figures, like the web's Geist Mono. */
  mono: Platform.select({ android: "monospace", ios: "Menlo" }),
  /** Condensed display type for headline figures, standing in for Bricolage Grotesque. */
  poster: Platform.select({ android: "sans-serif-condensed", ios: undefined }),
};
export const radius = 10;

export type IconName = React.ComponentProps<typeof Feather>["name"];
export function Icon({
  name,
  color = colors.ink,
  size = 20,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  return (
    <Feather
      name={name}
      size={size}
      color={color}
      allowFontScaling={false}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}

export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.desk },
  content: { padding: 16, gap: 16, paddingBottom: 40, flexGrow: 1 },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "600",
    color: colors.ink,
    letterSpacing: -1.2,
  },
  subtitle: { color: colors.ink2, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.ink3, fontSize: 12, lineHeight: 17 },
  card: {
    padding: 20,
    borderRadius: radius,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 14,
    boxShadow:
      "0px 1px 2px rgba(60, 45, 20, 0.06), 0px 14px 34px -22px rgba(60, 45, 20, 0.4)",
  },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.3,
    color: colors.ink3,
  },
  label: { fontSize: 13, fontWeight: "600", color: colors.ink2 },
  text: { fontSize: 15, color: colors.ink, lineHeight: 22 },
  strong: { fontSize: 15, color: colors.ink, fontWeight: "600" },
  figure: {
    fontFamily: fonts.mono,
    fontVariant: ["tabular-nums"],
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
  poster: {
    fontFamily: fonts.poster,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.sunken,
    minHeight: 50,
  },
  button: {
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: colors.ink,
    paddingHorizontal: 18,
    minHeight: 50,
    borderRadius: radius,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  buttonText: {
    color: colors.onInk,
    fontWeight: "600",
    fontSize: 15,
    flexShrink: 1,
    textAlign: "center",
  },
  error: { color: colors.loss, fontSize: 14, lineHeight: 21 },
  warn: { color: colors.warn, fontSize: 13, lineHeight: 19 },
  divider: { height: 1, backgroundColor: colors.line },
});

/** Upper-cased in JS so on-screen text and UI tests read the same. */
export function Eyebrow({
  children,
  style,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      numberOfLines={1}
      style={[styles.eyebrow, useOnWall() && { color: wall.ink3 }, style]}
    >
      {children.toUpperCase()}
    </Text>
  );
}

export function Page({
  title,
  subtitle,
  children,
  refresh,
  refreshing = false,
  action,
  nested = false,
  lead,
  header,
}: React.PropsWithChildren<{
  title?: string;
  subtitle?: string;
  refresh?: () => void;
  refreshing?: boolean;
  action?: React.ReactNode;
  nested?: boolean;
  /** Content above the title, inside the scroll view. */
  lead?: React.ReactNode;
  /** A fixed bar above the scroll view, such as the app's top bar. */
  header?: React.ReactNode;
}>) {
  return (
    <SafeAreaView
      style={styles.page}
      edges={nested ? ["left", "right"] : ["top", "left", "right"]}
    >
      {header}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={
            refresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={colors.ink}
                colors={[colors.ink]}
                progressBackgroundColor={colors.paper}
              />
            ) : undefined
          }
        >
          {lead}
          {(title || action) && (
          <View style={{ gap: 6, marginTop: 6, marginBottom: 4 }}>
            <View style={[styles.row, { alignItems: "flex-end" }]}>
              <Text
                accessibilityRole="header"
                style={[styles.title, { flex: 1 }]}
              >
                {title}
              </Text>
              {action}
            </View>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
          )}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A tiny four-ink composition: the web's poster mark in miniature, built from views. */
export function BrandMark({ size = 28 }: { size?: number }) {
  const u = size / 32;
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    extra: ViewStyle = {},
  ): ViewStyle => ({
    position: "absolute",
    left: x * u,
    top: y * u,
    width: w * u,
    height: h * u,
    backgroundColor: color,
    ...extra,
  });
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: 7 * u,
        backgroundColor: colors.paper,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.line2,
        overflow: "hidden",
      }}
    >
      <View
        style={box(5, 15, 12, 12, colors.green, {
          borderTopRightRadius: 12 * u,
        })}
      />
      <View style={box(17, 5, 10, 10, colors.red, { borderRadius: 5 * u })} />
      <View style={box(20, 17, 7, 10, colors.cobalt)} />
      <View style={box(5, 6, 9, 3, colors.mustard)} />
    </View>
  );
}
export function Wordmark() {
  const onWall = useOnWall();
  return (
    <View style={[styles.row, { gap: 10, justifyContent: "flex-start" }]}>
      <BrandMark />
      <Text
        style={[
          styles.poster,
          { fontSize: 24, lineHeight: 28, letterSpacing: -0.4 },
          onWall && { color: wall.ink },
        ]}
      >
        Finfolio
      </Text>
    </View>
  );
}
/** Kept for sign-in screens: the wordmark over the page title. */
export function Brand() {
  return (
    <View style={{ marginBottom: 8 }}>
      <Wordmark />
    </View>
  );
}
/** Four-ink registration strip, the house motif across the top of hero sheets. */
export function InkStrip({ height = 6 }: { height?: number }) {
  return (
    <View style={{ flexDirection: "row", height }} accessible={false}>
      {[colors.red, colors.mustard, colors.green, colors.cobalt].map((c) => (
        <View key={c} style={{ flex: 1, backgroundColor: c }} />
      ))}
    </View>
  );
}

export function Card({
  children,
  style,
  flush = false,
}: React.PropsWithChildren<{ style?: StyleProp<ViewStyle>; flush?: boolean }>) {
  return (
    <View
      style={[
        styles.card,
        flush && { padding: 0, gap: 0, overflow: "hidden" },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Card with a title, a short description and optional actions, like the web's Section. */
export function Section({
  title,
  description,
  action,
  children,
}: React.PropsWithChildren<{
  title: string;
  description?: string;
  action?: React.ReactNode;
}>) {
  return (
    <Card>
      <View style={[styles.row, { alignItems: "flex-start" }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            accessibilityRole="header"
            style={{
              fontSize: 17,
              fontWeight: "600",
              color: colors.ink,
              letterSpacing: -0.3,
            }}
          >
            {title}
          </Text>
          {description && (
            <Text style={[styles.subtitle, { fontSize: 14, lineHeight: 20 }]}>
              {description}
            </Text>
          )}
        </View>
        {action}
      </View>
      {children}
    </Card>
  );
}

/** Top of a dashboard sheet: eyebrow, a link out and the headline figure over an ink rule. */
export function SheetHeader({
  eyebrow,
  figure,
  link,
}: {
  eyebrow: string;
  figure: string;
  link?: { label: string; onPress: () => void };
}) {
  return (
    <View
      style={{
        borderBottomWidth: 2,
        borderBottomColor: colors.rule,
        paddingBottom: 12,
      }}
    >
      <View style={[styles.row, { minHeight: 32 }]}>
        <Eyebrow style={{ flex: 1 }}>{eyebrow}</Eyebrow>
        {link && (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={link.label}
            onPress={link.onPress}
            hitSlop={8}
            style={({ pressed }) => [
              styles.row,
              { gap: 4, minHeight: 44, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={{ color: colors.ink2, fontSize: 13, fontWeight: "600" }}>
              {link.label}
            </Text>
            <Icon name="arrow-up-right" size={14} color={colors.ink2} />
          </Pressable>
        )}
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.poster, { fontSize: 32, lineHeight: 36, marginTop: 2 }]}
      >
        {figure}
      </Text>
    </View>
  );
}

/** Hero figure: symbol and minor units set back so the whole number leads. */
export function HeroFigure({
  value,
  muted = false,
  size = 58,
}: {
  value: string;
  muted?: boolean;
  size?: number;
}) {
  const match = /^([−+]?)(\D*?)([\d,]+)(\.\d+)?$/.exec(value);
  const base = [styles.poster, { fontSize: size, lineHeight: size * 1.05 }];
  if (!match)
    return (
      <Text accessibilityLabel={value} style={[base, { color: colors.ink3 }]}>
        {value}
      </Text>
    );
  const [, sign, symbol, whole, fraction] = match;
  return (
    <View
      accessible
      accessibilityLabel={value}
      style={{ flexDirection: "row", alignItems: "flex-start" }}
    >
      {!!(sign || symbol) && (
        <Text
          style={[
            styles.poster,
            {
              fontSize: size * 0.36,
              color: colors.ink3,
              marginTop: size * 0.14,
              marginRight: 4,
            },
          ]}
        >
          {sign}
          {symbol}
        </Text>
      )}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[base, { flexShrink: 1 }, muted && { color: colors.ink3 }]}
      >
        {whole}
        {fraction && (
          <Text style={{ fontSize: size * 0.5, color: colors.ink3 }}>
            {fraction}
          </Text>
        )}
      </Text>
    </View>
  );
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: "neutral" | "ink" | "loss" | "warn" | "gain" | "outline";
}) {
  const tones = {
    neutral: { bg: colors.wash, fg: colors.ink2 },
    ink: { bg: colors.ink, fg: colors.onInk },
    loss: { bg: colors.lossWash, fg: colors.loss },
    warn: { bg: colors.warnWash, fg: colors.warn },
    gain: { bg: colors.gainWash, fg: colors.gain },
    outline: { bg: "transparent", fg: colors.ink2 },
  }[tone];
  return (
    <View
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        height: 22,
        paddingHorizontal: 9,
        borderRadius: 999,
        backgroundColor: tones.bg,
        borderWidth: tone === "outline" ? 1 : 0,
        borderColor: colors.line2,
      }}
    >
      <Text style={{ color: tones.fg, fontSize: 11, fontWeight: "600" }}>
        {children}
      </Text>
    </View>
  );
}

export function Notice({
  tone = "info",
  children,
}: React.PropsWithChildren<{ tone?: "info" | "error" | "warn" | "success" }>) {
  const onWall = useOnWall();
  const t = onWall
    ? {
        info: { border: wall.line2, bg: wall.wash },
        error: { border: "rgba(239, 90, 60, 0.45)", bg: wall.lossWash },
        warn: { border: "rgba(232, 177, 58, 0.45)", bg: wall.warnWash },
        success: { border: "rgba(63, 180, 124, 0.45)", bg: "rgba(63, 180, 124, 0.12)" },
      }[tone]
    : {
    info: { border: colors.line2, bg: colors.wash },
    error: { border: "rgba(196, 54, 29, 0.4)", bg: colors.lossWash },
    warn: { border: "rgba(143, 98, 8, 0.4)", bg: colors.warnWash },
    success: { border: "rgba(27, 122, 76, 0.4)", bg: colors.gainWash },
  }[tone];
  // Text with values mixed in ("…recorded for {asOf}.") arrives as an array, not one string;
  // it still has to sit inside <Text> on native.
  const textOnly = React.Children.toArray(children).every(
    (child) => typeof child === "string" || typeof child === "number",
  );
  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : "text"}
      style={{
        borderWidth: 1,
        borderColor: t.border,
        backgroundColor: t.bg,
        borderRadius: radius,
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 6,
      }}
    >
      {textOnly ? (
        <Text
          style={[
            styles.text,
            { fontSize: 14, lineHeight: 20 },
            onWall && { color: wall.ink },
          ]}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  variant = "plain",
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  variant?: "plain" | "outline" | "ink";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: radius,
        borderWidth: variant === "outline" ? 1 : 0,
        borderColor: colors.line2,
        backgroundColor:
          variant === "ink"
            ? pressed
              ? colors.brand2
              : colors.ink
            : pressed
              ? colors.wash
              : variant === "outline"
                ? colors.paper2
                : "transparent",
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      <Icon
        name={icon}
        size={19}
        color={variant === "ink" ? colors.onInk : colors.ink}
      />
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  disabled = false,
  variant = "primary",
  icon,
  size = "md",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: IconName;
  size?: "sm" | "md";
}) {
  const onWall = useOnWall();
  const t = onWall
    ? { ink: wall.brand, ink2: wall.brand2, onInk: wall.onBrand, text: wall.ink, line2: wall.line2, paper2: wall.surface2, wash: wall.wash, loss: wall.loss, lossWash: wall.lossWash }
    : { ink: colors.ink, ink2: colors.brand2, onInk: colors.onInk, text: colors.ink, line2: colors.line2, paper2: colors.paper2, wash: colors.wash, loss: colors.loss, lossWash: colors.lossWash };
  const color =
    variant === "primary"
      ? t.onInk
      : variant === "danger"
        ? t.loss
        : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        size === "sm" && { minHeight: 40, paddingHorizontal: 12 },
        variant === "primary" && {
          backgroundColor: pressed ? t.ink2 : t.ink,
          borderColor: pressed ? t.ink2 : t.ink,
          // The web's raised key: a darker lip along the bottom edge.
          boxShadow: "inset 0px -2px 0px rgba(0, 0, 0, 0.18)",
        },
        variant === "secondary" && {
          backgroundColor: pressed ? t.wash : t.paper2,
          borderColor: t.line2,
        },
        variant === "ghost" && {
          backgroundColor: pressed ? t.wash : "transparent",
          borderColor: "transparent",
        },
        variant === "danger" && {
          backgroundColor: pressed ? t.lossWash : "transparent",
          borderColor: onWall ? "rgba(239, 90, 60, 0.5)" : "rgba(196, 54, 29, 0.5)",
        },
        disabled && { opacity: 0.45 },
      ]}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 16 : 18} color={color} />}
      <Text
        style={[styles.buttonText, { color }, size === "sm" && { fontSize: 13 }]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  style,
  onFocus,
  onBlur,
  action,
  ...props
}: TextInputProps & {
  label: string;
  hint?: string;
  /** A small control beside the label, such as "Forgot password?". */
  action?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const onWall = useOnWall();
  const ink = onWall ? wall.ink : colors.ink;
  return (
    <View style={{ gap: 7 }}>
      <View style={[styles.row, { minHeight: 20 }]}>
        <Text style={[styles.label, onWall && { color: wall.ink2 }]}>
          {label}
        </Text>
        {action}
      </View>
      <TextInput
        {...props}
        accessibilityLabel={label}
        accessibilityHint={props.accessibilityHint ?? hint}
        placeholderTextColor={onWall ? wall.ink3 : colors.ink3}
        selectionColor={ink}
        cursorColor={ink}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          onWall && {
            backgroundColor: wall.sunken,
            borderColor: wall.line2,
            color: wall.ink,
          },
          focused && { borderColor: ink, borderWidth: 1.5 },
          style,
        ]}
      />
      {hint && (
        <Text style={[styles.muted, onWall && { color: wall.ink3 }]}>
          {hint}
        </Text>
      )}
    </View>
  );
}

/** Placeholder sheet while a view loads, so the layout doesn't jump when data arrives. */
function Skeleton() {
  const bar = (width: ViewStyle["width"], height = 12): ViewStyle => ({
    width,
    height,
    borderRadius: 4,
    backgroundColor: colors.wash,
  });
  return (
    <Card>
      <View style={bar("40%", 10)} />
      <View style={bar("70%", 34)} />
      <View style={bar("90%")} />
      <View style={bar("60%")} />
    </Card>
  );
}

export function Status({
  pending,
  error,
  retry,
}: {
  pending?: boolean;
  error?: { message: string } | null;
  retry: () => void;
}) {
  if (pending)
    return (
      <View style={{ gap: 12 }}>
        <View style={[styles.row, { justifyContent: "flex-start", gap: 10 }]}>
          <ActivityIndicator
            accessibilityLabel="Loading"
            color={colors.ink}
            size="small"
          />
          <Text style={styles.muted}>Getting your latest data…</Text>
        </View>
        <Skeleton />
      </View>
    );
  if (error)
    return (
      <Notice tone="error">
        <View style={[styles.row, { justifyContent: "flex-start", gap: 8 }]}>
          <Icon name="wifi-off" size={16} color={colors.loss} />
          <Text style={styles.strong}>Couldn’t load this view</Text>
        </View>
        <Text accessibilityRole="alert" style={[styles.text, { fontSize: 14 }]}>
          {error.message}
        </Text>
        <View style={{ alignSelf: "flex-start", marginTop: 4 }}>
          <Button
            title="Try again"
            icon="refresh-cw"
            variant="secondary"
            size="sm"
            onPress={retry}
          />
        </View>
      </Notice>
    );
  return null;
}

/** Dashed outline, like the web: room for something that hasn't been added yet. */
export function EmptyState({
  title,
  detail,
  icon,
  action,
}: {
  title: string;
  detail: string;
  icon?: IconName;
  action?: React.ReactNode;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.line2,
        borderRadius: radius,
        paddingHorizontal: 20,
        paddingVertical: 28,
        gap: 6,
      }}
    >
      {icon && (
        <View style={{ marginBottom: 6 }}>
          <Icon name={icon} size={22} color={colors.ink3} />
        </View>
      )}
      <Text
        style={{
          fontSize: 22,
          lineHeight: 27,
          fontWeight: "600",
          color: colors.ink,
          letterSpacing: -0.7,
        }}
      >
        {title}
      </Text>
      <Text style={[styles.subtitle, { fontSize: 14, lineHeight: 20 }]}>
        {detail}
      </Text>
      {action && <View style={{ marginTop: 12 }}>{action}</View>}
    </View>
  );
}

export function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "gain" | "loss" | "warn";
}) {
  return (
    <View style={[styles.row, { minHeight: 28 }]}>
      <Text style={[styles.text, { flex: 1, color: colors.ink2 }]}>{label}</Text>
      <Text
        style={[
          styles.figure,
          { flexShrink: 1, textAlign: "right" },
          tone && { color: colors[tone] },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

/** Two or three figures side by side with hairline dividers, like the web's breakdown strip. */
export function FigureGrid({
  items,
}: {
  items: {
    label: string;
    value: string;
    note?: string;
    tone?: "gain" | "loss";
    onPress?: () => void;
  }[];
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        borderTopWidth: 1,
        borderTopColor: colors.line,
      }}
    >
      {items.map((item, i) => {
        const body = (
          <>
            <Eyebrow>{item.label}</Eyebrow>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[
                styles.poster,
                { fontSize: 20, lineHeight: 25, marginTop: 4 },
                item.tone && { color: colors[item.tone] },
              ]}
            >
              {item.value}
            </Text>
            {item.note && (
              <Text numberOfLines={2} style={styles.muted}>
                {item.note}
              </Text>
            )}
          </>
        );
        const style: ViewStyle = {
          flex: 1,
          minWidth: 0,
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderLeftWidth: i > 0 ? 1 : 0,
          borderLeftColor: colors.line,
        };
        return item.onPress ? (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={`${item.label}: ${item.value}`}
            onPress={item.onPress}
            style={({ pressed }) => [
              style,
              pressed && { backgroundColor: colors.wash },
            ]}
          >
            {body}
          </Pressable>
        ) : (
          <View key={item.label} style={style}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

/** A row of choices in a pill track, like the web's filter tabs. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        backgroundColor: colors.wash,
        borderRadius: radius,
        padding: 4,
        gap: 4,
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: active }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: 42,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 7,
              backgroundColor: active ? colors.ink : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: active ? colors.onInk : colors.ink2,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
