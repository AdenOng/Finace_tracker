# Shared workspaces

## Model and extension boundary

A workspace is an audience for accounts, independent of users' application roles and financial
record ownership. `kind` (family/fund/custom) is descriptive and does not change permissions. A
user may participate in multiple audiences, and an account may be shared with multiple audiences.
The account and its financial records remain stored once under their original `ownerId`.

`workspace.ownerId` identifies one manager. The manager also has a membership. Other memberships
have a member/viewer role. Manager status is derived from the workspace row rather than duplicated
in a second role field. Account shares have a unique `(workspaceId, accountId)` key and a composite
foreign key to the sharing member. Removing membership cascades shares. Workspace ownership
restricts deletion of the owning user until the workspace is transferred or deleted.

Financial read endpoints accept an optional explicit `workspaceId`. Omission means Personal.
`resolveWorkspaceScope` verifies membership and loads the display currency. `readableAccount`
uses SQL EXISTS to check the current membership, grant, and record owner, without widening access
to all accounts belonging to someone. The query yields each financial record once, even when its
account is shared with several audiences. `latestHoldings` independently enforces this scope when
loading snapshots; child positions/cash are selected only through authorized snapshots.

`writableBy` remains personal. The sharing feature deliberately does not grant delegated financial
writes. If delegated management is introduced later, add explicit account write grants, record the
actor separately from the record custodian, and enforce reconciliation locks for all writers.
Membership management and grant changes are centralized in `requireWorkspace`; mutations lock
the workspace before checking permissions to serialize removal, role changes, grants and transfers.

Do not treat `ownerId` as beneficial ownership of a fund. A future fund module can attach
contribution/withdrawal records, unit holdings, valuation periods, and investor report grants to
workspaces and members. Investors who should see different information need separate audiences
or an explicit report permission model. Current viewers see whole shared accounts and history.
Add those tables and permissions when those features are implemented, rather than putting empty
ledger fields or arbitrary resource types in the sharing system now.

## Invitations and lifecycle

Only the workspace manager issues/revokes email-bound, seven-day tokens. Only token hashes are
stored. New users may register with the workspace token; they always receive app role `user`.
Registration consumes membership through the same helper as existing users' explicit acceptance.
Matching the invited email is required. New users follow the deployment's normal 2FA enrollment;
existing users must finish required enrollment before accepting through tRPC. A sign-in redirect
through two-factor verification preserves the invitation destination.

Acceptance locks the workspace then the invitation and rechecks expiry/revocation/consumption.
Reissuing a link revokes older pending links for that audience/email. Existing membership is never
changed by an invitation. Role changes require the manager's explicit action. Transfers revoke
all pending links, and the new owner is a member. Removing someone revokes pending invitations
for their email and cascades their shares. Demotion to viewer also deletes their shares. The owner
cannot leave or be demoted until they transfer ownership; deleting a workspace cascades only its
memberships, grants and invitations.

Shared UI queries include the audience in their cache keys, avoid placeholder data from another
audience, hide financial content on permission errors, and refresh every 15 seconds and on focus.
Membership/share mutations invalidate queries. Sign-out, registration, and successful sign-in
clear the query cache so account and audience data do not carry across users in the same browser. Server access checks are authoritative; revocation
cannot erase information someone already viewed or copied.

Audit entries record workspace actions, actor IDs, and affected IDs/roles. They contain no invite
secrets or financial amounts. Original statements, extraction jobs, private providers, credentials,
user settings and merchant rules retain their personal permissions.

## Verification

The finance router tests run the real migration chain and real SQL against disposable PGlite.
They cover personal/workspace isolation, cross-audience and admin isolation, forbidden financial
writes and bulk edits, current grants on previously resolved scopes, membership removal, role
changes, transfer/deletion, duplicate accounting, missing FX/prices, archive behavior and invitation
lifecycle. UI tests cover actual shared account and viewer markup and distinct query keys.

For browser verification use a disposable Postgres database and fresh auth/encryption keys.
Exercise real registration and 2FA, create/share accounts, accept invitations from another browser
session, attempt prohibited mutations via HTTP, revoke membership, and verify private/removed
accounts are inaccessible. Never seed test users or financial data into the personal database.

Verified on 2026-10-09 with Bun 1.3.9, Node 22.23.1, and the installed Next.js 15.5.27:

- Frozen dependency install, lint/TypeScript check, and all 74 automated tests pass.
- Production build passes using the direct Bun binary with Node on PATH (the local Snap wrapper
  removes the NVM Node path; the README documents the workaround).
- Twelve browser/HTTP checks pass against disposable Postgres 17: real signup and required 2FA;
  owner workspace creation/sharing/invitations; invited registration as an ordinary app user;
  private-account exclusion; read-only shared detail and forbidden HTTP writes; invitation replay
  rejection; separate fund audience isolation; automatic unshare/removal updates on an open page;
  mobile viewport fit; same-browser user-change cache isolation; existing-user invitation return
  through TOTP verification; and absence of browser runtime errors.
- Running migrations and insert-only bootstrap again produces zero new defaults and no errors.
  The test server and disposable database were removed after verification.
