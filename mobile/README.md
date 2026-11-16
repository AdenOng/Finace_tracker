# Finfolio mobile

Standalone Bun package for the existing Finfolio backend. Expo SDK 55 / React Native 0.83 / React 19.2, Android package `com.finfolio.mobile`, URL scheme `finfolio`. No workspace migration. Root dependencies must also be installed because TypeScript reads the backend's `AppRouter` type; server code is never imported at runtime.

## Commands

From the repository root:

```sh
bun install --frozen-lockfile
cd mobile
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run export:android
bun run android
bun run start
```

`android` creates a native development build (requires Android SDK/JDK and an available device/emulator). Subsequent JS changes use `start`. Use a development client rather than assuming an installed Expo Go supports SDK 55. An Android JS export validates bundling; it does not build an APK or test native modules.

The root also exposes `mobile:install`, `mobile:start`, `mobile:check`,
`mobile:test`, and `mobile:export`. On Linux, set `JAVA_HOME` to a JDK 17
installation and `ANDROID_HOME` to your SDK directory. If Metro reports `ENOSPC`
for file watchers, use `CI=1 bun run start` temporarily and restart Metro after
source changes, or configure your host's watcher capacity.

For a local standalone APK with embedded JavaScript:

```sh
bunx expo prebuild --platform android --no-install
cd android
NODE_ENV=production ./gradlew :app:assembleRelease -PreactNativeArchitectures=x86_64,arm64-v8a
```

The output is `android/app/build/outputs/apk/release/app-release.apk`. Expo's
generated local release configuration uses the development signing key; this is
a local test artifact, not a Play Store release. Configure your own signing through
EAS for distribution. The standalone release requires an HTTPS backend and does
not need Metro. Generated native directories and APKs are ignored by Git. The app
icon is derived from Finfolio's existing `public/favicon.svg`.

EAS builds (requires your own Expo account/project configuration):

```sh
bunx eas-cli build --platform android --profile development
bunx eas-cli build --platform android --profile preview
bunx eas-cli build --platform android --profile production
```

Development and preview produce installable APKs; production produces an AAB. EAS project credentials and IDs are intentionally not checked in.

## Connect and authenticate

Enter your server's bare origin on first launch. Production requires HTTPS. Development also permits HTTP on localhost, 10.0.2.2 (Android emulator host), loopback and private IPv4 LAN addresses. Run the existing Next.js backend on a reachable interface; an emulator typically uses `http://10.0.2.2:3000`. Before storing the address, the app verifies `/api/health`. The updated backend must be deployed first. More → Check connection tests the connection again. This is an explicit user setting, not a build-time secret.

Backend must enable `@better-auth/expo` and trust `finfolio://`. Mobile Better Auth and Expo auth plugin are pinned to the backend's installed 1.7.7. The three tRPC packages are pinned to backend 11.19.0 to preserve router type compatibility; update them together when upgrading the backend.

Email/password, authenticator TOTP and recovery codes are supported. No registration or policy bypass exists. Instance enrollment requirements remain enforced by protected tRPC procedures; users are directed to web Settings to enroll. Web sign-in has its own browser session.

The selected origin is stored in SecureStore. Cookies use SHA-256-derived, origin-specific SecureStore namespaces. Cookie headers come from Better Auth's `getCookie()` and are sent only to that server using superjson and tRPC POST method override. Default native cookie handling is disabled on tRPC requests. Changing servers signs out first and remounts the auth/query providers. Logout clears local cookies and financial query caches even when the server is unreachable (in that case the remote session cannot be revoked). An unauthorized finance response hides the finance UI and requires another sign-in; foregrounding the app rechecks the session. Finance data has no persisted/offline cache.

## Supported flows

- Personal Overview: net worth, banking, asset classes, CPF/SRS where enabled, account values, valuation completeness and entry dates.
- Accounts: active/archived list, original currency balances, account details and recorded holdings.
- Spending: virtualized history, account/category filters, transaction details/edit/delete, month navigation, converted month totals, search across all dates, cursor pagination, refresh; manual expense/income entry with account, posted date, amount, merchant, notes and optional category. New entries are uncleared and use the account currency. Date fields have a native calendar picker. Leaving a changed form asks before discarding; failed saves keep their inputs. Retrying an unchanged create uses the same idempotency key. Reconciled transaction edits remain a web workflow. Default category selection permits existing server merchant rules.
- Imports under More: native PDF/image selection, progress/cancellation, job status, retry of failed reads, duplicate-file recovery, Keep/Skip review, category and signed-amount corrections, statement dates and server balance checks. Confirmed review is required before saving. Temporary picker copies are deleted after the upload attempt.
- Portfolio: consolidated positions, quantities, values, known-cost gains, cash and missing-price/rate warnings.
- Settings: in-session amount/quantity masking, logout, server switching and web Settings link.
- Loading, empty and recoverable error states; pull-to-refresh on data screens.

## Mobile interface

The overview includes an amount-visibility toggle and shortcuts to accounts and
transaction entry. Use the + button in Spending to add an entry. Account and
category pickers support search; the form shows the selected account’s currency
and keeps optional merchant/notes fields collapsed until needed. The month arrows
change the spending summary, while transaction search includes all dates.

## Web-only flows

Account creation/edit/archive, balance snapshots, security enrollment, passkeys, password recovery, account registration/invitations, email verification, administration, workspaces/shared finance, transfers, reconciliation, cleared-state editing, budgets/planning, quotes/FX configuration and display-currency settings. Mobile intentionally omits workspace IDs, so queries stay in personal scope.

The app contains no analytics, fake finance data, demo login, embedded backend credentials or production auth bypass. Only an explicitly selected statement is uploaded to the chosen server. Amounts use decimal.js without conversion to JavaScript numbers. Privacy masking is a display preference, not screenshot protection or encryption of in-memory data.

## Structure and validation

`src/auth` owns server selection/session lifecycle; `src/api` exposes the typed client; `src/features` contains focused screens; `src/components` supplies shared accessible controls and keyboard/safe-area layouts; `src/utils` contains pure URL, date and money helpers. Helper tests cover insecure/path-bearing origins, local development rules, precision, amount limits, missing values, masking and year boundaries.

Device validation is separate from JS export. On the Android emulator, verify secure server selection, invalid credentials, TOTP/recovery, enrollment blocking, real-data refresh, pagination/search, transaction creation, logout/relaunch, expired-session handling and switching between two servers. This package does not create emulator fixtures or use a production bypass.

See the [disposable backend guide](../docs/mobile-backend-testing.md) for end-to-end flows. Session regression
tests verify that authentication refreshes preserve the two-factor form and that
queries complete after session restoration, with caches discarded between users.
