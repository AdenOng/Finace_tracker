# Agent Guidelines for Finfolio

## Active project
- Work from the `Finace_tracker` repository root.
- The active app is Finfolio: Next.js App Router, TypeScript, tRPC, Drizzle/Postgres,
  Better Auth, and Tailwind. Use Bun and the root `package.json`.
- The sibling `../portfolio_website` directory is the original recovery copy. Do not
  implement new finance features there.
- `finance_tracker/` and `frontend/` are the preserved legacy Python/React tracker,
  not the active Finfolio backend or frontend. Its original agent instructions
  are in `docs/legacy-python-AGENTS.md` and its guide is in
  `docs/legacy-python-tracker.md`. Apply those instructions when editing legacy code.

## Commands
```bash
bun install --frozen-lockfile
bun run dev
bun run check
bun run test
bun run build
bun run db:generate
bun run db:migrate:run
```

- Local Postgres can be started with `docker compose up -d db`.
- Migrations and insert-only default seeding run on application startup.
- Preserve the existing `.env`, `APP_ENCRYPTION_KEY`, database, and Compose project
  name (`finfolio`) when changing deployment paths. Never commit private config.

## Key locations
- UI/routes: `src/app/`, `src/components/`, `src/styles/`
- tRPC: `src/server/api/routers/`, `src/server/api/root.ts`
- Database: `src/server/db/schema/`, `drizzle/`, `src/server/db/bootstrap.ts`
- Auth: `src/server/auth/`
- LLM/extraction: `src/server/modules/llm/`, `src/server/modules/extraction/`
- Default data packs: `src/presets/`
- Configuration: `src/env.js`, `.env.example`, `docker-compose.yml`

## Conventions
- Follow existing TypeScript and component patterns; keep changes minimal.
- Keep financial queries scoped to the user through `src/server/lib/access.ts`.
- Keep money in NUMERIC database columns and surface it as strings.
- LLM extraction returns schema-validated data for review; it must not write
  directly to finance tables.
- Keep secrets encrypted and private financial uploads out of source control.
- Update README.md when adding user-facing commands or configuration.
- Run `bun run check` and appropriate build/behavior checks after changes.
