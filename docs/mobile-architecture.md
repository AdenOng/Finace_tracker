# Finfolio mobile architecture

The Android client is an Expo React Native application in `mobile/`. The root
Next.js application serves the web UI, authentication and finance API. Both clients
use the same Postgres data and server authorization rules.

## Boundaries

- **Screens and navigation:** native presentation and user input. Screens call the
  API through the mobile client layer; they never connect to Postgres.
- **API client:** tRPC transport and TanStack Query caching, with SuperJSON for
  existing API serialization. Router types are imported with `import type` so
  database, filesystem and other server implementations stay out of Metro's bundle.
- **Authentication:** Better Auth's Expo integration and native secure storage.
  Sessions belong to a specific server origin. Logging out or changing servers
  must clear financial query data and prevent reuse of another server's cookies.
- **Shared presentation:** reusable fields, buttons, cards, loading/error states
  and monetary formatting. Money remains decimal strings through the API;
  formatting must not round-trip through JavaScript floating-point numbers.
- **Backend:** existing procedures apply the access scope from the authenticated
  session. The mobile client cannot choose an owner ID to expand that scope.
  Required two-factor enrollment remains enforced by protected procedures.

## Dependency management

The root and `mobile/` have separate `package.json` and `bun.lock` files. Install
both with Bun. The root TypeScript/Next.js lint configuration excludes mobile
sources; the mobile package has its own checks. Docker excludes `mobile/` because
the backend image does not need Android tooling or native dependencies.

Keep Better Auth and its Expo integration on compatible versions in both packages.
Use Expo's dependency validation when upgrading Expo or React Native. Generated
Android/iOS directories, Metro caches, APKs, keystores and private configuration
are not source files and must not be committed.

## Networking and deployment

Each installation selects its Finfolio server. Production connections require
HTTPS. Android emulators can reach a development server on the host through
`10.0.2.2`; a physical phone needs a reachable host address. The backend must
remain available for authentication and finance operations.

The app uses the `finfolio` URL scheme and Android package `com.finfolio.mobile`.
Authentication trusts the explicit native scheme alongside the configured web
origin, without disabling origin/CSRF validation. Database and encryption keys,
provider credentials and uploaded statements stay on the server.

## Initial scope and future work

The client supports personal overview, accounts, spending, portfolio and native statement import/review. Manual spending creates support idempotency keys scoped to an account. Financial rows stay virtualized on long spending and import screens. The backend returns the same balance checks that gate statement commits.
Advanced web workflows can be opened on the configured server. Web browser and
native sessions are separate, so those links can require another sign-in.

Offline mutation queues, background synchronization, native passkeys, push
notifications and camera capture need their own designs and tests before being
added. In particular, offline writes need explicit conflict and duplicate handling;
a cached screen must not imply that a financial mutation has reached the server.

## Verification

Run root and mobile checks separately. Backend authentication tests should exercise
native origins, cookie forwarding, expired/revoked sessions and two-factor gates.
Emulator checks should use disposable synthetic data, exercise a real API read and
write, and verify logout, server changes, loading/error handling and small-screen
navigation. Production data is unnecessary for these checks.
