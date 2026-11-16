# Native auth contract and isolated backend testing

The server uses `@better-auth/expo` 1.7.7, matching Better Auth 1.7.7.
[Official Expo integration documentation](https://better-auth.com/docs/integrations/expo).
The plugin's automatic development `exp://` trust is omitted; only `finfolio://`
is added to Better Auth's normal backend web origin. No CSRF checks are disabled.
Better Auth interprets this custom scheme entry as trusting deep links under the
Finfolio scheme. Expo Go `exp://` origins are intentionally unsupported; use the
custom development build with the `finfolio` scheme.

Use `expoClient({ scheme: "finfolio", storagePrefix: "finfolio", storage: SecureStore })`
on the mobile Better Auth client. The plugin sends `expo-origin: finfolio://`
when native requests lack `Origin`, uses `credentials: "omit"`, and stores cookie
changes in SecureStore. An actual browser `Origin` takes precedence and must match
the backend web origin. Never send a fake web Origin to work around validation.

Auth routes stay under `/api/auth`. Login with `signIn.email` may return
`twoFactorRedirect: true`; finish `twoFactor.verifyTotp` (or the existing backup
code flow) before calling finance procedures. New accounts still need an invite
(or the initial setup credential), and enrollment policy is enforced by tRPC.
The existing passkey RP/web origin remains unchanged; native passkey support is
not established by adding this plugin.

For `/api/trpc`, forward `Cookie: authClient.getCookie()` on every request and use
`credentials: "omit"`. `expo-origin` may accompany it but is not an identity
credential. Session identity comes from the signed cookie through the existing
session policy; no bearer-token endpoint or finance API was added. Settings can
be called during enrollment; protected finance calls return FORBIDDEN until the
user is enrolled. Expired, signed-out and legacy impersonation sessions remain
invalid. No broad CORS allowlist or web auth relaxation was added.

## Run a disposable backend

From the repository root:

```bash
bun scripts/mobile-test-server.ts
```

The server binds to `127.0.0.1:3100`, uses an in-memory PGlite database, applies all
real migrations, seeds the SG catalog and creates one synthetic admin through the
real signup and 2FA APIs. Synthetic bank and investment
accounts, balances, a fund holding and transactions are created through the real
finance procedures for emulator verification. It prints random login credentials,
a TOTP secret/URI for an authenticator and single-use backup codes. The account is already enrolled;
logging in still requires the second factor. Restarting destroys all database
changes and rotates credentials. Ctrl-C cleans up temporary uploads as well.

For Android Emulator use `http://10.0.2.2:3100` as the mobile backend URL. If that
emulator cannot reach the loopback listener, bind explicitly to all interfaces:

```bash
MOBILE_TEST_HOST=0.0.0.0 bun scripts/mobile-test-server.ts
```

That also permits a physical development device to connect using the host's LAN
IP; keep this disposable service on a trusted local network. `MOBILE_TEST_PORT`
can choose another unprivileged port. This is an HTTP development service; the
mobile development build must permit local HTTP requests.

## Import and daily-flow tests

The harness also serves the real `/api/health` and authenticated `/api/imports`
routes. Its Bun-only `after()` adapter runs background work and waits for it before
closing the disposable database. It does not change the production Next lifecycle.

Use `MOBILE_TEST_AI=fixture bun scripts/mobile-test-server.ts` for predictable
emulator tests. Only the AI adapter is replaced with a fixed synthetic extraction;
upload storage, authentication, staging, balance checks and commit use real code.
Use `MOBILE_TEST_AI=live` instead to use the configured OpenCode URL/model and
credentials with the disposable database. This mode makes real AI requests.
No AI configuration or keys are copied into the Android application.

The isolated regression is `bun test --preload ./tests/setup.ts ./tests/mobile-imports.test.ts`.
For a live synthetic import check, start OpenCode and run
`MOBILE_IMPORTS_LIVE=true bun tests/fixtures/mobile-imports.ts` from the root.
The test confirms no finance write occurs before review, mismatches are blocked,
duplicate uploads return the original import, and commits cannot be replayed.

Generate the synthetic picker image with:

```sh
bun -e 'import {mobileStatementImage} from "./tests/fixtures/mobile-statement"; await Bun.write(".tmp/finfolio-synthetic-statement.png", mobileStatementImage())'
```

Copy it to the emulator's Downloads directory using your build/install tooling.
With the development APK, Metro and a fresh fixture backend running, run the
flows with [agent-device](https://github.com/callstackincubator/agent-device):

```sh
agent-device test mobile/e2e/sign-in.yaml mobile/e2e/daily-flow.yaml mobile/e2e/session-smoke.yaml \
  --maestro --test-ime --fail-fast \
  -e BACKEND_ORIGIN=http://10.0.2.2:3100 \
  -e EMAIL=<temporary-email> -e PASSWORD=<temporary-password> -e BACKUP_CODE=<unused-temporary-code> \
  --artifacts-dir test-results/mobile/daily --reporter junit:test-results/mobile/daily.xml
```

The flows cover sign-in, create/edit/delete, native upload/review/commit and logout.
Start with a fresh fixture backend; the flow saves an import and consumes a backup
code. The Android file picker can require holding the file and pressing Select.
Keep test reports and temporary credentials outside version control.

The harness replaces only the database module, `server-only` marker and mail
transport in its own Bun process, following existing subprocess fixture patterns.
It imports the real auth configuration, session policy, app router and tRPC HTTP
handler, including request limits. It overrides auth/encryption/setup secrets,
database URL, upload/backup directories and provider configuration before app
imports. It never connects to Postgres, loads private financial files, starts the
Next scheduler, writes `.env` or installs an application bypass. Mail is disabled,
no LLM provider is seeded and the opencode URL is an unreachable local port.
This exercises real auth/router behavior, but PGlite does not cover Postgres
concurrency or Next middleware/page behavior. The harness intentionally serves
auth, tRPC, health and statement uploads, not the web UI or file download routes.

## Automated checks

```bash
bun test --preload ./tests/setup.ts ./tests/mobile-auth.test.ts ./tests/auth-security.test.ts
bun run check
```

The native fixture runs separately from other suites' auth mocks and deliberately
uses development mode to check that `exp://` is rejected even there. It exercises
native signup/session cookies, HTTP tRPC user identity, missing-cookie denial,
invite-only registration, enrollment gating, TOTP challenge/success/failure,
sign-out, disallowed native origins, browser CSRF precedence, callback validation,
web compatibility and maximum session age.
