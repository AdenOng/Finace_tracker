import React from "react";
import { Alert, Linking, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Provider, useFinfolio } from "./auth/Provider";
import { api } from "./api/client";
import {
  Button,
  Card,
  Icon,
  Notice,
  Page,
  Status,
  colors,
  type IconName,
} from "./components/ui";
import { Overview } from "./features/Overview";
import {
  Accounts,
  AccountDetail,
  type AccountsStack,
} from "./features/Accounts";
import {
  Spending,
  AddTransaction,
  TransactionDetail,
  type SpendingStack,
} from "./features/Spending";
import { Portfolio } from "./features/Portfolio";
import { Settings } from "./features/Settings";
import { Imports, ImportReview, type MoreStack } from "./features/Imports";
import { accessError, checkConnection } from "./utils/connection";
const Tabs = createBottomTabNavigator();
const AccountNav = createNativeStackNavigator<AccountsStack>();
const SpendNav = createNativeStackNavigator<SpendingStack>();
const MoreNav = createNativeStackNavigator<MoreStack>();
function MoreScreens() {
  return <MoreNav.Navigator screenOptions={{ headerShown: false }}>
    <MoreNav.Screen name="MoreHome" component={Settings} />
    <MoreNav.Screen name="Imports" component={Imports} />
    <MoreNav.Screen name="ImportReview" component={ImportReview} />
  </MoreNav.Navigator>;
}
function AccountScreens() {
  return (
    <AccountNav.Navigator
      screenOptions={{
        headerShown: false,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.desk },
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.desk },
      }}
    >
      <AccountNav.Screen
        name="AccountList"
        component={Accounts}
        options={{ headerShown: false }}
      />
      <AccountNav.Screen
        name="AccountDetail"
        component={AccountDetail}
        options={{ title: "Account", headerBackTitle: "Accounts" }}
      />
    </AccountNav.Navigator>
  );
}
function SpendingScreens() {
  return (
    <SpendNav.Navigator
      screenOptions={{
        headerShown: false,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.desk },
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.desk },
      }}
    >
      <SpendNav.Screen
        name="Transactions"
        component={Spending}
        options={{ headerShown: false }}
      />
      <SpendNav.Screen
        name="AddTransaction"
        component={AddTransaction}
        options={{ title: "New transaction", headerBackTitle: "Spending" }}
      />
      <SpendNav.Screen name="TransactionDetail" component={TransactionDetail} />
    </SpendNav.Navigator>
  );
}
function Navigation() {
  const gate = api.accounts.list.useQuery();
  const insets = useSafeAreaInsets();
  const { origin, logout } = useFinfolio();
  if (gate.isPending)
    return (
      <Page title="Finfolio">
        <Status pending retry={() => void gate.refetch()} />
      </Page>
    );
  // A failed background refetch keeps the app usable; only block when nothing has loaded yet.
  if (gate.error && !gate.data) {
    const problem = accessError(gate.error);
    return (
      <Page title={problem.title}>
        <Card>
          <Notice tone="error">{problem.detail}</Notice>
          {problem.enrollment && <Button
            title="Open web Settings"
            icon="external-link"
            onPress={() => void Linking.openURL(origin + "/settings")}
          />}
          <Button title="Check connection" variant="secondary" icon="wifi" onPress={() => {
            void checkConnection(origin).then(() => Alert.alert("Connected", "Finfolio and its database are reachable.")).catch((e: unknown) => Alert.alert("Connection problem", e instanceof Error ? e.message : "Cannot reach your server."));
          }} />
          <Button
            title="Try again"
            variant="secondary"
            icon="refresh-cw"
            onPress={() => void gate.refetch()}
          />
          <Button
            title="Sign out"
            variant="ghost"
            icon="log-out"
            onPress={() => void logout()}
          />
        </Card>
      </Page>
    );
  }
  // The web's phone tabs (Lucide LayoutGrid, Wallet, ArrowLeftRight, Layers, Menu).
  const icons: Record<string, { feather?: IconName; ion?: "wallet-outline" | "swap-horizontal" }> = {
    Overview: { feather: "grid" },
    Accounts: { ion: "wallet-outline" },
    Spending: { ion: "swap-horizontal" },
    Portfolio: { feather: "layers" },
    Settings: { feather: "menu" },
  };
  return (
    <NavigationContainer
      theme={{
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: colors.ink,
          background: colors.desk,
          text: colors.ink,
          card: colors.paper,
          border: colors.line,
        },
      }}
    >
      <Tabs.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarAccessibilityLabel: route.name === "Settings" ? "More" : route.name,
          tabBarActiveTintColor: colors.ink,
          tabBarInactiveTintColor: colors.ink3,
          tabBarLabel: route.name === "Settings" ? "More" : route.name,
          tabBarLabelStyle: { fontSize: 11, fontWeight: "500", marginTop: 4 },
          tabBarStyle: {
            backgroundColor: "rgba(248, 244, 234, 0.96)",
            borderTopColor: colors.line,
            borderTopWidth: 1,
            elevation: 0,
            // The web's 64px bar, plus the gesture-bar inset below it.
            height: 64 + insets.bottom,
            paddingTop: 8,
            paddingBottom: insets.bottom + 6,
          },
          tabBarHideOnKeyboard: true,
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                backgroundColor: focused ? colors.ink : "transparent",
                width: 48,
                height: 28,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {icons[route.name]?.ion ? (
                <Ionicons
                  name={icons[route.name]!.ion!}
                  color={focused ? colors.onInk : color}
                  size={19}
                  allowFontScaling={false}
                />
              ) : (
                <Icon
                  name={icons[route.name]?.feather ?? "circle"}
                  color={focused ? colors.onInk : color}
                  size={18}
                />
              )}
            </View>
          ),
        })}
      >
        <Tabs.Screen name="Overview" component={Overview} />
        <Tabs.Screen name="Accounts" component={AccountScreens} />
        <Tabs.Screen name="Spending" component={SpendingScreens} />
        <Tabs.Screen name="Portfolio" component={Portfolio} />
        <Tabs.Screen name="Settings" component={MoreScreens} />
      </Tabs.Navigator>
    </NavigationContainer>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Provider>
        <Navigation />
      </Provider>
    </SafeAreaProvider>
  );
}
