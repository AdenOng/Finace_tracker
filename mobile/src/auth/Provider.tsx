import React, { createContext, useContext, useEffect, useState } from "react";
import { AppState, Linking, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { SessionGate } from "./SessionGate";
import { FinanceProvider } from "../api/Provider";
import { createClient, type AuthBundle } from "./client";
import { normalizeServer } from "../utils/server";
import { checkConnection } from "../utils/connection";
import { Button, Field, Notice, fonts } from "../components/ui";
import {
  AuthHeading,
  AuthShell,
  AuthSplash,
  Headline,
  OrDivider,
  PaperCard,
  ServerChip,
  SlabCard,
  TextLink,
  WallText,
} from "./screens";

import { AmountPrivacy } from "../components/AmountPrivacy";

const INVITE_ONLY = "Invite only. Ask whoever runs this Finfolio for a link.";
const Context = createContext<{
  origin: string;
  auth: AuthBundle["client"];
  user: { name: string; email: string };
  hidden: boolean;
  setHidden: (v: boolean) => void;
  logout: () => Promise<void>;
  expireSession: () => void;
  switchServer: () => Promise<void>;
}>(null!);
export const useFinfolio = () => useContext(Context);
export function Provider({ children }: React.PropsWithChildren) {
  const [origin, setOrigin] = useState("");
  const [bundle, setBundle] = useState<AuthBundle>();
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void SecureStore.getItemAsync("finfolio_origin")
      .then(async (value) => {
        if (value) {
          const normalized = normalizeServer(value, __DEV__);
          setBundle(await createClient(normalized));
          setOrigin(normalized);
        }
      })
      .catch(() => setError("Choose your server to continue."))
      .finally(() => setReady(true));
  }, []);
  async function connect() {
    if (!input.trim()) {
      setError(
        "Enter your Finfolio address, such as https://finance.example.com.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = normalizeServer(input, __DEV__);
      await checkConnection(next);
      const auth = await createClient(next);
      await SecureStore.setItemAsync("finfolio_origin", next);
      setBundle(auth);
      setOrigin(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot connect");
    } finally {
      setBusy(false);
    }
  }
  if (!ready) return <AuthSplash message="Opening your secure session…" />;
  if (!bundle || !origin)
    return (
      <AuthShell>
        <View style={{ gap: 18, marginTop: 12 }}>
          <Headline />
          <WallText size={16}>
            Finfolio keeps your brokerage, bank and card accounts in one place.
            Balances are converted to the currency you choose and added up, so
            you can see what you&apos;re worth and where this month&apos;s money
            went.
          </WallText>
        </View>
        <PaperCard>
          <AuthHeading title="Connect your Finfolio">
            Enter the address you use to open Finfolio, without a page path.
            Use HTTPS for a secure connection.
          </AuthHeading>
          {!!error && <Notice tone="error">{error}</Notice>}
          <Field
            label="Server address"
            testID="server-address"
            value={input}
            onChangeText={setInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => !busy && void connect()}
            placeholder={
              __DEV__ ? "http://10.0.2.2:3000" : "https://finance.example.com"
            }
          />
          <Button
            title={busy ? "Connecting…" : "Continue"}
            disabled={busy}
            icon="arrow-right"
            onPress={() => void connect()}
          />
        </PaperCard>
        <WallText muted size={13}>
          {INVITE_ONLY}
        </WallText>
      </AuthShell>
    );
  return (
    <ServerSession
      key={origin}
      origin={origin}
      bundle={bundle}
      disconnect={async () => {
        await SecureStore.deleteItemAsync("finfolio_origin");
        setBundle(undefined);
        setOrigin("");
        setInput("");
      }}
    >
      {children}
    </ServerSession>
  );
}
function ServerSession({
  origin,
  bundle,
  disconnect,
  children,
}: React.PropsWithChildren<{
  origin: string;
  bundle: AuthBundle;
  disconnect: () => Promise<void>;
}>) {
  const auth = bundle.client;
  const session = auth.useSession();
  const [hidden, updateHidden] = useState(false);
  const [privacyRevision, setPrivacyRevision] = useState(0);
  const setHidden = (value: boolean) => {
    updateHidden(value);
    setPrivacyRevision((revision) => revision + 1);
  };
  const [expired, setExpired] = useState(false);
  // A deliberate sign-out also clears the session, but shouldn't read as "your session ended".
  const [signedOut, setSignedOut] = useState(false);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active")
        void auth.getSession({ query: { disableCookieCache: true } });
    });
    return () => listener.remove();
  }, [auth]);
  async function clearLocal() {
    await bundle.storage.setItemAsync(bundle.prefix + "_cookie", "{}");
    await bundle.storage.setItemAsync(bundle.prefix + "_session_data", "{}");
    setExpired(true);
  }
  async function logout() {
    try {
      await auth.signOut();
    } catch {
      /* Local logout must also work offline. */
    } finally {
      setSignedOut(true);
      await clearLocal();
    }
  }
  return (
    <AmountPrivacy.Provider value={privacyRevision}>
      <Context.Provider
        value={{
          origin,
          auth,
          user: {
            name: session.data?.user.name ?? "",
            email: session.data?.user.email ?? "",
          },
          hidden,
          setHidden,
          logout,
          expireSession: () => setExpired(true),
          switchServer: async () => {
            await logout();
            await disconnect();
          },
        }}
      >
        <SessionGate
          pending={session.isPending}
          authenticated={!!session.data && !expired}
          loading={<AuthSplash message="Checking your session…" />}
          signIn={
            <SignIn
              onSignedIn={() => {
                setExpired(false);
                setSignedOut(false);
              }}
              expired={expired && !signedOut}
            />
          }
        >
          {session.data && (
            <FinanceProvider
              key={session.data.user.id}
              origin={origin}
              auth={auth}
              onUnauthorized={() => setExpired(true)}
            >
              {children}
            </FinanceProvider>
          )}
        </SessionGate>
      </Context.Provider>
    </AmountPrivacy.Provider>
  );
}
function SignIn({
  onSignedIn,
  expired,
}: {
  onSignedIn: () => void;
  expired: boolean;
}) {
  const { auth, origin, switchServer } = useFinfolio();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [factor, setFactor] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (factor ? !code.trim() : !email.trim() || !password) {
      setError(
        factor
          ? "Enter the code to continue."
          : "Enter your email and password.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (factor) {
        const result = recovery
          ? await auth.twoFactor.verifyBackupCode({ code })
          : await auth.twoFactor.verifyTotp({ code });
        if (result.error)
          throw new Error(result.error.message ?? "Verification failed");
      } else {
        const result = await auth.signIn.email({
          email: email.trim(),
          password,
        });
        if (result.error)
          throw new Error(result.error.message ?? "Sign in failed");
        if (
          result.data &&
          "twoFactorRedirect" in result.data &&
          result.data.twoFactorRedirect
        ) {
          setFactor(true);
          setPassword("");
          return;
        }
      }
      await auth.getSession({ query: { disableCookieCache: true } });
      setPassword("");
      setCode("");
      onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }
  const host = origin.replace(/^https?:\/\//, "");
  if (factor)
    return (
      <AuthShell grid centered right={<ServerChip host={host} />}>
        <SlabCard>
          <AuthHeading onWall title="Two-step check">
            {recovery
              ? "Enter one of the backup codes you saved when you turned on two-step sign-in."
              : "Enter the 6-digit code from your authenticator app."}
          </AuthHeading>
          {!!error && <Notice tone="error">{error}</Notice>}
          <Field
            key={recovery ? "backup" : "totp"}
            testID="two-factor-code"
            label={recovery ? "Backup code" : "Code"}
            value={code}
            onChangeText={setCode}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={recovery ? "default" : "number-pad"}
            autoComplete={recovery ? "off" : "one-time-code"}
            textContentType="oneTimeCode"
            maxLength={recovery ? 32 : 6}
            returnKeyType="go"
            onSubmitEditing={() => !busy && void submit()}
            style={{
              textAlign: "center",
              fontSize: 22,
              letterSpacing: recovery ? 2 : 8,
              fontFamily: fonts.mono,
              minHeight: 56,
            }}
          />
          <Button
            title={busy ? "Checking…" : "Verify"}
            disabled={busy}
            onPress={() => void submit()}
          />
          <View style={{ gap: 16, marginTop: 6 }}>
            <TextLink
              onWall
              title={
                recovery
                  ? "Use authenticator app instead"
                  : "Use a backup code instead"
              }
              onPress={() => {
                setRecovery(!recovery);
                setCode("");
                setError("");
              }}
            />
            <TextLink
              onWall
              title="Back to sign in"
              disabled={busy}
              onPress={() => {
                setFactor(false);
                setRecovery(false);
                setCode("");
                setError("");
              }}
            />
          </View>
        </SlabCard>
      </AuthShell>
    );
  return (
    <AuthShell right={<ServerChip host={host} />}>
      <View style={{ marginTop: 8 }}>
        <Headline size={46} />
      </View>
      <PaperCard>
        <AuthHeading title="Sign in">{INVITE_ONLY}</AuthHeading>
        {expired && (
          <Notice tone="warn">
            Your session ended. Sign in again to continue.
          </Notice>
        )}
        {!!error && <Notice tone="error">{error}</Notice>}
        <Field
          label="Email"
          testID="sign-in-email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="username"
          returnKeyType="next"
        />
        <Field
          label="Password"
          testID="sign-in-password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => !busy && void submit()}
          action={
            <TextLink
              size={13}
              title="Forgot password?"
              onPress={() => void Linking.openURL(origin + "/sign-in")}
            />
          }
        />
        <Button
          title={busy ? "Signing in…" : "Sign in"}
          disabled={busy}
          onPress={() => void submit()}
        />
        <OrDivider />
        <Button
          title="Open Finfolio on the web"
          variant="secondary"
          icon="external-link"
          onPress={() => void Linking.openURL(origin + "/sign-in")}
        />
      </PaperCard>
      <View style={{ gap: 14 }}>
        <WallText muted size={13}>
          Passkeys, password resets and two-step setup are on the web. New
          accounts need an invite from your admin.
        </WallText>
        <Button
          title="Change server"
          variant="ghost"
          icon="server"
          disabled={busy}
          onPress={() => void switchServer()}
        />
      </View>
    </AuthShell>
  );
}
