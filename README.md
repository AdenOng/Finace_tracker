# Finfolio

Self-hosted net worth and spending tracker for people with accounts at several brokers and banks.
Statements and screenshots are read by an LLM of your choice (opencode, any OpenAI-compatible or
Anthropic-compatible endpoint) into structured data, which you review before anything is saved.

Built on the T3 stack: Next.js (App Router), tRPC, Drizzle + Postgres, Better Auth, Tailwind.

## Project location

The active Finfolio app lives in the `Finace_tracker` repository. Run the Bun and Docker
commands below from this repository root. It was originally implemented in
the sibling `../portfolio_website` directory; that copy is retained for recovery, but development
should continue here.

The previous Python API/CLI (`finance_tracker/`) and Vite UI (`frontend/`) are preserved as a
separate legacy implementation. Finfolio uses its own Next.js server and database schema;
it does not connect to that Python API. See [the legacy tracker guide](docs/legacy-python-tracker.md)
for its setup and commands.

When moving an existing local installation, retain its `.env` and encryption key to keep
using the same database and encrypted provider credentials. The Compose project name remains
`finfolio`, so existing named volumes are reused. Do not recreate the database to change folders.

## Status

| Area                                                                                                                                                                                                          | State |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Auth: invite-only sign-up, first user is admin, TOTP two-step, passkeys, rate limits                                                                                                                          | Done  |
| Self-service: name, password change, signed-in devices, "Forgot password" when email is set up                                                                                                                | Done  |
| Admin console: status overview, users and invitations, account recovery (sessions, two-step reset, password reset links), brokers & banks, categories, AI providers, activity log                             | Done  |
| Admin operations: security policy and sign-in history, import jobs, AI usage, cost and limits, provider health and fallback, backups, market data, storage retention, data packs, system info, optional email | Done  |
| LLM layer: opencode / OpenAI-compatible / Anthropic adapters, structured output                                                                                                                               | Done  |
| Extraction: PDF text layer, scanned-PDF rasterising, admin playground                                                                                                                                         | Done  |
| Accounts: bank, card, brokerage, wallet, CPF and SRS accounts; archive instead of delete when in use                                                                                                          | Done  |
| Portfolio: manual balance and holdings entries, net worth in the display currency                                                                                                                             | Done  |
| Net-worth history: daily figures, an estimate at past market prices backfilled a year before the first entry, filterable by group                                                                             | Done  |
| Spending: manual transactions, monthly summary by category, transfers excluded, search and CSV export                                                                                                         | Done  |
| Reconciliation: statement-period review, exact balance checks, protected entries and reopening                                                                                                                | Done  |
| Merchant rules: per-user text matching, automatic categorization and previewed application                                                                                                                    | Done  |
| Bulk editing: categories, merchant, notes, transfer/cleared status and reviewed deletion                                                                                                                      | Done  |
| Import pipeline: upload → background job → review & dedupe → commit, restart recovery, review reminders                                                                                                       | Done  |
| Daily FX conversion, combined net worth and investment account totals                                                                                                                                         | Done  |
| Hourly market prices for stocks, ETFs and crypto                                                                                                                                                              | Done  |
| Hide amounts: app-wide switch plus a per-card eye to show or hide one card                                                                                                                                    | Done  |
| Broker sync (IBKR Flex, Longbridge OpenAPI, moomoo OpenD), CSV statement import                                                                                                                               | Later |

The full database schema for the later phases already exists (`src/server/db/schema`).

## Importing statements

Open **Imports** (or **Import statement** on an account), pick the account and drop a PDF
statement or a screenshot (PNG, JPEG or WebP, up to 20 MB). The file is stored under
`UPLOAD_DIR` and read in the background by the default AI provider. With opencode this is
`opencode-go/glm-5.3-flash`, which reads both text PDFs and images. Nothing is written to your
accounts until you review it:

- **Bank and card accounts:** every line becomes a transaction with a suggested category
  (merchant rules apply to uncategorised lines). The review checks that the opening balance
  plus the lines equals the closing balance, and the closing balance can be saved as the
  account balance on the statement date.
- **Investment accounts:** holdings and cash are saved together as what the account held on
  the statement date. Buys, sells, dividends and fees are listed separately.
- Lines that match something already recorded start unticked; same-day, same-amount lines are
  flagged. Committing is all-or-nothing, and the same statement line is never saved twice.
- The same file cannot be uploaded twice. **Discard** removes the upload and anything staged
  from it; records already saved stay.

For local development, run opencode yourself with the same password as `.env`:

```bash
OPENCODE_SERVER_PASSWORD=<from .env> opencode serve --hostname 127.0.0.1 --port 4096
```

Compose installs opencode `OPENCODE_VERSION` (default 1.19.3, matching `@opencode-ai/sdk`).
Bump both together.

## Checking statements and organizing spending

### Consolidated portfolio

Open **Portfolio** from the menu, **Overview → Investments → Portfolio**, or
**Accounts → Investments → Consolidated view**. The page combines the latest holdings and
cash entry from each active investment account, with one total in your display currency.
Matching securities are grouped by instrument (symbol and exchange); expand a holding to see
each broker's quantity, entry date, source and value. Different exchanges remain separate.

Search by symbol or company name, or filter to one broker. Cash has its own currency and broker
breakdown. The settings gear changes the display currency across portfolio totals. Missing
prices, exchange rates and account entries are labelled; incomplete portfolios have no allocation
percentages. Bank/card accounts and archived investment accounts are excluded. Restore an
archived broker under **Accounts → Archived** to include its holdings again.

### Adding and correcting holdings

Open **Accounts → an account**. **Update holdings** (or **Update balance**) edits its current
entry, including imported holdings. You can add or remove holdings and adjust quantities,
prices, average cost, market value and cash. Changing a quantity or price clears the previously
entered market value so it can be recalculated; enter an explicit market value to override that
calculation. Prices and monetary values retain their recorded decimal precision.

Use **Entry history → Add entry** for another date, or **Import statement** to upload an image
or PDF and review its extracted holdings before saving. Each history row shows its date,
Manual/Imported source and whether it currently determines the account value. **Edit** changes
that exact entry; date conflicts never overwrite another entry. Imported entries retain their
upload link and are marked **Adjusted** after editing; the import review still shows the original
extraction and points to the adjusted account data.

The delete button opens a review. Deleting an entry removes only its holdings and cash; uploaded
files and spending/trade records remain. If it was current, the latest remaining valid dated
entry becomes current. Editing and deletion reject changes based on stale data. Entry management
is available to the account owner in Personal view; archived accounts must be restored to edit.

Fixing mistakes:

- **Wrong symbol, exchange, currency or quantity:** edit the entry and change it. A holding is
  identified by symbol, exchange and currency, so a typo becomes its own listing and never
  blocks the correct one, for you or anyone else. A new entry that lists a holding in a different
  currency than the account's current entry is refused with the date of the entry to check.
- **Wrong type or name:** edit the entry. The correction applies to every one of your entries for
  that holding; if someone else on the instance holds it too, the shared label is left alone.
  Changing the type drops its market quote, since the type decides which market symbol is used.
- **Wrong date:** entries cannot be dated in the future, so a mistyped year cannot become the
  current entry for good. Edit the date, or delete the entry.
- **Sold everything:** record a new entry with a cash balance (0 if empty). Deleting the latest
  entry instead brings back the one before it.
- **A market price that looks wrong:** a quote more than ten times away from the statement price
  is ignored and the overview names the holding, which usually means its symbol, exchange or
  type is off (Bitcoin entered as a stock picks up the "BTC" ETF).

### Removing individual imported rows

Open **Imports → a completed import**, then use the trash button beside a saved holding, cash
balance, transaction or trade. The review shows the saved row and explains its effect before
**Remove row** confirms deletion. The upload and original extraction stay available, and the row
is marked **Removed**. Before saving an import, uncheck rows to exclude them instead.

Removing a holding or cash row updates only that dated entry. Removing its last row also removes
the empty entry, so the latest remaining entry becomes current. Removing a spending transaction
or trade does not change the saved holdings or balances. Reconciled spending transactions are
protected; changed holdings must be managed through **Entry history → Edit**. Ownership, archived
accounts and stale reviews are checked again at deletion. There is no automatic undo; add any
replacement manually.

If you remove an account with financial history, it is archived and retains its imports. Adding
the same broker again creates a separate account; it does not move that history. Open an old
import and choose **Restore original account**, or restore it under **Accounts → Archived**, to
manage its rows again. A genuinely deleted account's uploads remain reference-only. Restoration
never merges another account or moves its records.

### Checking spending

- **Reconciliation:** open a bank, card, cash or wallet account and choose **Reconcile statement**.
  Enter the inclusive statement dates, currency, opening balance before the first day and closing
  balance after the last day. Review every transaction against the statement. Transfers count in
  this check; other currencies are checked separately. Credit-card amounts owed are negative.
  Finish only when opening balance plus signed transactions equals closing balance exactly.
  Reconciled entries are cleared and protected against changes to their amount, date, account,
  currency, description or cleared status, and against deletion. Adding or moving an entry into
  that period is also blocked. Category, merchant, transfer labels and notes stay editable.
  Choose **Reopen** on the account to unlock a period; entries retain their cleared status.
  Reconciliation verifies the spending ledger and does not update portfolio balance snapshots.
- **Merchant rules:** in **Spending → Merchant rules**, add text to match in a merchant or
  description and choose a category. Matching ignores case and repeated whitespace and treats
  wildcard characters literally. Longer patterns win; ties use the oldest rule, then its id.
  New uncategorised, non-transfer entries use the rules automatically. Select existing entries
  and choose **Apply rules** to review and confirm suggested categories. Manual choices,
  including categories deliberately cleared through editing, are preserved.
- **Bulk edits:** select up to 500 visible transactions in Spending and choose **Bulk edit**.
  Fields default to keeping their existing values; selecting a blank value clears that field.
  Bulk deletion has a separate review step. Each operation succeeds for the whole selection or
  leaves every entry unchanged. Refresh a preview if another edit changes its underlying data.
- **Search and export:** type in **Search every month** to find transactions by description,
  merchant or note across all months (newest 500 matches; account and category filters still
  apply). **Export CSV** downloads the transactions currently listed. Text that a spreadsheet
  would treat as a formula is prefixed with `'`.
- **Other currencies:** the overview's spending card converts every currency into your display
  currency at the latest exchange rate; a currency without a rate is named instead of counted.
  The Spending page keeps each currency's totals separate.

The new reconciliation schema is applied by the existing startup migrations. No additional
configuration is required.

## Quick start (local development)

```bash
cd /path/to/Finace_tracker
cp -n .env.example .env       # keep an existing .env; fill in secrets for a new install
bun install
docker compose up -d db       # Postgres on 127.0.0.1:${POSTGRES_PORT:-5432}
bun run dev                   # migrations + default data are applied on boot
```

For a new instance, generate a separate setup token with `openssl rand -base64 32` and set
`SETUP_TOKEN` in `.env` before starting the app. Open http://localhost:3000 and enter that token
on `/setup` to create the admin account. With no token configured, first-admin registration is
disabled. Remove `SETUP_TOKEN` from `.env` after setup and restart; existing accounts and
invite-based registration do not need it. Never reuse your auth or encryption keys as the setup
token, or put the token in a URL.
With `REQUIRE_TWO_FACTOR=true` (the default) everyone must enrol an authenticator app before the
rest of the app unlocks. Set it to `false` to choose instead under **Admin → Security** (everyone,
admins only, or not required).

## Running everything in Docker

```bash
opencode auth login           # on the host, once — signs in to your opencode Go subscription
docker compose up -d --build  # db, opencode, app, nightly backup
```

| Service       | Purpose                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| `db`          | Postgres 17, volume `pgdata`                                                                                    |
| `opencode`    | `opencode serve`, headless, all tools disabled, basic-auth protected. Mounts your host `auth.json`              |
| `app`         | Next.js standalone server. Runs migrations and seeding on start                                                 |
| `backup`      | `pg_dump` once a day into `./backups`, kept `BACKUP_RETENTION_DAYS` (14). Also on request from **Admin → Data** |
| `cloudflared` | Optional (`--profile tunnel`). If you already run a tunnel, point it at `http://<host>:3000`                    |

Set `BETTER_AUTH_URL` to the public Cloudflare hostname in production so cookies and passkeys
work. Putting Cloudflare Access in front of `/admin` is a cheap extra layer.
The authentication library's `/api/auth/admin/*` endpoints are disabled; account management
uses the app's enrolled, audited admin procedures. User impersonation is disabled, including
sessions created by older versions of that feature.

Password-reset requests are limited per client address across app processes and restarts:
5 link requests and 10 completion attempts per minute. Missing client addresses share a bucket.
As with Better Auth's sign-in limits, your reverse proxy must overwrite `X-Forwarded-For` with
the real client address and prevent direct public access to the app port. Invalid, expired,
revoked or already-used reset tokens never trigger password hashing.

### Data privacy and operator access

This app does not provide end-to-end encryption against its operator. Admins can download
database backups containing every user's financial records, and account-recovery controls can
reset passwords and two-factor enrollment. Backup downloads and recovery actions are audited.
Uploaded statement files and database dumps are not encrypted by the application; protect the
host volumes and backup storage with disk encryption and restricted access.

Uploading a statement sends its text or images to the configured AI provider and, on failure,
may send it to the configured fallback. Review those providers' retention policies before using
real financial documents. Stored provider API keys are encrypted separately using
`APP_ENCRYPTION_KEY`; that encryption does not cover financial records or uploads.

If someone forgets their password or loses their authenticator, an admin opens
**Admin → Users → Manage** to create a single-use password reset link (valid 24 hours, served at
`/reset/<token>`) or reset their two-step setup. Both sign the person out everywhere and are
recorded in **Admin → Activity log**.

### Optional email

Without email, invite and reset links are shown to the admin to hand over. To send them instead,
to let people reset a forgotten password themselves, to warn them about sign-ins from a new device
and to remind them about statements waiting for review, add an SMTP server to `.env` and restart:

```bash
SMTP_URL=smtps://user:password@smtp.example.com:465
SMTP_FROM="Finfolio <finfolio@example.com>"
```

**Admin → System → Send me a test email** checks the settings.

With email set up, **Forgot password?** on the sign-in form emails a reset link to the address
entered, if an account uses it. The page answers the same way either way, so it cannot be used to
find out who has an account. A requested link works once within an hour and signs the person out
everywhere; each person can ask for one every five minutes, and each request is recorded in
**Admin → Activity log**. Imports that have waited a week for review are mentioned once in a
daily reminder email to their owner.

### Your account

**Settings** lets everyone change their name and password, and lists the devices signed in to
their account with how and when they signed in. Any other device can be signed out there, or all
of them at once; changing the password signs the others out by default. Email addresses are
changed by an admin.

### Backups and restore

The `backup` service writes `finfolio-YYYYMMDD-HHMMSS.dump` files to `./backups`, which the app
also mounts (`BACKUP_DIR`). **Admin → Data** lists them, downloads them (each download is logged)
and can ask for one now; the service picks the request up within a minute. To restore:

```bash
docker compose stop app
docker compose exec -T db pg_restore --clean --if-exists -U finfolio -d finfolio \
  < backups/finfolio-YYYYMMDD-HHMMSS.dump
docker compose start app
```

Dumps do not contain `APP_ENCRYPTION_KEY`; keep your `.env` with them or stored API keys cannot be
decrypted. After updating `docker-compose.yml`, run `docker compose up -d` once so the app gets
the `./backups` mount and the backup service its new loop.

### Housekeeping

The app runs a few timers in-process: provider health checks every 6 hours (switch off on
**Admin → AI providers**), exchange-rate refresh every 12 hours, security prices every hour
(switch off on **Admin → Data → Market data**), and a daily clean-up of uploaded statement files
when a retention period is set on **Admin → Data → Storage**. Only files whose imports are
finished are deleted; the transactions they produced stay.

Every 6 hours each person's net worth is saved for the day (`networth_snapshot`; the day's last
run wins) for the overview chart. Before the first saved day, the chart is estimated from account
entries valued at past daily closes (`price_history`), fetched daily and when the overview opens,
back to a year before someone's first entry. Before an account's first entry it assumes the
holdings in that entry were already held, and marks those days as backfilled, because purchase
dates and cost prices are unknown. Price lookups follow the market data switch. Every 5 minutes,
imports a restart interrupted are marked failed so their owner can read them again, and uploads
that never started reading are started.
With email set up, a daily run sends the review reminders described above.

## Architecture

```
src/
  presets/                 Default data packs (currencies, institutions, categories) — plain data
  server/
    auth/                  Better Auth config, invitation tokens, session helpers
    db/
      schema/              One file per domain: auth, catalog, finance, ingest, market, ai
      seed/ bootstrap.ts   Idempotent seeding; migrate + seed on boot
    lib/
      access.ts            Access scope — every per-user query goes through it
      secrets.ts           AES-256-GCM for API keys at rest
    modules/
      llm/                 Provider-agnostic interface + adapters (opencode, ai-sdk)
      extraction/          Zod output schema, prompt builder, PDF/image preparation
      accounts/            Ownership checks shared by the finance routers
      portfolio/           Holdings loading, valuation, FX conversion and snapshot writes
      imports/             Upload storage, background extraction runner, staging and dedupe
    api/routers/           tRPC routers: accounts, portfolio (holdings, net worth),
                           spending (transactions), imports (review and commit),
                           catalog, settings, admin/*
  components/ui/           Design-system primitives
  app/(auth) app/(app)     Route groups: sign-in flows vs the signed-in shell
```

### Decisions worth knowing

- **Defaults are data, the database is the source of truth.** Preset packs seed by stable `key`
  with insert-only semantics, so admin edits and removals survive upgrades. Self-hosters can supply
  their own pack via `PRESET_FILE=/path/pack.json` (validated by `src/presets/types.ts`), or add a
  built-in pack under `src/presets/<country>/`.
- **Removing is archiving** when something still references a row (institutions with accounts,
  categories with transactions). Archiving a category asks where its transactions should go.
- **The LLM never writes to finance tables.** Extraction returns schema-validated JSON. The import
  pipeline stages it for review, dedupes it (file hash → row fingerprint → fuzzy match) and only
  then commits. Category keys are a dynamic enum of the active categories, so the model cannot
  invent one.
- **Scanned PDFs are rendered to page images**, because most vision models accept images but not
  PDFs. PDFs with a text layer send the text instead, which is cheaper and more accurate.
- **Personal ownership, explicit workspace sharing.** Every financial row has `owner_id`; reads go through
  `readableAccount(scope, ownerId, accountId)`. Personal scope is the default; an explicit
  `workspaceId` selects only accounts granted to that audience. Owner-scoped settings, rules,
  uploads, and credentials never inherit workspace access.
- **Money is `NUMERIC`**, surfaced as strings; each row keeps its original currency and conversion
  to the display currency happens at read time.
- **Spending and net worth are separate flows over shared accounts.** Transactions record money in
  and out (`spending` router). Balances and holdings are point-in-time snapshots per account
  (`portfolio` router); net worth is the latest snapshot of every open account. Re-entering a date
  replaces that day's manual snapshot.
- **Balance freshness.** Each account shows its snapshot date; balances more than 45 calendar
  days old are marked stale to allow for monthly statements. A snapshot dated D includes
  transactions posted on D (end-of-day). Net worth uses mixed snapshot dates and does not
  adjust the total for transfers. Confirmed transfers warn when only one included account's
  snapshot reflects its side: sender updated alone means temporarily missing money; receiver
  updated alone means double counting. Each side retains its own currency and amount. Both
  accounts must be readable, active, have recorded balances, and count toward the current total
  (including the CPF/SRS setting); workspace notices require both accounts to be shared.
- **Blank entries do not replace holdings.** A manual holdings or balance entry must contain at
  least one holding or cash balance. To explicitly record an empty account, enter a cash balance
  of `0`. Older blank entries are ignored when selecting current holdings. Imported statements
  retain their statement dates; the review explains when a newer account entry will remain
  current, both before and after saving. If no statement end date was read, choose an **As of**
  date before saving balances, holdings or trades. Saving another statement entry for the same
  account and date replaces that date's statement holdings and balances; the review warns before
  saving, and existing transactions and trades remain saved.
- **Currency conversion for complete totals.** The overview converts holdings and cash into the
  display currency with daily reference rates from [Frankfurter](https://frankfurter.dev/).
  Rates refresh on demand, are cached for an hour, and persist in `fx_rate` for use during an
  outage. Only the display currency is sent to the provider; no balances or account details leave
  the app. Each broker shows one combined total. The gear in the Net worth or Investments card
  opens the display-currency setting, which updates all portfolio totals together. The overview
  shows the rate date. Missing rates or prices explicitly mark totals as partial and hide an
  incomplete investment allocation. No API key or additional configuration is required.
- **Net-worth history.** Every 6 hours the overview's net worth is saved for the day, and the
  overview charts it. Days before the first saved figure are estimated from account entries:
  on each entry date, every open account's latest entry at its recorded values. Estimated stretches
  are dashed. Past figures are converted at the latest exchange rates, so changing the display
  currency keeps the history. The chart covers personal accounts only.
- **Market prices between statements.** Stocks, ETFs and crypto in each account's latest entry
  are priced hourly from Yahoo Finance's public chart endpoint, so net worth follows the market
  instead of waiting for the next statement. **Refresh prices** on the overview fetches them on
  demand (cached for ten minutes). The overview shows how many holdings use market prices, when
  they were quoted and the move since the previous close. A quote is only used when it is at
  least as recent as the entry, so a newer statement always wins over a stale price. Share quotes
  must be in the currency the holding was recorded in, which stops a ticker that maps to another
  listing from revaluing it; coins are priced in USD and converted. Funds, bonds, options and
  unrecognised exchanges keep their statement price unless an admin sets a Yahoo symbol in
  `security.provider_symbols`. Only ticker symbols are sent; switch the feed off on
  **Admin → Data → Market data**. No API key is required.
- **CPF and SRS sit apart from investments.** CPF balances are entered per sub-account
  (Ordinary, Special, MediSave, Retirement); SRS accounts hold cash and securities like a
  brokerage. The overview shows them in their own sheet with an interest estimate and this
  year's SRS top-ups (imported deposits) against the S$15,300 cap. They count toward net worth by
  default; untick "Count CPF and SRS in net worth" under the display gear to leave them out. An
  existing `Retirement` account can be switched to `SRS` from its Edit drawer without losing
  holdings. The Portfolio page includes SRS holdings, tagged, and shows unrealised gain wherever
  an average cost was recorded. CPF and SRS come with the Singapore preset (`DATA_PRESET=sg`); a
  custom `PRESET_FILE` turns them on with `"features": { "cpfSrs": true }`. With them off, new CPF
  and SRS accounts can't be added, but existing ones stay visible and always count toward net
  worth.
- **Hiding amounts.** **Settings → Privacy → Hide amounts**, or the eye beside your name (in the
  header on phones), turns every balance, total, quantity and transaction amount into a row of
  dots, so neither the digits nor their length show. Percentages, dates and unit prices stay
  visible. Each card that shows money has its own eye to show or hide just that card; flipping
  the main switch resets every card. The main switch and the overview, portfolio, accounts and
  spending cards are saved to your account, so they follow you to other devices; a card on one
  account or workspace applies to that record only and lasts until you reload. If a save fails,
  the screen stays as you set it and Settings says it wasn't saved. It is a screen-privacy aid, not access control: the figures are still sent to
  the browser. Statement review and the reconcile drawer stay unmasked because they are for
  checking numbers.

## Scripts

| Command                  |                                                                       |
| ------------------------ | --------------------------------------------------------------------- |
| `bun run dev`            | Dev server                                                            |
| `bun run db:generate`    | Generate a SQL migration after editing the schema                     |
| `bun run db:migrate:run` | Apply migrations (also done on boot)                                  |
| `bun run db:seed`        | Insert missing defaults (also done on boot)                           |
| `bun run db:studio`      | Drizzle Studio                                                        |
| `bun run check`          | ESLint + TypeScript                                                   |
| `bun run test`           | Security and behavior regression tests (no live database or AI calls) |
| `bun run format:check`   | Check formatting of the active application                            |
| `bun audit`              | Audit the installed dependency versions                               |

If a Bun launcher substitutes Bun for Node and Next.js build workers fail, run
`node node_modules/next/dist/bin/next build` with Node 22. Docker already runs Next.js on Node.

See [architecture and maintenance](docs/architecture.md) for module boundaries and verification.

### Shared workspaces

Open **Workspaces** in the sidebar (also linked from Settings) to create a Family, Fund, or Other
workspace. Each user can belong to several workspaces. These purposes are labels; all use the same
membership and account-sharing permissions:

- **Owner:** manages workspace settings, invitations, member roles, and ownership transfer;
  can revoke any account share.
- **Member:** views shared accounts and shares/unshares their own accounts.
- **Viewer:** views shared accounts without sharing accounts or managing membership.
- Financial edits, snapshots, reconciliation, merchant rules, and imports remain restricted to
  the account owner in Personal view. Workspace ownership does not grant financial write access.

Use **Sharing & members** to choose accounts and generate an email-bound invitation link. Links
are handed over directly, work once, and expire after seven days; no outgoing email is needed.
Existing users sign in and explicitly join. New users can register from the workspace invitation
and join as a normal app user, then complete the existing two-factor enrollment requirement.
Reissuing or revoking an invitation invalidates the old link. Ownership transfer revokes pending
invitations. A member must receive a new invitation after being removed.

Everyone in a workspace sees all of its shared accounts, including their balances, holdings and
transaction history. Use separate workspaces for separate audiences. Account sharing does not
share uploaded statements, passwords, API keys, or other private accounts. Demoting a member to
Viewer, removing them, or leaving deletes their shares. Deleting a workspace retains personal
accounts and financial history. Owners must transfer ownership or delete the workspace before
leaving. The account owner can always stop sharing; the workspace owner can also revoke shares.

Personal and shared routes/query keys are separate. The workspace selector returns to Personal
view or switches audience. Membership and account grants are checked by the server on every
financial request; visible shared pages refresh every 15 seconds and on window focus. Shared
account detail pages are read-only, including for their owner; edit from Personal view.

The dashboard counts each account once, omits archived accounts from combined value, uses the
workspace display currency, and reports missing FX rates and unpriced holdings. Spending remains
grouped by its original currency and excludes marked transfers. Snapshot dates can differ among
accounts.

**Fund extension:** a Fund workspace currently provides shared portfolio visibility. Its totals
represent whole accounts, not an investor's stake. The reusable foundation is `workspace`,
`workspace_member`, and `workspace_account_share`, with centralized membership permissions in
`src/server/modules/workspaces/permissions.ts` and account reads in `src/server/lib/access.ts`.
Future contributions, withdrawals, investor allocations, and per-investor reports should be
separate workspace-scoped records with their own permissions; do not infer capital ownership
from a login, account `ownerId`, or workspace role. See [workspace design](docs/workspaces.md).

The additive migration runs on application startup; it creates no default memberships or shares.
Existing records remain private. Run `bun run check`, `bun run test`, and `bun run build` to verify
changes. Tests apply the migration chain to disposable Postgres-compatible databases and exercise
sharing isolation, invitations, revocation, role changes, ownership transfer, and read-only UI.

`bun run build` explicitly launches the Next.js compiler with Node. Bun remains the package
manager and test runner. The Snap Bun wrapper on some Linux systems removes NVM Node from
`PATH`, causing Next workers to fall back to Bun and fail during page collection. With that
installation, preserve the normal Node path by invoking the Bun binary directly, for example:
`/snap/bun-js/current/_bun/bin/bun run build`.
