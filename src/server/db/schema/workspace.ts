import {
  foreignKey,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "./_columns";
import { user } from "./auth";
import { financialAccount } from "./finance";

export const workspaceKind = pgEnum("workspace_kind", [
  "family",
  "fund",
  "custom",
]);
export const workspaceMemberRole = pgEnum("workspace_member_role", [
  "member",
  "viewer",
]);

/** An audience for explicitly shared accounts. Ownership of financial records stays personal. */
export const workspace = pgTable("workspace", {
  id: id(),
  name: text("name").notNull(),
  kind: workspaceKind("kind").notNull().default("family"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  displayCurrency: varchar("display_currency", { length: 3 })
    .notNull()
    .default("SGD"),
  ...timestamps(),
});

export const workspaceMember = pgTable(
  "workspace_member",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: workspaceMemberRole("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("workspace_member_user_idx").on(t.userId),
  ],
);

export const workspaceInvitation = pgTable(
  "workspace_invitation",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: workspaceMemberRole("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedById: text("invited_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("workspace_invitation_workspace_idx").on(t.workspaceId)],
);

/** One grant per account/audience. Leaving the audience cascades the member's grants away. */
export const workspaceAccountShare = pgTable(
  "workspace_account_share",
  {
    workspaceId: uuid("workspace_id").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    sharedById: text("shared_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.accountId] }),
    foreignKey({
      columns: [t.workspaceId, t.sharedById],
      foreignColumns: [workspaceMember.workspaceId, workspaceMember.userId],
    }).onDelete("cascade"),
    index("workspace_account_share_member_idx").on(t.workspaceId, t.sharedById),
  ],
);
