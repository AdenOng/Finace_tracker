# Architecture and maintenance

Finfolio is the active application at the repository root. The Python API/CLI in
`finance_tracker/` and Vite app in `frontend/` are archived implementations with separate
dependencies. They are excluded from the Finfolio image and application checks.

## Module boundaries

- `src/app/`: routes, layouts and HTTP boundaries. Validate requests here and delegate
  application work to server modules.
- `src/components/`: reusable UI and feature components. Client components import server
  types with `import type`; server-only code stays behind the Next.js server boundary.
- `src/server/api/`: tRPC context, authentication/authorization middleware, and domain routers.
  Use `adminProcedure` for platform catalog operations and `protectedProcedure` for financial
  data. The Settings enrollment flow deliberately permits signed-in users awaiting 2FA.
- `src/server/auth/`: Better Auth configuration, invitation handling and initial-admin setup.
- `src/server/db/`: domain schema, migrations and insert-only seeding. Financial values use
  NUMERIC and retain their original currencies. Per-user queries use the access scope from
  `src/server/lib/access.ts`; the platform catalog is shared and managed by admins.
- `src/server/modules/llm/`: provider adapters, platform-provider lookup and safe error messages.
  Admin provider operations always filter out user-owned credentials.
- `src/server/modules/extraction/`: bounded upload parsing, document preparation, prompts and
  structured-output validation. Extraction never writes to financial tables. PDF resources
  are released after preparation.
- `src/server/modules/catalog/`: reusable category-tree rules.
- `src/server/lib/`: server encryption and access helpers. The pure secret codec accepts an
  explicit key, while the server-only wrapper reads validated configuration. The AES-GCM
  `v1` envelope remains compatible with existing records encrypted with a valid configured key.
- `src/lib/`: shared presentation and input helpers. Monetary strings are formatted with
  decimal arithmetic rather than converted to floating-point numbers.

## Private configuration and files

Keep `.env`, database contents, credentials, statement uploads, exports and backups out of Git.
`.env.example` contains placeholders only. Both development and production require an auth
secret and a random, base64-encoded 32-byte encryption key. Generate each with
`openssl rand -base64 32`. Retain the encryption key when moving an installation; changing it
does not re-encrypt existing provider credentials.

The legacy Python tracker requires `DB_PASSWORD` from local configuration or the environment;
it no longer supplies a built-in database password. Its setup guide is archived separately.

Git ignores dependencies, build output, private data and local tooling caches. Docker also
excludes private files and the legacy implementations. Dependencies and build caches should
be recreated from `bun.lock`, not committed.

## Verification

```bash
bun install --frozen-lockfile
bun run check
bun run test
bun run format:check
bun run build
bun audit
```

Tests use an in-memory PostgreSQL engine (PGlite), the real SQL migrations and tRPC routers,
and throwaway configuration. They do not connect to the local production database or contact
an AI provider. Coverage includes provider ownership, role/2FA access, encryption and
tampering, safe error responses, upload limits, category hierarchy and decimal display.

The dependency overrides keep transitive esbuild and PostCSS versions above the versions
flagged by the package audit. Review and remove overrides when upstream constraints allow
the patched versions without them.

Before committing, inspect `git diff --cached`, verify private paths with `git check-ignore`,
and scan staged content and repository history with a secret scanner, for example:

```bash
gitleaks git --pre-commit --staged --redact .
gitleaks git --redact .
```

These checks cover the current phase-one implementation. Live provider behavior, hardware
passkey flows, the future financial import pipeline, and the archived Python/Vite dependency
trees need their own integration and security validation before deployment or reuse.
