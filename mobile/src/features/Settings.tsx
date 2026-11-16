import React from "react";
import { Alert, Linking, Pressable, Switch, Text, View } from "react-native";
import { useFinfolio } from "../auth/Provider";
import {
  Button,
  Eyebrow,
  Icon,
  Page,
  type IconName,
  Section,
  colors,
  styles,
} from "../components/ui";
import { Avatar } from "../components/finance";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MoreStack } from "./Imports";
import { checkConnection } from "../utils/connection";

/** Pages from the web's menu that the app leaves to the browser. */
const WEB_PAGES: { label: string; detail: string; path: string; icon: IconName }[] = [
  { label: "Cash flow", detail: "Income and spending over time", path: "/cash-flow", icon: "bar-chart-2" },
  { label: "Workspaces", detail: "Share finances with others", path: "/workspaces", icon: "users" },
  { label: "Settings", detail: "Security, passkeys and preferences", path: "/settings", icon: "settings" },
];

export function Settings({ navigation }: NativeStackScreenProps<MoreStack, "MoreHome">) {
  const { origin, user, hidden, setHidden, logout, switchServer } =
    useFinfolio();
  const host = origin.replace(/^https?:\/\//, "");
  return (
    <Page title="More" subtitle="Your account, privacy, and the rest of Finfolio.">
      <Section title="Account">
        <View style={[styles.row, { justifyContent: "flex-start", gap: 14 }]}>
          <Avatar name={user.name} size={48} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text numberOfLines={1} style={[styles.strong, { fontSize: 16 }]}>
              {user.name || "Signed in"}
            </Text>
            {!!user.email && (
              <Text numberOfLines={1} style={styles.muted}>
                {user.email}
              </Text>
            )}
          </View>
        </View>
      </Section>

      <Section title="Statements" description="Import files and review them before saving.">
        <Button title="Imports" icon="upload" variant="secondary" onPress={() => navigation.navigate("Imports")} />
      </Section>

      <Section
        title="On the web"
        description="These parts of Finfolio open in your browser."
      >
        <View>
          {WEB_PAGES.map((page, i) => (
            <Pressable
              key={page.path}
              accessibilityRole="link"
              accessibilityLabel={`${page.label}, opens on the web`}
              onPress={() => void Linking.openURL(origin + page.path)}
              style={({ pressed }) => [
                styles.row,
                {
                  minHeight: 52,
                  marginHorizontal: -8,
                  paddingHorizontal: 8,
                  borderRadius: 8,
                  backgroundColor: pressed ? colors.wash : "transparent",
                },
                i > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
              ]}
            >
              <Icon name={page.icon} size={18} color={colors.ink2} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={[styles.text, { fontSize: 15 }]}>{page.label}</Text>
                <Text style={styles.muted}>{page.detail}</Text>
              </View>
              <Icon name="arrow-up-right" size={15} color={colors.ink3} />
            </Pressable>
          ))}
        </View>
      </Section>

      <Section
        title="Privacy"
        description="Hide amounts and quantities while others can see your screen."
      >
        <View style={[styles.row, { minHeight: 48 }]}>
          <Icon name={hidden ? "eye-off" : "eye"} size={18} color={colors.ink2} />
          <Text style={[styles.text, { flex: 1 }]}>Hide financial amounts</Text>
          <Switch
            accessibilityLabel="Hide financial amounts"
            trackColor={{ false: colors.line2, true: colors.ink }}
            thumbColor={colors.paper}
            ios_backgroundColor={colors.line2}
            value={hidden}
            onValueChange={setHidden}
          />
        </View>
        <Text style={styles.muted}>
          Finance data is kept in memory while the app is open and is never
          stored as an offline cache.
        </Text>
      </Section>

      <Section
        title="Connection"
        description="The server this app signs in to."
      >
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.line2,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
            gap: 2,
          }}
        >
          <Eyebrow>Connected server</Eyebrow>
          <Text selectable numberOfLines={1} style={[styles.text, { fontSize: 14 }]}>
            {host}
          </Text>
        </View>
        <Button
          title="Check connection" variant="secondary" icon="wifi"
          onPress={() => void checkConnection(origin).then(() => Alert.alert("Connected", "Finfolio and its database are reachable.")).catch((e: unknown) => Alert.alert("Connection problem", e instanceof Error ? e.message : "Cannot reach your server."))}
        />
        <Button
          title="Switch server"
          variant="ghost"
          icon="server"
          onPress={() =>
            Alert.alert(
              "Switch server?",
              "This signs you out and clears the app’s cached financial data.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Switch", onPress: () => void switchServer() },
              ],
            )
          }
        />
      </Section>

      <Button
        title="Sign out"
        variant="danger"
        icon="log-out"
        onPress={() => void logout()}
      />
    </Page>
  );
}
