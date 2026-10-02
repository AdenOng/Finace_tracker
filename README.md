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

| Area | State |
| --- | --- |
| Auth: invite-only sign-up, first user is admin, TOTP two-step, passkeys, rate limits | Done |
| Admin console: users and invitations, brokers & banks, categories, AI providers | Done |
| LLM layer: opencode / OpenAI-compatible / Anthropic adapters, structured output | Done |
| Extraction: PDF text layer, scanned-PDF rasterising, admin playground | Done |
| Accounts, holdings, spending views | Next |
| Import pipeline: upload → background job → review & dedupe → commit | Next |
| Broker sync (IBKR Flex, Longbridge OpenAPI, moomoo OpenD), live prices, FX, net-worth history | Later |

The full database schema for the later phases already exists (`src/server/db/schema`).

## Quick start (local development)

```bash
cd /path/to/Finace_tracker
cp -n .env.example .env       # keep an existing .env; fill in secrets for a new install
bun install
docker compose up -d db       # Postgres on 127.0.0.1:${POSTGRES_PORT:-5432}
bun run dev                   # migrations + default data are applied on boot
```

Open http://localhost:3000. The first visit goes to `/setup` and creates the admin account.
With `REQUIRE_TWO_FACTOR=true` (the default) everyone must enrol an authenticator app before the
rest of the app unlocks.

## Running everything in Docker

```bash
opencode auth login           # on the host, once — signs in to your opencode Go subscription
docker compose up -d --build  # db, opencode, app, nightly backup
```

| Service | Purpose |
| --- | --- |
| `db` | Postgres 17, volume `pgdata` |
| `opencode` | `opencode serve`, headless, all tools disabled, basic-auth protected. Mounts your host `auth.json` |
| `app` | Next.js standalone server. Runs migrations and seeding on start |
| `backup` | `pg_dump` once a day into `./backups`, kept 14 days |
| `cloudflared` | Optional (`--profile tunnel`). If you already run a tunnel, point it at `http://<host>:3000` |

Set `BETTER_AUTH_URL` to the public Cloudflare hostname in production so cookies and passkeys
work. Putting Cloudflare Access in front of `/admin` is a cheap extra layer.

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
    api/routers/           tRPC routers (catalog, settings, admin/*)
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
  pipeline will stage it for review, dedupe it (file hash → row fingerprint → fuzzy match) and only
  then commit. Category keys are a dynamic enum of the active categories, so the model cannot
  invent one.
- **Scanned PDFs are rendered to page images**, because most vision models accept images but not
  PDFs. PDFs with a text layer send the text instead, which is cheaper and more accurate.
- **Per-user data, household-ready.** Every financial row has `owner_id`; reads go through
  `readableBy(scope, …)`. A future household view only has to widen `resolveAccessScope`.
- **Money is `NUMERIC`**, surfaced as strings; each row keeps its original currency and conversion
  to the display currency happens at read time.

## Scripts

| Command | |
| --- | --- |
| `bun run dev` | Dev server |
| `bun run db:generate` | Generate a SQL migration after editing the schema |
| `bun run db:migrate:run` | Apply migrations (also done on boot) |
| `bun run db:seed` | Insert missing defaults (also done on boot) |
| `bun run db:studio` | Drizzle Studio |
| `bun run check` | ESLint + TypeScript |
| `bun run test` | Security and behavior regression tests (no live database or AI calls) |
| `bun run format:check` | Check formatting of the active application |
| `bun audit` | Audit the installed dependency versions |

See [architecture and maintenance](docs/architecture.md) for module boundaries and verification.
