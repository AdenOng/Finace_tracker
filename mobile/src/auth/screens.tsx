import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  BrandMark,
  Icon,
  InkStrip,
  OnPaper,
  OnWall,
  Wordmark,
  colors,
  fonts,
  radius,
  styles,
  wall,
} from "../components/ui";

/**
 * Screens before sign-in, matching the web: the landing's charcoal wall with a cream sign-in
 * card, and the two-step page's dark card on a hairline grid.
 */

/** The web's 48px hairline grid behind auth cards. */
function GridLines() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const step = 48;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      onLayout={(e) => setSize(e.nativeEvent.layout)}
      style={{ position: "absolute", inset: 0, opacity: 0.4 }}
    >
      {Array.from({ length: Math.ceil(size.width / step) }, (_, i) => (
        <View
          key={"v" + i}
          style={{
            position: "absolute",
            left: i * step,
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: wall.line,
          }}
        />
      ))}
      {Array.from({ length: Math.ceil(size.height / step) }, (_, i) => (
        <View
          key={"h" + i}
          style={{
            position: "absolute",
            top: i * step,
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: wall.line,
          }}
        />
      ))}
    </View>
  );
}

export function AuthShell({
  children,
  right,
  grid = false,
  centered = false,
}: React.PropsWithChildren<{
  right?: React.ReactNode;
  grid?: boolean;
  centered?: boolean;
}>) {
  return (
    <OnWall>
      <SafeAreaView style={{ flex: 1, backgroundColor: wall.canvas }}>
        <StatusBar style="light" />
        {grid && <GridLines />}
        <View
          style={[
            styles.row,
            { height: 64, paddingHorizontal: 20 },
          ]}
        >
          <Wordmark />
          {right}
        </View>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: 32,
              gap: 24,
              justifyContent: centered ? "center" : "flex-start",
            }}
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
        <InkStrip height={4} />
      </SafeAreaView>
    </OnWall>
  );
}

/** "Every account, one number." in the landing's condensed poster type. */
export function Headline({ size = 56 }: { size?: number }) {
  const line = {
    fontFamily: fonts.poster,
    fontWeight: "700" as const,
    fontSize: size,
    lineHeight: size * 0.98,
    letterSpacing: -size * 0.03,
  };
  return (
    <Text accessibilityRole="header" style={[line, { color: wall.ink3 }]}>
      Every account,
      {"\n"}
      <Text style={{ color: wall.ink }}>one number.</Text>
    </Text>
  );
}

export function WallText({
  children,
  muted = false,
  size = 15,
}: {
  children: React.ReactNode;
  muted?: boolean;
  size?: number;
}) {
  return (
    <Text
      style={{
        color: muted ? wall.ink3 : wall.ink2,
        fontSize: size,
        lineHeight: size * 1.6,
      }}
    >
      {children}
    </Text>
  );
}

/** Title and a line of help, like the web's AuthHeading. */
export function AuthHeading({
  title,
  children,
  onWall = false,
}: {
  title: string;
  children?: React.ReactNode;
  onWall?: boolean;
}) {
  return (
    <View style={{ gap: 10, marginBottom: 8 }}>
      <Text
        accessibilityRole="header"
        style={{
          fontSize: 28,
          lineHeight: 33,
          fontWeight: "600",
          letterSpacing: -0.6,
          color: onWall ? wall.ink : colors.ink,
        }}
      >
        {title}
      </Text>
      {children ? (
        <Text
          style={{
            fontSize: 14,
            lineHeight: 22,
            color: onWall ? wall.ink2 : colors.ink2,
          }}
        >
          {children}
        </Text>
      ) : null}
    </View>
  );
}

/** The cream sign-in card the web opens over its landing page. */
export function PaperCard({ children }: React.PropsWithChildren) {
  return (
    <OnPaper>
      <View
        style={[
          styles.card,
          {
            padding: 0,
            gap: 0,
            overflow: "hidden",
            boxShadow: "0px 40px 120px -30px rgba(0, 0, 0, 0.95)",
          },
        ]}
      >
        <InkStrip height={4} />
        <View style={{ padding: 24, gap: 18 }}>
          <BrandMark size={36} />
          {children}
        </View>
      </View>
    </OnPaper>
  );
}

/** The dark card of the web's setup and two-step pages. */
export function SlabCard({ children }: React.PropsWithChildren) {
  return (
    <View
      style={{
        backgroundColor: wall.surface,
        borderWidth: 1,
        borderColor: wall.line,
        borderRadius: radius,
        overflow: "hidden",
        boxShadow: "0px 40px 120px -40px rgba(0, 0, 0, 0.9)",
      }}
    >
      <InkStrip height={4} />
      <View style={{ padding: 24, gap: 18 }}>{children}</View>
    </View>
  );
}

/** "or" between two ways in, as on the web. */
export function OrDivider() {
  return (
    <View style={[styles.row, { gap: 12 }]}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
      <Text style={{ color: colors.ink3, fontSize: 13 }}>or</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
    </View>
  );
}

/** Underlined text action, like the web's inline links. */
export function TextLink({
  title,
  onPress,
  onWall = false,
  size = 14,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  onWall?: boolean;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => ({
        alignSelf: "flex-start",
        opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
      })}
    >
      <Text
        style={{
          fontSize: size,
          fontWeight: "600",
          color: onWall ? wall.ink : colors.ink,
          textDecorationLine: "underline",
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}

/** Which server the app talks to, shown in the header. */
export function ServerChip({ host }: { host: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`Server ${host}`}
      style={[
        styles.row,
        {
          gap: 6,
          maxWidth: "52%",
          height: 34,
          paddingHorizontal: 12,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: wall.line2,
        },
      ]}
    >
      <Icon name="server" size={13} color={wall.ink3} />
      <Text numberOfLines={1} style={{ color: wall.ink2, fontSize: 12, flexShrink: 1 }}>
        {host}
      </Text>
    </View>
  );
}

/** Dark splash while the app restores or checks a session. */
export function AuthSplash({ message }: { message: string }) {
  return (
    <AuthShell centered>
      <View style={{ alignItems: "center", gap: 14 }}>
        <ActivityIndicator color={wall.ink} accessibilityLabel="Loading" />
        <WallText muted size={14}>
          {message}
        </WallText>
      </View>
    </AuthShell>
  );
}
