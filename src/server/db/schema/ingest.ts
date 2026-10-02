/**
 * Document ingestion pipeline: uploaded file → extraction job (LLM) → staged rows the user reviews
 * → committed into finance tables. Nothing the LLM produces is written to finance tables directly.
 */
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  date,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "./_columns";
import { llmProvider } from "./ai";
import { user } from "./auth";
import { institution } from "./catalog";
import { financialAccount } from "./finance";

export const documentKind = pgEnum("document_kind", [
  "bank_statement",
  "card_statement",
  "brokerage_statement",
  "trade_confirmation",
  "screenshot",
  "csv",
  "other",
]);

export const document = pgTable(
  "document",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => financialAccount.id, {
      onDelete: "set null",
    }),
    institutionId: uuid("institution_id").references(() => institution.id, {
      onDelete: "set null",
    }),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** SHA-256 of the file bytes; the same file can never be imported twice by one user. */
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    kind: documentKind("kind").default("other").notNull(),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    ...timestamps(),
  },
  (t) => [unique("document_owner_sha_uq").on(t.ownerId, t.sha256)],
);

export const jobStatus = pgEnum("job_status", [
  "queued",
  "running",
  "needs_review",
  "completed",
  "failed",
  "cancelled",
]);

export const extractionJob = pgTable(
  "extraction_job",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").references(() => llmProvider.id, {
      onDelete: "set null",
    }),
    model: text("model"),
    status: jobStatus("status").default("queued").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    /** Validated structured output, kept for audit and re-staging. */
    result: jsonb("result"),
    error: text("error"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index("extraction_job_owner_status_idx").on(t.ownerId, t.status)],
);

export const stagedRowKind = pgEnum("staged_row_kind", [
  "transaction",
  "investment_transaction",
  "position",
  "cash_balance",
]);

export const matchStatus = pgEnum("match_status", [
  "new",
  "duplicate",
  "possible_duplicate",
]);

export const stagedDecision = pgEnum("staged_decision", [
  "pending",
  "accept",
  "skip",
]);

export const stagedRow = pgTable(
  "staged_row",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => extractionJob.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: stagedRowKind("kind").notNull(),
    /** Editable row payload; shape depends on `kind` (see modules/extraction/schemas.ts). */
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    matchStatus: matchStatus("match_status").default("new").notNull(),
    matchedRecordId: uuid("matched_record_id"),
    decision: stagedDecision("decision").default("pending").notNull(),
    committedRecordId: uuid("committed_record_id"),
    ...timestamps(),
  },
  (t) => [index("staged_row_job_idx").on(t.jobId)],
);
