import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHTTPServer } from "@trpc/server/adapters/standalone";

import { api, TRPCReactProvider } from "../src/trpc/react";

import { todayIso } from "../src/lib/dates";
import type { Database } from "../src/server/db";
import * as schema from "../src/server/db/schema";
import { exchangeRates } from "../src/server/modules/portfolio/exchange-rates";
import { quotes, type Quote } from "../src/server/modules/portfolio/quotes";
import {
  convertAmounts,
  ratesFromRows,
  sumByCurrency,
  valuePosition,
} from "../src/server/modules/portfolio/valuation";

const engine = new PGlite();
const ratesRequest = spyOn(exchangeRates, "latest").mockResolvedValue([]);
const db = drizzle(engine, { schema });
await mock.module("server-only", () => ({}));
await mock.module("~/server/db", () => ({ db }));
await mock.module("~/server/auth/config", () => ({
  auth: { api: { getSession: async () => null } },
}));
const { accountsRouter } = await import("../src/server/api/routers/accounts");
const { portfolioRouter } = await import("../src/server/api/routers/portfolio");
const { spendingRouter } = await import("../src/server/api/routers/spending");
const { merchantRulesRouter } =
  await import("../src/server/api/routers/merchant-rules");
const { reconciliationRouter } =
  await import("../src/server/api/routers/reconciliation");
const { workspacesRouter } =
  await import("../src/server/api/routers/workspaces");
const { settingsRouter } = await import("../src/server/api/routers/settings");
const { preset } = await import("../src/server/lib/preset");
const { findPendingWorkspaceInvitation, acceptWorkspaceInvitation } =
  await import("../src/server/modules/workspaces/invitations");
const { resolveAccessScope, resolveWorkspaceScope } =
  await import("../src/server/lib/access");
const { latestHoldings } =
  await import("../src/server/modules/portfolio/holdings");
const { createTRPCRouter } = await import("../src/server/api/trpc");
const { backfillPriceHistory, coversRange, refreshQuotes } =
  await import("../src/server/modules/portfolio/market-health");
const { cachedInstanceSettings, setCachedInstanceSettings } =
  await import("../src/server/lib/instance-settings-cache");
const { backfillFrom, estimatedTimeline, recordNetWorth } =
  await import("../src/server/modules/portfolio/history");

function contextFor(id: string) {
  return {
    db: db as unknown as Database,
    headers: new Headers(),
    session: {
      session: {
        id: `session-${id}`,
        userId: id,
        token: `synthetic-token-${id}`,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
        ipAddress: null,
        userAgent: null,
        impersonatedBy: null,
      },
      user: {
        id,
        name: `Example ${id}`,
        email: `${id}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        image: null,
        role: "user",
        banned: false,
        banReason: null,
        banExpires: null,
        twoFactorEnabled: true,
      },
    },
  };
}

const callers = (id: string) => ({
  workspaces: workspacesRouter.createCaller(contextFor(id)),
  accounts: accountsRouter.createCaller(contextFor(id)),
  portfolio: portfolioRouter.createCaller(contextFor(id)),
  spending: spendingRouter.createCaller(contextFor(id)),
  rules: merchantRulesRouter.createCaller(contextFor(id)),
  reconciliation: reconciliationRouter.createCaller(contextFor(id)),
});
const alice = callers("alice");
const bob = callers("bob");
const charlie = callers("charlie");

let groceriesId: string;

beforeAll(async () => {
  const journal = (await Bun.file(
    new URL("../drizzle/meta/_journal.json", import.meta.url),
  ).json()) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    await engine.exec(
      await Bun.file(new URL(`../drizzle/${tag}.sql`, import.meta.url)).text(),
    );
  }
  await db.insert(schema.user).values([
    { id: "alice", name: "Example Alice", email: "alice@example.com" },
    { id: "bob", name: "Example Bob", email: "bob@example.com" },
    { id: "charlie", name: "Example Charlie", email: "charlie@example.com" },
  ]);
  await db.insert(schema.currency).values([
    { code: "SGD", name: "Singapore dollar", symbol: "S$" },
    { code: "USD", name: "US dollar", symbol: "US$" },
  ]);
  const [groceries] = await db
    .insert(schema.category)
    .values({ key: "groceries", name: "Groceries" })
    .returning();
  groceriesId = groceries!.id;
}, 30_000);
beforeEach(async () => {
  ratesRequest.mockReset();
  ratesRequest.mockResolvedValue([]);
  await engine.exec(
    "TRUNCATE TABLE workspace, audit_log, financial_account, security, fx_rate, user_settings, merchant_rule, networth_snapshot CASCADE",
  );
});
afterAll(async () => {
  ratesRequest.mockRestore();
  await engine.close();
});

const bank = {
  name: "Everyday",
  type: "checking" as const,
  institutionId: null,
  currency: "SGD",
  last4: "",
  notes: "",
};
const broker = { ...bank, name: "Broker", type: "brokerage" as const };

describe("net worth history", () => {
  test("each entry date adds up every account's latest entry per group, backfilling accounts not yet entered", () => {
    const amount = (value: string, currency = "SGD") => ({
      amount: value,
      currency,
    });
    const cashEntry = (
      accountId: string,
      group: "banking" | "investments",
      asOf: string,
      ...cash: ReturnType<typeof amount>[]
    ) => ({ accountId, group, asOf, positions: [], cash });
    const tally = (
      backfilled: boolean,
      ...amounts: ReturnType<typeof amount>[]
    ) => ({
      amounts,
      unpriced: 0,
      backfilled,
    });
    expect(
      estimatedTimeline([
        cashEntry("a", "banking", "2026-01-31", amount("100")),
        cashEntry("b", "investments", "2026-02-28", amount("5", "USD")),
        cashEntry(
          "c",
          "banking",
          "2026-02-28",
          amount("20"),
          amount("1", "USD"),
        ),
        cashEntry("a", "banking", "2026-03-31", amount("150")),
        // A second entry on the same day replaces the first.
        cashEntry("a", "banking", "2026-03-31", amount("160")),
      ]),
    ).toEqual([
      // Accounts b and c are assumed to have held their first balances before they were entered.
      {
        date: "2026-01-31",
        groups: {
          banking: tally(true, amount("120"), amount("1", "USD")),
          investments: tally(true, amount("5", "USD")),
        },
      },
      {
        date: "2026-02-28",
        groups: {
          banking: tally(false, amount("120"), amount("1", "USD")),
          investments: tally(false, amount("5", "USD")),
        },
      },
      {
        date: "2026-03-31",
        groups: {
          banking: tally(false, amount("180"), amount("1", "USD")),
          investments: tally(false, amount("5", "USD")),
        },
      },
    ]);
  });

  test("market closes fill the days between and up to a year before the first entry", () => {
    const holding = (securityId: string, quantity: string, price: string) => ({
      securityId,
      currency: "USD",
      quantity,
      statementPrice: price,
      statementValue: null,
    });
    const close = (date: string, value: string, currency = "USD") => ({
      date,
      close: value,
      currency,
    });
    const timeline = estimatedTimeline(
      [
        {
          accountId: "broker",
          group: "investments",
          asOf: "2026-03-02",
          positions: [holding("vt", "10", "100"), holding("fund", "1", "50")],
          cash: [{ amount: "7", currency: "USD" }],
        },
        {
          accountId: "broker",
          group: "investments",
          asOf: "2026-03-09",
          positions: [holding("vt", "20", "110")],
          cash: [],
        },
      ],
      new Map([
        [
          "vt",
          [
            // More than a year before the first entry: not drawn.
            close("2025-02-27", "60"),
            close("2025-03-03", "80"),
            close("2026-03-04", "105"),
            // Older than the second entry, so its statement price wins on that day.
            close("2026-03-06", "108"),
            close("2026-03-10", "112"),
          ],
        ],
        // Implausibly far from the statement price: probably a different instrument.
        ["fund", [close("2026-03-04", "5000")]],
      ]),
    );
    expect(
      timeline.map(({ date, groups: { investments: p } }) => [
        date,
        p!.amounts,
        p!.unpriced,
        p!.backfilled,
      ]),
    ).toEqual([
      ["2025-03-03", [{ amount: "857", currency: "USD" }], 0, true],
      ["2026-03-02", [{ amount: "1057", currency: "USD" }], 0, false],
      ["2026-03-04", [{ amount: "1107", currency: "USD" }], 0, false],
      ["2026-03-06", [{ amount: "1137", currency: "USD" }], 0, false],
      ["2026-03-09", [{ amount: "2200", currency: "USD" }], 0, false],
      ["2026-03-10", [{ amount: "2240", currency: "USD" }], 0, false],
    ]);
    expect(backfillFrom("2026-03-02")).toBe("2025-03-02");
  });

  test("a close in another currency is used without comparing it to the statement price", () => {
    // A coin recorded in yen is priced in US dollars: ¥15,000,000 against US$100,000 is no mismatch.
    const [point] = estimatedTimeline(
      [
        {
          accountId: "wallet",
          group: "investments",
          asOf: "2026-03-02",
          positions: [
            {
              securityId: "btc",
              currency: "JPY",
              quantity: "0.1",
              statementPrice: "15000000",
              statementValue: null,
            },
          ],
          cash: [],
        },
      ],
      new Map([
        ["btc", [{ date: "2026-03-02", close: "100000", currency: "USD" }]],
      ]),
    );
    expect(point!.groups.investments!.amounts).toEqual([
      { amount: "10000", currency: "USD" },
    ]);
  });

  test("estimates days before recording began from entries, then uses recorded days", async () => {
    const savings = await alice.accounts.create(bank);
    const brokerage = await alice.accounts.create(broker);
    await alice.portfolio.recordSnapshot({
      accountId: savings.id,
      asOf: "2026-08-01",
      positions: [],
      cash: [{ currency: "SGD", amount: "100" }],
    });
    await alice.portfolio.recordSnapshot({
      accountId: brokerage.id,
      asOf: "2026-09-01",
      cash: [],
      positions: [
        {
          symbol: "VT",
          exchange: "ARCX",
          name: "",
          assetClass: "etf",
          currency: "USD",
          quantity: "10",
          averageCost: null,
          price: null,
          value: "1000",
        },
      ],
    });
    await db.insert(schema.fxRate).values({
      base: "SGD",
      quote: "USD",
      date: "2026-09-01",
      rate: "0.8",
      source: "test",
    });

    // The brokerage was entered later; before that it is backfilled from its first entry.
    expect((await alice.portfolio.netWorthHistory()).points).toEqual([
      {
        date: "2026-08-01",
        total: "1350",
        partial: false,
        estimated: true,
        backfilled: true,
      },
      {
        date: "2026-09-01",
        total: "1350",
        partial: false,
        estimated: true,
        backfilled: false,
      },
    ]);

    expect(
      await recordNetWorth(db as unknown as Database, "alice", "2026-10-10"),
    ).toBe(true);
    // A later run the same day replaces that day's figure.
    expect(
      await recordNetWorth(db as unknown as Database, "alice", "2026-10-10"),
    ).toBe(true);
    await alice.portfolio.recordSnapshot({
      accountId: savings.id,
      asOf: "2026-10-01",
      positions: [],
      cash: [{ currency: "SGD", amount: "999" }],
    });
    // Recorded days already include what was known then; a later entry adds no estimate.
    await alice.portfolio.recordSnapshot({
      accountId: savings.id,
      asOf: "2026-10-15",
      positions: [],
      cash: [{ currency: "SGD", amount: "5" }],
    });
    const history = await alice.portfolio.netWorthHistory();
    expect(history.currency).toBe("SGD");
    // A backdated entry from before recording began still shapes the estimate.
    expect(history.points.map((p) => [p.date, p.total, p.backfilled])).toEqual([
      ["2026-08-01", "1350", true],
      ["2026-09-01", "1350", false],
      ["2026-10-01", "2249", false],
      ["2026-10-10", "1350", false],
    ]);
    expect(history.points.map((p) => p.estimated)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(await db.$count(schema.networthSnapshot)).toBe(1);

    // Nothing to record for someone without entries, and nobody sees anyone else's history.
    expect(
      await recordNetWorth(db as unknown as Database, "bob", "2026-10-10"),
    ).toBe(false);
    expect((await bob.portfolio.netWorthHistory()).points).toEqual([]);
  });

  test("each account group has its own history, CPF and SRS included even when not counted", async () => {
    const settings = settingsRouter.createCaller(contextFor("alice"));
    const savings = await alice.accounts.create(bank);
    const brokerage = await alice.accounts.create(broker);
    const cpf = await alice.accounts.create({
      ...bank,
      name: "CPF",
      type: "cpf",
    });
    await alice.portfolio.recordSnapshot({
      accountId: savings.id,
      asOf: "2026-08-01",
      positions: [],
      cash: [{ currency: "SGD", amount: "100" }],
    });
    await alice.portfolio.recordSnapshot({
      accountId: cpf.id,
      asOf: "2026-09-01",
      positions: [],
      cash: [{ currency: "SGD", amount: "600", bucket: "oa" }],
    });
    await alice.portfolio.recordSnapshot({
      accountId: brokerage.id,
      asOf: "2026-09-01",
      cash: [{ currency: "USD", amount: "80" }],
      positions: [],
    });
    await db.insert(schema.fxRate).values({
      base: "SGD",
      quote: "USD",
      date: "2026-09-01",
      rate: "0.8",
      source: "test",
    });
    await settings.setCountCpfSrs({ count: false });
    await recordNetWorth(db as unknown as Database, "alice", "2026-10-10");

    const history = await alice.portfolio.netWorthHistory();
    const view = (points: typeof history.points) =>
      points.map((p) => [p.date, p.total, p.estimated, p.backfilled]);
    // The total leaves CPF out: S$100 of savings and US$80 (S$100) at the broker.
    expect(view(history.points)).toEqual([
      ["2026-08-01", "200", true, true],
      ["2026-09-01", "200", true, false],
      ["2026-10-10", "200", false, false],
    ]);
    expect(view(history.groups.banking)).toEqual([
      ["2026-08-01", "100", true, false],
      ["2026-09-01", "100", true, false],
      ["2026-10-10", "100", false, false],
    ]);
    expect(view(history.groups.investments)).toEqual([
      ["2026-08-01", "100", true, true],
      ["2026-09-01", "100", true, false],
      ["2026-10-10", "100", false, false],
    ]);
    expect(view(history.groups.cpf_srs)).toEqual([
      ["2026-08-01", "600", true, true],
      ["2026-09-01", "600", true, false],
      ["2026-10-10", "600", false, false],
    ]);
    // Bob sees none of it.
    expect((await bob.portfolio.netWorthHistory()).groups).toEqual({
      investments: [],
      banking: [],
      cpf_srs: [],
    });
  });

  test("CPF/SRS toggles normalize estimated and recorded history without changing saved figures", async () => {
    const settings = settingsRouter.createCaller(contextFor("alice"));
    const savings = await alice.accounts.create(bank);
    const cpf = await alice.accounts.create({
      ...bank,
      name: "CPF",
      type: "cpf",
    });
    const srs = await alice.accounts.create({
      ...bank,
      name: "SRS",
      type: "srs",
    });
    for (const [account, amount, bucket] of [
      [savings, "100", null],
      [cpf, "600", "oa"],
      [srs, "300", null],
    ] as const) {
      await alice.portfolio.recordSnapshot({
        accountId: account.id,
        asOf: "2026-09-01",
        positions: [],
        cash: [{ currency: "SGD", amount, bucket }],
      });
    }
    await recordNetWorth(db as unknown as Database, "alice", "2026-10-17");
    await settings.setCountCpfSrs({ count: false });
    await recordNetWorth(db as unknown as Database, "alice", "2026-10-18");
    const saved = await db.select().from(schema.networthSnapshot);

    for (const count of [false, true, false]) {
      await settings.setCountCpfSrs({ count });
      const worth = await alice.portfolio.netWorth();
      const history = await alice.portfolio.netWorthHistory();
      const expected = count ? "1000" : "100";
      expect(worth.total).toBe(expected);
      expect(history.points).toHaveLength(3);
      expect(history.points.map((p) => p.total)).toEqual([
        expected,
        expected,
        expected,
      ]);
      expect(history.points.every((p) => !p.partial)).toBe(true);
    }
    expect(await db.select().from(schema.networthSnapshot)).toEqual(saved);

    await settings.setDisplayCurrency({ code: "USD" });
    await db.insert(schema.fxRate).values({
      base: "SGD",
      quote: "USD",
      date: "2026-10-19",
      rate: "0.8",
      source: "test",
    });
    expect(
      (await alice.portfolio.netWorthHistory()).points.map((p) => p.total),
    ).toEqual(["80", "80", "80"]);
  });

  test("including previously excluded SRS keeps recorded totals partial when rates are missing", async () => {
    const settings = settingsRouter.createCaller(contextFor("alice"));
    const savings = await alice.accounts.create(bank);
    const srs = await alice.accounts.create({
      ...bank,
      name: "SRS",
      type: "srs",
    });
    for (const [account, currency, amount] of [
      [savings, "SGD", "100"],
      [srs, "USD", "900"],
    ] as const) {
      await alice.portfolio.recordSnapshot({
        accountId: account.id,
        asOf: "2026-09-01",
        positions: [],
        cash: [
          { currency, amount },
          ...(account.id === srs.id ? [{ currency: "SGD", amount: "50" }] : []),
        ],
      });
    }
    await settings.setCountCpfSrs({ count: false });
    await recordNetWorth(db as unknown as Database, "alice", "2026-10-18");
    expect(
      (await alice.portfolio.netWorthHistory()).points.every((p) => !p.partial),
    ).toBe(true);
    await settings.setCountCpfSrs({ count: true });
    const expected = [
      {
        date: "2026-09-01",
        total: "150",
        partial: true,
        estimated: true,
        backfilled: false,
      },
      {
        date: "2026-10-18",
        total: "150",
        partial: true,
        estimated: false,
        backfilled: false,
      },
    ];
    expect((await alice.portfolio.netWorthHistory()).points).toEqual(expected);
    // Existing records lack the new completeness flag; don't claim their added amounts are complete.
    const [saved] = await db.select().from(schema.networthSnapshot);
    const legacyBreakdown = { ...saved!.breakdown };
    delete legacyBreakdown.cpfSrsPartial;
    await db
      .update(schema.networthSnapshot)
      .set({ breakdown: legacyBreakdown })
      .where(eq(schema.networthSnapshot.id, saved!.id));
    expect((await alice.portfolio.netWorthHistory()).points).toEqual(expected);
  });
});

describe("account access", () => {
  test("allows type changes only before any financial history exists", async () => {
    const empty = await alice.accounts.create(bank);
    await alice.accounts.update({ ...broker, id: empty.id });
    expect((await alice.accounts.get(empty)).type).toBe("brokerage");

    const withSnapshot = await alice.accounts.create(broker);
    await alice.portfolio.recordSnapshot({
      accountId: withSnapshot.id,
      asOf: "2026-10-01",
      positions: [],
      cash: [{ currency: "SGD", amount: "0" }],
    });
    const withSpending = await alice.accounts.create(bank);
    await spendingEntry(withSpending.id);
    const withInvestment = await alice.accounts.create(broker);
    await db.insert(schema.investmentTransaction).values({
      ownerId: "alice",
      accountId: withInvestment.id,
      type: "other",
      tradeDate: "2026-10-01",
      amount: "1",
      currency: "SGD",
      fingerprint: "test-investment",
    });
    for (const [account, original, changed] of [
      [withSnapshot, broker, bank],
      [withSpending, bank, broker],
      [withInvestment, broker, bank],
    ] as const) {
      await expect(
        alice.accounts.update({ ...changed, id: account.id }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await alice.accounts.update({
        ...original,
        id: account.id,
        notes: "Keep history",
      });
      expect(await alice.accounts.remove(account)).toEqual({
        outcome: "archived",
      });
    }
  });
  test("other users can neither see nor change an account", async () => {
    const { id } = await alice.accounts.create(bank);
    expect(await bob.accounts.list()).toHaveLength(0);
    await expect(bob.accounts.get({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      bob.accounts.update({ ...bank, id, name: "Taken" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(bob.accounts.remove({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      bob.spending.create({
        accountId: id,
        postedDate: "2026-10-01",
        description: "Not mine",
        merchant: null,
        amount: "-1",
        currency: null,
        categoryId: null,
        isTransfer: false,
        notes: null,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      bob.portfolio.recordSnapshot({
        accountId: id,
        asOf: "2026-10-01",
        positions: [],
        cash: [{ currency: "SGD", amount: "1" }],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await alice.accounts.get({ id })).name).toBe("Everyday");
  });

  test("an account with history is archived, an empty one deleted", async () => {
    const empty = await alice.accounts.create(bank);
    expect(await alice.accounts.remove(empty)).toEqual({ outcome: "deleted" });
    const used = await alice.accounts.create(bank);
    await alice.portfolio.recordSnapshot({
      accountId: used.id,
      asOf: "2026-10-01",
      positions: [],
      cash: [{ currency: "SGD", amount: "10" }],
    });
    expect(await alice.accounts.remove(used)).toEqual({ outcome: "archived" });
    const [row] = await alice.accounts.list();
    expect(row?.archivedAt).toBeInstanceOf(Date);
  });

  test("rejects unknown currencies", async () => {
    await expect(
      alice.accounts.create({ ...bank, currency: "XYZ" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("portfolio", () => {
  test("entry history supports editing and deleting current entries with conflict and owner protection", async () => {
    const account = await alice.accounts.create(broker);
    const entry = {
      accountId: account.id,
      asOf: "2026-09-30",
      positions: [],
      cash: [{ currency: "SGD", amount: "100" }],
    };
    const older = await alice.portfolio.addSnapshot(entry);
    const newer = await alice.portfolio.addSnapshot({
      ...entry,
      asOf: "2026-10-19",
      cash: [{ currency: "SGD", amount: "200" }],
    });
    await expect(
      alice.portfolio.addSnapshot({
        ...entry,
        cash: [{ currency: "SGD", amount: "999" }],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const history = await alice.portfolio.history({ accountId: account.id });
    expect(history.currentId).toBe(newer.id);
    expect(history.entries.map((r) => [r.id, r.cashCount, r.source])).toEqual([
      [newer.id, 1, "manual"],
      [older.id, 1, "manual"],
    ]);
    const detail = await alice.portfolio.snapshot({
      accountId: account.id,
      snapshotId: newer.id,
    });
    const bobAccount = await bob.accounts.create(broker);
    await expect(
      bob.portfolio.snapshot({
        accountId: bobAccount.id,
        snapshotId: newer.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      bob.portfolio.removeSnapshot({
        accountId: bobAccount.id,
        snapshotId: newer.id,
        version: detail.version,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const update = {
      snapshotId: newer.id,
      version: detail.version,
      entry: {
        ...entry,
        asOf: "2026-10-19",
        cash: [{ currency: "SGD", amount: "250" }],
      },
    };
    for (const op of [
      () => bob.portfolio.history({ accountId: account.id }),
      () =>
        bob.portfolio.snapshot({ accountId: account.id, snapshotId: newer.id }),
      () => bob.portfolio.updateSnapshot(update),
      () =>
        bob.portfolio.removeSnapshot({
          accountId: account.id,
          snapshotId: newer.id,
          version: detail.version,
        }),
    ])
      await expect(op()).rejects.toMatchObject({ code: "NOT_FOUND" });
    await alice.portfolio.updateSnapshot(update);
    expect((await alice.accounts.get(account)).holdings?.totals).toEqual([
      { currency: "SGD", amount: "250" },
    ]);
    await expect(alice.portfolio.updateSnapshot(update)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      alice.portfolio.removeSnapshot({
        accountId: account.id,
        snapshotId: newer.id,
        version: detail.version,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const changed = await alice.portfolio.snapshot({
      accountId: account.id,
      snapshotId: newer.id,
    });
    expect(changed.id).toBe(detail.id);
    expect(changed.version).not.toBe(detail.version);
    expect(
      (await alice.portfolio.history({ accountId: account.id })).entries[0]
        ?.adjusted,
    ).toBe(true);
    await expect(
      alice.portfolio.updateSnapshot({
        ...update,
        version: changed.version,
        entry: { ...update.entry, asOf: "2026-09-30" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (await alice.portfolio.history({ accountId: account.id })).entries,
    ).toHaveLength(2);
    await alice.portfolio.removeSnapshot({
      accountId: account.id,
      snapshotId: newer.id,
      version: changed.version,
    });
    expect((await alice.accounts.get(account)).holdings?.asOf).toBe(
      "2026-09-30",
    );
    expect((await alice.portfolio.netWorth()).total).toBe("100");
    const remaining = await alice.portfolio.snapshot({
      accountId: account.id,
      snapshotId: older.id,
    });
    await alice.portfolio.removeSnapshot({
      accountId: account.id,
      snapshotId: older.id,
      version: remaining.version,
    });
    expect((await alice.accounts.get(account)).holdings).toBeNull();
    expect(await db.select().from(schema.cashBalance)).toHaveLength(0);
  });

  test("history pagination is complete and archived entries can be viewed but not edited", async () => {
    const account = await alice.accounts.create(broker);
    for (let day = 1; day <= 25; day++)
      await alice.portfolio.addSnapshot({
        accountId: account.id,
        asOf: `2026-09-${String(day).padStart(2, "0")}`,
        positions: [],
        cash: [{ currency: "SGD", amount: String(day) }],
      });
    const page = await alice.portfolio.history({ accountId: account.id });
    expect(page.entries).toHaveLength(20);
    const next = await alice.portfolio.history({
      accountId: account.id,
      cursor: page.nextCursor!,
    });
    expect(next.entries).toHaveLength(5);
    expect(next.nextCursor).toBeNull();
    expect(
      new Set([...page.entries, ...next.entries].map((r) => r.id)).size,
    ).toBe(25);
    const selected = page.entries[0]!;
    await alice.accounts.remove(account);
    expect(
      (await alice.portfolio.history({ accountId: account.id })).entries,
    ).toHaveLength(20);
    expect(
      (
        await alice.portfolio.snapshot({
          accountId: account.id,
          snapshotId: selected.id,
        })
      ).id,
    ).toBe(selected.id);
    await expect(
      alice.portfolio.removeSnapshot({
        accountId: account.id,
        snapshotId: selected.id,
        version: selected.version,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("concurrent edits of the same reviewed entry succeed only once", async () => {
    const account = await alice.accounts.create(broker);
    const input = {
      accountId: account.id,
      asOf: "2026-09-30",
      positions: [],
      cash: [{ currency: "SGD", amount: "100" }],
    };
    const added = await alice.portfolio.addSnapshot(input);
    const detail = await alice.portfolio.snapshot({
      accountId: account.id,
      snapshotId: added.id,
    });
    const outcomes = await Promise.allSettled(
      ["200", "300"].map((amount) =>
        alice.portfolio.updateSnapshot({
          snapshotId: added.id,
          version: detail.version,
          entry: { ...input, cash: [{ currency: "SGD", amount }] },
        }),
      ),
    );
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = outcomes.find((r) => r.status === "rejected");
    expect(failed?.status === "rejected" ? failed.reason : null).toMatchObject({
      code: "CONFLICT",
    });
  });

  test("editing holdings preserves explicit recorded values, quantities, cost basis and dates", async () => {
    const account = await alice.accounts.create(broker);
    const pos = {
      symbol: "EDIT",
      exchange: "",
      name: "Editable",
      assetClass: "stock" as const,
      currency: "SGD",
      quantity: "10",
      averageCost: "4",
      price: null,
      value: "100.12",
    };
    const created = await alice.portfolio.addSnapshot({
      accountId: account.id,
      asOf: "2026-09-30",
      positions: [pos],
      cash: [],
    });
    let detail = await alice.portfolio.snapshot({
      accountId: account.id,
      snapshotId: created.id,
    });
    expect(detail.positions[0]?.statementValue).toBe("100.1200");
    await alice.portfolio.updateSnapshot({
      snapshotId: detail.id,
      version: detail.version,
      entry: {
        accountId: account.id,
        asOf: "2026-10-01",
        positions: [
          { ...pos, quantity: "20", averageCost: "5", price: "7", value: null },
        ],
        cash: [{ currency: "SGD", amount: "25" }],
      },
    });
    detail = await alice.portfolio.snapshot({
      accountId: account.id,
      snapshotId: created.id,
    });
    expect(detail).toMatchObject({
      asOf: "2026-10-01",
      positions: [
        {
          quantity: "20.0000000000",
          averageCost: "5.00000000",
          statementValue: "140.0000",
        },
      ],
    });
    expect((await alice.portfolio.netWorth()).total).toBe("165");
  });
  test("legacy blank entries cannot hide older holdings; explicit zero balances remain current", async () => {
    const account = await alice.accounts.create(broker);
    await alice.portfolio.recordSnapshot({
      accountId: account.id,
      asOf: "2026-09-30",
      positions: [],
      cash: [{ currency: "SGD", amount: "100" }],
    });
    await db.insert(schema.accountSnapshot).values({
      ownerId: "alice",
      accountId: account.id,
      asOf: "2026-10-19",
      source: "manual",
    });
    expect((await alice.accounts.get(account)).holdings?.asOf).toBe(
      "2026-09-30",
    );
    expect((await alice.portfolio.netWorth()).total).toBe("100");
    await alice.portfolio.recordSnapshot({
      accountId: account.id,
      asOf: "2026-10-19",
      positions: [],
      cash: [{ currency: "SGD", amount: "0" }],
    });
    expect((await alice.accounts.get(account)).holdings?.asOf).toBe(
      "2026-10-19",
    );
    expect((await alice.portfolio.netWorth()).total).toBe("0");
  });
  test("rejects blank entries without replacing holdings and permits an explicit zero balance", async () => {
    const account = await alice.accounts.create(broker);
    await alice.portfolio.recordSnapshot({
      accountId: account.id,
      asOf: "2026-09-30",
      positions: [],
      cash: [{ currency: "SGD", amount: "100" }],
    });
    for (const asOf of ["2026-09-30", "2026-10-19"]) {
      await expect(
        alice.portfolio.recordSnapshot({
          accountId: account.id,
          asOf,
          positions: [],
          cash: [],
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect((await alice.accounts.get(account)).holdings).toMatchObject({
      asOf: "2026-09-30",
      cash: [{ currency: "SGD", amount: "100.0000" }],
    });
    expect(await db.select().from(schema.accountSnapshot)).toHaveLength(1);
    await alice.portfolio.recordSnapshot({
      accountId: account.id,
      asOf: "2026-10-19",
      positions: [],
      cash: [{ currency: "SGD", amount: "0" }],
    });
    expect((await alice.accounts.get(account)).holdings).toMatchObject({
      asOf: "2026-10-19",
      totals: [{ currency: "SGD", amount: "0" }],
    });
  });
  test("reports unpriced holdings on each account and rejects archived snapshot writes", async () => {
    const account = await alice.accounts.create(broker);
    const entry = {
      accountId: account.id,
      asOf: "2026-10-01",
      positions: [
        {
          symbol: "UNPRICED",
          exchange: "",
          name: "",
          assetClass: "stock" as const,
          currency: "SGD",
          quantity: "2",
          averageCost: null,
          price: null,
        },
      ],
      cash: [],
    };
    await alice.portfolio.recordSnapshot(entry);
    expect((await alice.portfolio.netWorth()).accounts[0]).toMatchObject({
      unpriced: 1,
      total: null,
      totals: [],
    });
    await alice.accounts.remove(account);
    await expect(alice.portfolio.recordSnapshot(entry)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  test("values the latest snapshot and converts with known FX rates", async () => {
    const savings = await alice.accounts.create(bank);
    const brokerage = await alice.accounts.create(broker);
    await alice.portfolio.recordSnapshot({
      accountId: savings.id,
      asOf: "2026-09-01",
      positions: [],
      cash: [{ currency: "SGD", amount: "100" }],
    });
    await alice.portfolio.recordSnapshot({
      accountId: savings.id,
      asOf: "2026-10-01",
      positions: [],
      cash: [{ currency: "SGD", amount: "1500.25" }],
    });
    await alice.portfolio.recordSnapshot({
      accountId: brokerage.id,
      asOf: "2026-10-02",
      positions: [
        {
          symbol: "aapl",
          exchange: "xnas",
          name: "Apple",
          assetClass: "stock",
          currency: "USD",
          quantity: "10",
          averageCost: "150",
          price: "200.5",
        },
        {
          symbol: "NOPRICE",
          exchange: "",
          name: "",
          assetClass: "fund",
          currency: "USD",
          quantity: "3",
          averageCost: null,
          price: null,
        },
      ],
      cash: [{ currency: "USD", amount: "50" }],
    });

    const before = await alice.portfolio.netWorth();
    expect(before.currency).toBe("SGD");
    expect(before.total).toBe("1500.25");
    expect(before.unconverted).toEqual([{ currency: "USD", amount: "2055" }]);
    expect(before.unpriced).toBe(1);
    expect(before.asOf).toBe("2026-10-02");

    await db.insert(schema.fxRate).values([
      {
        date: "2026-09-01",
        base: "USD",
        quote: "SGD",
        rate: "1.2",
        source: "test",
      },
      {
        date: "2026-10-01",
        base: "SGD",
        quote: "USD",
        rate: "0.8",
        source: "test",
      },
    ]);
    const after = await alice.portfolio.netWorth();
    // 1500.25 + 2055 / 0.8
    expect(after.total).toBe("4069");
    expect(after.unconverted).toEqual([]);
    // Bank balances are reported apart from the investment allocation.
    expect(after.allocation.map((a) => [a.assetClass, a.total])).toEqual([
      ["stock", "2506.25"],
      ["cash", "62.5"],
    ]);
    expect(after.banking.total).toBe("1500.25");
    expect(after.accounts.find((a) => a.id === brokerage.id)?.total).toBe(
      "2568.75",
    );
    expect(after.fxAsOf).toBe("2026-10-01");

    const detail = await alice.accounts.get(brokerage);
    expect(detail.holdings?.positions.map((p) => p.symbol)).toEqual([
      "AAPL",
      "NOPRICE",
    ]);
    expect(await bob.portfolio.netWorth()).toMatchObject({
      total: null,
      accounts: [],
    });
  });

  test("fetches and persists FX for the full broker value and changes every total with display currency", async () => {
    const brokerage = await alice.accounts.create(broker);
    await alice.portfolio.recordSnapshot({
      accountId: brokerage.id,
      asOf: "2026-10-19",
      positions: [
        {
          symbol: "TOTAL",
          exchange: "",
          name: "",
          assetClass: "stock",
          currency: "USD",
          quantity: "10",
          averageCost: null,
          price: "100",
        },
      ],
      cash: [
        { currency: "USD", amount: "100" },
        { currency: "SGD", amount: "12.63" },
      ],
    });
    ratesRequest.mockResolvedValue([
      {
        date: "2026-10-19",
        base: "SGD",
        quote: "USD",
        rate: "0.8",
        source: "frankfurter",
      },
    ]);
    const sgd = await alice.portfolio.netWorth();
    expect(sgd.total).toBe("1387.63");
    expect(sgd.accounts[0]?.total).toBe(sgd.total);
    expect(sgd.unconverted).toEqual([]);
    expect(sgd.allocation.map((a) => [a.assetClass, a.total])).toEqual([
      ["stock", "1250"],
      ["cash", "137.63"],
    ]);
    expect(await db.select().from(schema.fxRate)).toHaveLength(1);

    // An outage still uses the rate persisted by the prior request.
    ratesRequest.mockResolvedValue([]);
    expect((await alice.portfolio.netWorth()).total).toBe(sgd.total);
    await db
      .insert(schema.userSettings)
      .values({ userId: "alice", displayCurrency: "USD" });
    const usd = await alice.portfolio.netWorth();
    expect(usd.total).toBe("1110.104");
    expect(usd.accounts[0]?.total).toBe(usd.total);
    expect(usd.unconverted).toEqual([]);
  });

  test("re-entering a date replaces the manual snapshot", async () => {
    const savings = await alice.accounts.create(bank);
    const entry = {
      accountId: savings.id,
      asOf: "2026-10-01",
      positions: [],
      cash: [{ currency: "SGD", amount: "10" }],
    };
    expect((await alice.portfolio.recordSnapshot(entry)).replaced).toBe(false);
    const again = await alice.portfolio.recordSnapshot({
      ...entry,
      cash: [{ currency: "SGD", amount: "20" }],
    });
    expect(again.replaced).toBe(true);
    expect((await alice.accounts.get(savings)).holdings?.totals).toEqual([
      { currency: "SGD", amount: "20" },
    ]);
  });

  test("simultaneous saves leave one manual snapshot for the date", async () => {
    const account = await alice.accounts.create(bank);
    const saved = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        alice.portfolio.recordSnapshot({
          accountId: account.id,
          asOf: "2026-10-01",
          positions: [],
          cash: [{ currency: "SGD", amount: String(i + 1) }],
        }),
      ),
    );
    expect(saved.filter((s) => !s.replaced)).toHaveLength(1);
    const snapshots = await db
      .select()
      .from(schema.accountSnapshot)
      .where(eq(schema.accountSnapshot.accountId, account.id));
    expect(snapshots).toHaveLength(1);
    expect((await alice.accounts.get(account)).holdings?.cash).toHaveLength(1);
  });

  test("cash accounts cannot hold securities and listings keep their currency", async () => {
    const savings = await alice.accounts.create(bank);
    const position = {
      symbol: "D05",
      exchange: "XSES",
      name: "",
      assetClass: "stock" as const,
      currency: "SGD",
      quantity: "100",
      averageCost: null,
      price: "40",
    };
    await expect(
      alice.portfolio.recordSnapshot({
        accountId: savings.id,
        asOf: "2026-10-01",
        positions: [position],
        cash: [],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const brokerage = await alice.accounts.create(broker);
    await alice.portfolio.recordSnapshot({
      accountId: brokerage.id,
      asOf: "2026-10-01",
      positions: [position],
      cash: [],
    });
    await expect(
      alice.portfolio.recordSnapshot({
        accountId: brokerage.id,
        asOf: "2026-10-02",
        positions: [{ ...position, currency: "USD" }],
        cash: [],
      }),
    ).rejects.toThrow("is in SGD in this account's 2026-10-01 entry");
  });

  test("CPF and SRS are reported apart and can be left out of net worth", async () => {
    const savings = await alice.accounts.create(bank);
    const cpf = await alice.accounts.create({
      ...bank,
      name: "CPF",
      type: "cpf",
    });
    const srs = await alice.accounts.create({
      ...bank,
      name: "SRS",
      type: "srs",
    });
    await alice.portfolio.recordSnapshot({
      accountId: savings.id,
      asOf: "2026-10-01",
      positions: [],
      cash: [{ currency: "SGD", amount: "1000" }],
    });
    await alice.portfolio.recordSnapshot({
      accountId: cpf.id,
      asOf: "2026-10-01",
      positions: [],
      cash: [
        { currency: "SGD", amount: "300", bucket: "oa" },
        { currency: "SGD", amount: "200", bucket: "sa" },
        { currency: "SGD", amount: "100", bucket: "ma" },
      ],
    });
    await alice.portfolio.recordSnapshot({
      accountId: srs.id,
      asOf: "2026-10-01",
      positions: [],
      cash: [{ currency: "SGD", amount: "50" }],
    });
    // Sub-accounts belong to CPF only.
    await expect(
      alice.portfolio.recordSnapshot({
        accountId: savings.id,
        asOf: "2026-10-02",
        positions: [],
        cash: [{ currency: "SGD", amount: "1", bucket: "oa" }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await db.insert(schema.investmentTransaction).values({
      ownerId: "alice",
      accountId: srs.id,
      type: "deposit",
      tradeDate: `${new Date().getFullYear()}-01-15`,
      amount: "50",
      currency: "SGD",
      fingerprint: "srs-top-up",
    });
    // Money moved in from another SRS account is not a new contribution.
    await db.insert(schema.investmentTransaction).values({
      ownerId: "alice",
      accountId: srs.id,
      type: "transfer_in",
      tradeDate: `${new Date().getFullYear()}-02-15`,
      amount: "1000",
      currency: "SGD",
      fingerprint: "srs-transfer",
    });

    const counted = await alice.portfolio.netWorth();
    expect(counted).toMatchObject({
      total: "1650",
      countCpfSrs: true,
      cpfSrs: { total: "650" },
      banking: { total: "1000" },
      srs: { toppedUp: "50.0000" },
    });
    expect(counted.allocation).toEqual([]);
    expect(counted.cpf.map((b) => [b.bucket, b.total])).toEqual([
      ["oa", "300"],
      ["sa", "200"],
      ["ma", "100"],
    ]);

    await settingsRouter
      .createCaller(contextFor("alice"))
      .setCountCpfSrs({ count: false });
    expect(await alice.portfolio.netWorth()).toMatchObject({
      total: "1000",
      countCpfSrs: false,
      cpfSrs: { total: "650" },
    });

    // A preset without CPF and SRS stops new ones but keeps counting the existing ones.
    const features = spyOn(preset, "features").mockResolvedValue({
      cpfSrs: false,
    });
    try {
      expect(
        await settingsRouter.createCaller(contextFor("alice")).get(),
      ).toMatchObject({ cpfSrsEnabled: false });
      expect(await alice.portfolio.netWorth()).toMatchObject({
        total: "1650",
        countCpfSrs: true,
        cpfSrsEnabled: false,
      });
      await expect(
        alice.accounts.create({ ...bank, name: "New SRS", type: "srs" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const empty = await alice.accounts.create(bank);
      await expect(
        alice.accounts.update({ ...bank, id: empty.id, type: "cpf" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await alice.accounts.update({
        ...bank,
        id: cpf.id,
        name: "My CPF",
        type: "cpf",
      });
    } finally {
      features.mockRestore();
    }
  });
});

describe("spending", () => {
  test("keeps an archived category and its provenance on unrelated edits", async () => {
    const account = await alice.accounts.create(bank);
    const [archived] = await db
      .insert(schema.category)
      .values({
        key: "archive-regression",
        name: "Old category",
      })
      .returning();
    await alice.rules.create({
      pattern: "supermarket",
      categoryId: archived!.id,
    });
    await spendingEntry(account.id);
    const [row] = await alice.spending.list(october);
    await db
      .update(schema.category)
      .set({ archivedAt: new Date() })
      .where(eq(schema.category.id, archived!.id));
    await alice.spending.update({ ...row!, notes: "Only notes changed" });
    expect((await alice.spending.list(october))[0]).toMatchObject({
      categoryId: archived!.id,
      categorySource: "rule",
      notes: "Only notes changed",
    });
    await expect(
      spendingEntry(account.id, { categoryId: archived!.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await alice.spending.update({ ...row!, categoryId: null });
    expect((await alice.spending.list(october))[0]).toMatchObject({
      categoryId: null,
      categorySource: "user",
    });
    await expect(alice.spending.update({ ...row! })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
  test("lists a month and summarises it without transfers", async () => {
    const account = await alice.accounts.create(bank);
    const base = {
      accountId: account.id,
      merchant: null,
      currency: null,
      categoryId: null,
      isTransfer: false,
      notes: null,
    };
    await alice.spending.create({
      ...base,
      postedDate: "2026-10-03",
      description: "Supermarket",
      amount: "-45.10",
      categoryId: groceriesId,
    });
    await alice.spending.create({
      ...base,
      postedDate: "2026-10-04",
      description: "Market",
      amount: "-4.90",
      categoryId: groceriesId,
    });
    await alice.spending.create({
      ...base,
      postedDate: "2026-10-05",
      description: "Card bill",
      amount: "-500",
      isTransfer: true,
    });
    await alice.spending.create({
      ...base,
      postedDate: "2026-09-30",
      description: "Last month",
      amount: "-1",
    });

    const rows = await alice.spending.list({
      month: "2026-10",
      accountId: null,
      categoryId: null,
    });
    expect(rows.map((r) => r.description)).toEqual([
      "Card bill",
      "Market",
      "Supermarket",
    ]);
    expect(rows[0]?.currency).toBe("SGD");

    // A search ignores the month and case, and treats % and _ as plain text.
    const search = (text: string) =>
      alice.spending.list({
        month: "2026-01",
        accountId: null,
        categoryId: null,
        search: text,
      });
    expect((await search("MARKET")).map((r) => r.description)).toEqual([
      "Market",
      "Supermarket",
    ]);
    expect((await search("last")).map((r) => r.postedDate)).toEqual([
      "2026-09-30",
    ]);
    expect(await search("%")).toHaveLength(0);
    expect(
      await bob.spending.list({
        month: "2026-10",
        accountId: null,
        categoryId: null,
        search: "market",
      }),
    ).toHaveLength(0);

    const summary = await alice.spending.summary({ month: "2026-10" });
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({
      categoryName: "Groceries",
      spent: "50.0000",
      received: "0",
      count: 2,
    });

    expect(
      await bob.spending.list({
        month: "2026-10",
        accountId: null,
        categoryId: null,
      }),
    ).toHaveLength(0);
    await expect(
      bob.spending.remove({ id: rows[0]!.id }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      alice.spending.create({
        ...base,
        postedDate: "2026-10-05",
        description: "Zero",
        amount: "0.00",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("converts a month's spending into the display currency and names currencies without a rate", async () => {
    const account = await alice.accounts.create(bank);
    const entry = (amount: string, currency: string | null) =>
      alice.spending.create({
        accountId: account.id,
        postedDate: "2026-10-03",
        description: `Card ${amount} ${currency ?? ""}`,
        merchant: null,
        amount,
        currency,
        categoryId: groceriesId,
        isTransfer: false,
        notes: null,
      });
    await entry("-40", null);
    await entry("-10", "USD");
    await entry("25", "USD");

    let month = await alice.spending.converted({ month: "2026-10" });
    expect(month).toMatchObject({
      currency: "SGD",
      spent: "40",
      received: "0",
      unconverted: ["USD"],
    });

    await db.insert(schema.fxRate).values({
      base: "SGD",
      quote: "USD",
      date: "2026-10-01",
      rate: "0.8",
      source: "test",
    });
    month = await alice.spending.converted({ month: "2026-10" });
    expect(month).toMatchObject({
      currency: "SGD",
      spent: "52.5",
      received: "31.25",
      unconverted: [],
      categories: [
        { categoryId: groceriesId, spent: "52.5", received: "31.25" },
      ],
    });
    expect((await bob.spending.converted({ month: "2026-10" })).spent).toBe(
      "0",
    );
  });

  test("transactions in an archived account stay editable but cannot be added", async () => {
    const account = await alice.accounts.create(bank);
    const entry = {
      accountId: account.id,
      postedDate: "2026-10-03",
      description: "Coffee",
      merchant: null,
      amount: "-5",
      currency: null,
      categoryId: null,
      isTransfer: false,
      notes: null,
    };
    const { id } = await alice.spending.create(entry);
    await alice.accounts.remove(account);
    await alice.spending.update({ ...entry, id, categoryId: groceriesId });
    await expect(alice.spending.create(entry)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("valuation", () => {
  test("prefers a live quote, then the statement value, then quantity × price", () => {
    const base = {
      quantity: "2",
      currency: "USD",
      statementPrice: "10",
      statementValue: "21",
    };
    expect(
      valuePosition({ ...base, quote: { price: "11.5", currency: "USD" } }),
    ).toEqual({ amount: "23", currency: "USD" });
    expect(valuePosition({ ...base, quote: null })).toEqual({
      amount: "21",
      currency: "USD",
    });
    expect(
      valuePosition({ ...base, statementValue: null, quote: null }),
    ).toEqual({ amount: "20", currency: "USD" });
    expect(
      valuePosition({
        ...base,
        statementPrice: null,
        statementValue: null,
        quote: null,
      }),
    ).toBeNull();
  });

  test("adds decimals exactly and reports amounts without a rate", () => {
    expect(
      sumByCurrency([
        { amount: "0.1", currency: "USD" },
        { amount: "0.2", currency: "USD" },
        { amount: "1", currency: "HKD" },
      ]),
    ).toEqual([
      { amount: "1", currency: "HKD" },
      { amount: "0.3", currency: "USD" },
    ]);
    const rates = ratesFromRows(
      [
        { date: "2026-01-01", base: "USD", quote: "SGD", rate: "1.3" },
        { date: "2026-02-01", base: "USD", quote: "SGD", rate: "1.35" },
      ],
      "SGD",
    );
    expect(
      convertAmounts(
        [
          { amount: "10", currency: "USD" },
          { amount: "5", currency: "SGD" },
          { amount: "7", currency: "HKD" },
        ],
        "SGD",
        rates,
      ),
    ).toEqual({
      total: "18.5",
      unconverted: [{ amount: "7", currency: "HKD" }],
    });
  });
});

async function spendingEntry(
  accountId: string,
  overrides: Partial<Parameters<typeof alice.spending.create>[0]> = {},
) {
  return alice.spending.create({
    accountId,
    postedDate: "2026-10-03",
    description: "Supermarket",
    merchant: null,
    amount: "-0.1",
    currency: "SGD",
    categoryId: null,
    isTransfer: false,
    notes: null,
    ...overrides,
  });
}
const october = { month: "2026-10", accountId: null, categoryId: null };

describe("merchant rules", () => {
  test("previews 500 IDs through the production HTTP client and applies multiple categories", async () => {
    const account = await alice.accounts.create(bank);
    const [other] = await db
      .insert(schema.category)
      .values({
        key: "bulk-rule-category",
        name: "Other bulk category",
      })
      .returning();
    await alice.rules.create({ pattern: "coffee", categoryId: groceriesId });
    await alice.rules.create({ pattern: "books", categoryId: other!.id });
    const rows = await db
      .insert(schema.transaction)
      .values(
        Array.from({ length: 500 }, (_, i) => ({
          ownerId: "alice",
          accountId: account.id,
          postedDate: "2026-10-03",
          description: i % 2 === 0 ? "Coffee" : "Books",
          amount: "-1",
          currency: "SGD",
          source: "manual" as const,
          fingerprint: `bulk-http-${i}`,
        })),
      )
      .returning({ id: schema.transaction.id });
    const ids = rows.map((r) => r.id);
    // Exercise the provider's real transport, rather than bypassing HTTP with a caller.
    const server = createHTTPServer({
      basePath: "/api/trpc/",
      router: createTRPCRouter({ merchantRules: merchantRulesRouter }),
      createContext: () => contextFor("alice"),
      allowMethodOverride: true,
    });
    const requests: { method: string | undefined; url: string | undefined }[] =
      [];
    server.on("request", (req) =>
      requests.push({ method: req.method, url: req.url }),
    );
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test port");
    const previousPort = process.env.PORT;
    process.env.PORT = String(address.port);
    let client: ReturnType<typeof api.useUtils>["client"] | undefined;
    function CaptureClient() {
      client = api.useUtils().client;
      return null;
    }
    try {
      renderToStaticMarkup(
        createElement(TRPCReactProvider, null, createElement(CaptureClient)),
      );
      const preview = await client!.merchantRules.preview.query({ ids });
      expect(preview.changes).toHaveLength(500);
      expect(requests[0]?.method).toBe("POST");
      expect(requests[0]?.url?.length).toBeLessThan(1000);
      expect(
        await client!.merchantRules.applyRules.mutate({
          ids,
          revision: preview.revision,
        }),
      ).toEqual({ count: 500 });
      const saved = await alice.spending.list(october);
      expect(
        saved.filter(
          (r) => r.categoryId === groceriesId && r.categorySource === "rule",
        ),
      ).toHaveLength(250);
      expect(
        saved.filter(
          (r) => r.categoryId === other!.id && r.categorySource === "rule",
        ),
      ).toHaveLength(250);
    } finally {
      process.env.PORT = previousPort;
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    }
  });
  test("uses normalized, literal contains matches and gives specific rules precedence", async () => {
    const account = await alice.accounts.create(bank);
    const [other] = await db
      .insert(schema.category)
      .values({ key: "other-rule-test", name: "Other" })
      .returning();
    await alice.rules.create({ pattern: "MARKET", categoryId: other!.id });
    const rule = await alice.rules.create({
      pattern: "  Supermarket   online  ",
      categoryId: groceriesId,
    });
    await spendingEntry(account.id, {
      description: "CARD SUPERMARKET ONLINE 123",
    });
    const [row] = await alice.spending.list(october);
    expect(row).toMatchObject({
      categoryId: groceriesId,
      categorySource: "rule",
    });
    expect((await alice.rules.list())[0]?.pattern).toBe("supermarket online");
    expect(await bob.rules.list()).toHaveLength(0);
    await expect(
      bob.rules.update({ ...rule, pattern: "taken", categoryId: groceriesId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(bob.rules.remove(rule)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    // SQL wildcard characters are literal text, never patterns.
    await alice.rules.create({ pattern: "%", categoryId: groceriesId });
    await spendingEntry(account.id, { description: "Unmatched" });
    expect(
      (await alice.spending.list(october)).find(
        (r) => r.description === "Unmatched",
      )?.categoryId,
    ).toBeNull();
    await expect(
      alice.rules.create({ pattern: "x", categoryId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("previews existing entries, preserves manual choices and transfers, and detects stale reviews", async () => {
    const account = await alice.accounts.create(bank);
    const automatic = await spendingEntry(account.id);
    const manual = await spendingEntry(account.id, { categoryId: groceriesId });
    const transfer = await spendingEntry(account.id, { isTransfer: true });
    const clearedCategory = await spendingEntry(account.id);
    await alice.spending.bulkUpdate({
      ids: [clearedCategory.id],
      changes: { categoryId: null },
    });
    const rule = await alice.rules.create({
      pattern: "market",
      categoryId: groceriesId,
    });
    const ids = [automatic.id, manual.id, transfer.id, clearedCategory.id];
    const preview = await alice.rules.preview({ ids });
    expect(preview.changes.map((r) => r.id)).toEqual([automatic.id]);
    expect(preview.skipped).toBe(3);
    await expect(bob.rules.preview({ ids })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await alice.rules.update({
      ...rule,
      pattern: "supermarket",
      categoryId: groceriesId,
    });
    await expect(
      alice.rules.applyRules({ ids, revision: preview.revision }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const reviewed = await alice.rules.preview({ ids });
    expect(
      await alice.rules.applyRules({ ids, revision: reviewed.revision }),
    ).toEqual({ count: 1 });
    expect(
      (await alice.spending.list(october)).find((r) => r.id === automatic.id)
        ?.categorySource,
    ).toBe("rule");
    expect((await alice.rules.preview({ ids })).changes).toHaveLength(0);
  });

  test("a manually changed category is preserved on later rule application", async () => {
    const account = await alice.accounts.create(bank);
    await alice.rules.create({
      pattern: "supermarket",
      categoryId: groceriesId,
    });
    const entry = await spendingEntry(account.id);
    const [row] = await alice.spending.list(october);
    await alice.spending.update({
      ...row!,
      merchant: null,
      categoryId: null,
      notes: null,
    });
    expect((await alice.spending.list(october))[0]).toMatchObject({
      categoryId: null,
      categorySource: "user",
    });
    expect(
      (await alice.rules.preview({ ids: [entry.id] })).changes,
    ).toHaveLength(0);
  });
});

describe("bulk transactions", () => {
  test("updates only chosen fields and rejects mixed ownership atomically", async () => {
    const account = await alice.accounts.create(bank);
    const first = await spendingEntry(account.id, {
      notes: "Keep",
      merchant: "Market",
    });
    const second = await spendingEntry(account.id, {
      amount: "-0.2",
      notes: "Also keep",
    });
    const result = await alice.spending.bulkUpdate({
      ids: [first.id, second.id],
      changes: { categoryId: groceriesId, cleared: true },
    });
    expect(result.count).toBe(2);
    let rows = await alice.spending.list(october);
    expect(rows.every((r) => r.cleared && r.categorySource === "user")).toBe(
      true,
    );
    expect(rows.find((r) => r.id === first.id)).toMatchObject({
      notes: "Keep",
      merchant: "Market",
      amount: "-0.1000",
    });
    const other = await bob.accounts.create(bank);
    const foreign = await bob.spending.create({
      accountId: other.id,
      postedDate: "2026-10-03",
      description: "Private",
      merchant: null,
      amount: "-1",
      currency: null,
      categoryId: null,
      isTransfer: false,
      notes: null,
    });
    await expect(
      alice.spending.bulkUpdate({
        ids: [first.id, foreign.id],
        changes: { notes: "Taken" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      alice.spending.bulkRemove({ ids: [first.id, foreign.id] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    rows = await alice.spending.list(october);
    expect(rows.find((r) => r.id === first.id)?.notes).toBe("Keep");
    await alice.spending.bulkUpdate({
      ids: [first.id],
      changes: { merchant: "", notes: "", categoryId: null },
    });
    expect(
      (await alice.spending.list(october)).find((r) => r.id === first.id),
    ).toMatchObject({
      merchant: null,
      notes: null,
      categoryId: null,
      categorySource: "user",
    });
    await expect(
      alice.spending.bulkUpdate({ ids: [first.id], changes: {} }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      alice.spending.bulkRemove({ ids: [first.id, first.id] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      alice.spending.bulkUpdate({
        ids: [first.id, second.id],
        changes: { categoryId: crypto.randomUUID() },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await alice.spending.bulkRemove({ ids: [first.id, second.id] }),
    ).toEqual({ count: 2 });
    expect(await alice.spending.list(october)).toHaveLength(0);
  });
});

describe("account reconciliation", () => {
  test("preserves sub-cent precision when large credits and debits cancel", async () => {
    const account = await alice.accounts.create(bank);
    for (const [index, amount] of [
      "9999999999999999.9999",
      "9999999999999999.9999",
      "-9999999999999999.9999",
      "-9999999999999999.9999",
    ].entries()) {
      await spendingEntry(account.id, {
        postedDate: `2026-10-0${index + 1}`,
        amount,
      });
    }
    const preview = await alice.reconciliation.preview({
      accountId: account.id,
      currency: "SGD",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      openingBalance: "0",
      closingBalance: "0",
    });
    expect(preview.movement).toBe("0");
    expect(preview.difference).toBe("0");
  });
  async function statement() {
    const account = await alice.accounts.create(bank);
    const first = await spendingEntry(account.id);
    const transfer = await spendingEntry(account.id, {
      amount: "-0.2",
      isTransfer: true,
    });
    await spendingEntry(account.id, {
      postedDate: "2026-09-30",
      amount: "-99",
    });
    await spendingEntry(account.id, { currency: "USD", amount: "-99" });
    const period = {
      accountId: account.id,
      currency: "SGD",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      openingBalance: "100",
      closingBalance: "99.7",
    };
    return { account, first, transfer, period };
  }

  test("reconciles exact decimal balances including transfers and only the statement currency", async () => {
    const { period, first, transfer } = await statement();
    const preview = await alice.reconciliation.preview(period);
    expect(preview).toMatchObject({
      movement: "-0.3",
      expectedClosing: "99.7",
      difference: "0",
      overlaps: false,
    });
    expect(new Set(preview.rows.map((r) => r.id))).toEqual(
      new Set([first.id, transfer.id]),
    );
    await expect(
      alice.reconciliation.finish({
        ...period,
        revision: preview.revision,
        verifiedIds: [first.id],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const saved = await alice.reconciliation.finish({
      ...period,
      revision: preview.revision,
      verifiedIds: [first.id, transfer.id],
    });
    const rows = await alice.spending.list(october);
    expect(rows.filter((r) => r.reconciliationId === saved.id)).toHaveLength(2);
    expect(
      rows
        .filter((r) => r.reconciliationId === saved.id)
        .every((r) => r.cleared),
    ).toBe(true);
    expect(rows.find((r) => r.currency === "USD")?.reconciliationId).toBeNull();
    const history = await alice.reconciliation.list({
      accountId: period.accountId,
    });
    expect(history[0]).toMatchObject({
      closingBalance: "99.7000",
      openingBalance: "100.0000",
    });
    await expect(
      alice.reconciliation.finish({
        ...period,
        revision: preview.revision,
        verifiedIds: [first.id, transfer.id],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      bob.reconciliation.list({ accountId: period.accountId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(bob.reconciliation.preview(period)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      bob.reconciliation.finish({
        ...period,
        revision: preview.revision,
        verifiedIds: [first.id, transfer.id],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(bob.reconciliation.reopen(saved)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("blocks balance-affecting writes until reopening, while allowing categorization", async () => {
    const { period, first, transfer } = await statement();
    const preview = await alice.reconciliation.preview(period);
    const saved = await alice.reconciliation.finish({
      ...period,
      revision: preview.revision,
      verifiedIds: [first.id, transfer.id],
    });
    const row = (await alice.spending.list(october)).find(
      (r) => r.id === first.id,
    )!;
    await expect(
      alice.spending.update({ ...row, amount: "-3" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      alice.spending.update({ ...row, description: "Changed" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(alice.spending.remove(first)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      alice.spending.bulkRemove({ ids: [first.id] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      alice.spending.bulkUpdate({
        ids: [first.id],
        changes: { cleared: false },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(spendingEntry(period.accountId)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const outside = (await alice.spending.list(october)).find(
      (r) => r.currency === "USD",
    )!;
    await expect(
      alice.spending.update({ ...outside, currency: "SGD" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await alice.spending.update({
      ...row,
      categoryId: groceriesId,
      notes: "Verified",
    });
    await alice.spending.bulkUpdate({
      ids: [first.id, transfer.id],
      changes: { merchant: "Reviewed" },
    });
    // Re-categorizing with rules also preserves the financial check.
    await alice.rules.create({
      pattern: "supermarket",
      categoryId: groceriesId,
    });
    const rulePreview = await alice.rules.preview({
      ids: [first.id, transfer.id],
    });
    expect(rulePreview.changes).toHaveLength(0);
    await alice.reconciliation.reopen(saved);
    expect(
      (await alice.spending.list(october)).filter((r) => r.reconciliationId),
    ).toHaveLength(0);
    expect(
      (await alice.spending.list(october)).find((r) => r.id === first.id)
        ?.cleared,
    ).toBe(true);
    await alice.spending.update({ ...row, amount: "-0.4" });
    await alice.spending.remove(transfer);
    await spendingEntry(period.accountId);
  });

  test("rejects discrepancies, stale previews, malformed dates and investment accounts", async () => {
    const { period, first, transfer } = await statement();
    const mismatch = { ...period, closingBalance: "100" };
    const preview = await alice.reconciliation.preview(mismatch);
    expect(preview.difference).toBe("0.3");
    await expect(
      alice.reconciliation.finish({
        ...mismatch,
        revision: preview.revision,
        verifiedIds: [first.id, transfer.id],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const matching = await alice.reconciliation.preview(period);
    await spendingEntry(period.accountId, { amount: "1" });
    await expect(
      alice.reconciliation.finish({
        ...period,
        revision: matching.revision,
        verifiedIds: [first.id, transfer.id],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      alice.reconciliation.preview({ ...period, startDate: "2026-11-01" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const brokerage = await alice.accounts.create(broker);
    await expect(
      alice.reconciliation.preview({ ...period, accountId: brokerage.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await alice.reconciliation.list({ accountId: period.accountId }),
    ).toHaveLength(0);
  });

  test("protects an empty reconciled period and retains it when archiving an account", async () => {
    const account = await alice.accounts.create(bank);
    const period = {
      accountId: account.id,
      currency: "SGD",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      openingBalance: "0",
      closingBalance: "0",
    };
    const preview = await alice.reconciliation.preview(period);
    const saved = await alice.reconciliation.finish({
      ...period,
      revision: preview.revision,
      verifiedIds: [],
    });
    await expect(
      alice.accounts.update({ ...broker, id: account.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(spendingEntry(account.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(await alice.accounts.remove(account)).toEqual({
      outcome: "archived",
    });
    expect(
      await alice.reconciliation.list({ accountId: account.id }),
    ).toHaveLength(1);
    await alice.reconciliation.reopen(saved);
    await alice.accounts.restore(account);
    await spendingEntry(account.id);
  });
});

const workspaceDefaults = {
  name: "Our family",
  kind: "family" as const,
  displayCurrency: "SGD",
};
const workspaceToken = (url: string) =>
  new URL(url).pathname.split("/").at(-1)!;
async function addWorkspaceMember(
  workspaceId: string,
  id: "bob" | "charlie",
  role: "member" | "viewer" = "member",
) {
  const invite = await alice.workspaces.invite({
    workspaceId,
    email: `${id}@example.com`,
    role,
  });
  await callers(id).workspaces.acceptInvitation({
    token: workspaceToken(invite.url),
  });
  return invite;
}
async function workspaceFixture() {
  const { id: workspaceId } = await alice.workspaces.create(workspaceDefaults);
  await addWorkspaceMember(workspaceId, "bob");
  const shared = await alice.accounts.create({ ...bank, name: "Shared bank" });
  const privateAccount = await alice.accounts.create({
    ...bank,
    name: "Private bank",
  });
  await alice.workspaces.shareAccount({ workspaceId, accountId: shared.id });
  await alice.portfolio.recordSnapshot({
    accountId: shared.id,
    asOf: "2026-10-01",
    positions: [],
    cash: [{ currency: "SGD", amount: "100.1234" }],
  });
  await alice.portfolio.recordSnapshot({
    accountId: privateAccount.id,
    asOf: "2026-10-01",
    positions: [],
    cash: [{ currency: "SGD", amount: "900" }],
  });
  const entry = await spendingEntry(shared.id);
  await spendingEntry(privateAccount.id);
  return { workspaceId, shared, privateAccount, entry };
}

describe("workspace visibility", () => {
  test("shows only explicitly shared accounts and preserves personal scope", async () => {
    const { workspaceId, shared, privateAccount } = await workspaceFixture();
    const own = await bob.accounts.create({ ...bank, name: "Bob private" });
    await bob.portfolio.recordSnapshot({
      accountId: own.id,
      asOf: "2026-10-01",
      positions: [],
      cash: [{ currency: "SGD", amount: "50" }],
    });
    const rows = await bob.accounts.list({ workspaceId });
    expect(rows.map((r) => r.id)).toEqual([shared.id]);
    expect(rows[0]).toMatchObject({
      ownerId: "alice",
      ownerName: "Example Alice",
      totals: [{ currency: "SGD", amount: "100.1234" }],
    });
    expect(
      (await bob.accounts.get({ ...shared, workspaceId })).holdings?.cash,
    ).toEqual([{ currency: "SGD", amount: "100.1234", bucket: null }]);
    expect((await bob.portfolio.netWorth({ workspaceId })).total).toBe(
      "100.1234",
    );
    expect((await bob.portfolio.netWorth()).total).toBe("50");
    expect((await alice.portfolio.netWorth()).total).toBe("1000.1234");
    expect((await alice.portfolio.netWorth({ workspaceId })).total).toBe(
      "100.1234",
    );
    await expect(
      bob.accounts.get({ ...privateAccount, workspaceId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(bob.accounts.get(shared)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const transactions = await bob.spending.list({
      workspaceId,
      month: "2026-10",
      accountId: null,
      categoryId: null,
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.accountId).toBe(shared.id);
    expect(
      await bob.spending.list({
        workspaceId,
        month: "2026-10",
        accountId: privateAccount.id,
        categoryId: null,
      }),
    ).toEqual([]);
    expect(
      await bob.spending.list({
        month: "2026-10",
        accountId: null,
        categoryId: null,
      }),
    ).toEqual([]);
    expect(await bob.workspaces.get({ workspaceId })).toMatchObject({
      role: "member",
      invitations: [],
    });
  });

  test("membership does not grant private access and separate audiences cannot see each other's accounts", async () => {
    const { workspaceId, privateAccount, shared } = await workspaceFixture();
    const other = await alice.workspaces.create({
      ...workspaceDefaults,
      name: "Investor audience",
      kind: "fund",
    });
    await addWorkspaceMember(other.id, "charlie", "viewer");
    await alice.workspaces.shareAccount({
      workspaceId: other.id,
      accountId: privateAccount.id,
    });
    expect(
      (await charlie.accounts.list({ workspaceId: other.id })).map((a) => a.id),
    ).toEqual([privateAccount.id]);
    await expect(
      charlie.accounts.get({ ...shared, workspaceId: other.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    for (const operation of [
      () => charlie.workspaces.get({ workspaceId }),
      () => charlie.accounts.list({ workspaceId }),
      () => charlie.portfolio.netWorth({ workspaceId }),
      () => charlie.spending.summary({ workspaceId, month: "2026-10" }),
      () => bob.accounts.list({ workspaceId: other.id }),
    ])
      await expect(operation()).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Instance admins have no implicit access to shared or private finances.
    const adminContext = contextFor("charlie");
    adminContext.session.user.role = "admin";
    await expect(
      accountsRouter.createCaller(adminContext).list({ workspaceId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const empty = await alice.workspaces.create({
      ...workspaceDefaults,
      name: "Empty",
    });
    expect(await alice.accounts.list({ workspaceId: empty.id })).toEqual([]);
  });

  test("sharing never permits financial mutations, snapshots, bulk edits, or reconciliation", async () => {
    const { workspaceId, shared, entry } = await workspaceFixture();
    expect(await bob.accounts.list({ workspaceId })).toHaveLength(1);
    for (const operation of [
      () => bob.accounts.update({ ...bank, id: shared.id }),
      () => bob.accounts.remove(shared),
      () => bob.accounts.restore(shared),
      () =>
        bob.portfolio.recordSnapshot({
          accountId: shared.id,
          asOf: "2026-10-02",
          positions: [],
          cash: [{ currency: "SGD", amount: "0" }],
        }),
      () =>
        bob.spending.create({
          accountId: shared.id,
          postedDate: "2026-10-01",
          description: "Forbidden",
          amount: "-1",
          currency: null,
          merchant: null,
          categoryId: null,
          notes: null,
          isTransfer: false,
        }),
      () =>
        bob.spending.update({
          id: entry.id,
          accountId: shared.id,
          postedDate: "2026-10-03",
          description: "Forbidden",
          merchant: null,
          amount: "-0.1",
          currency: "SGD",
          categoryId: null,
          isTransfer: false,
          notes: null,
        }),
      () => bob.spending.remove({ id: entry.id }),
      () => bob.spending.bulkRemove({ ids: [entry.id] }),
      () =>
        bob.spending.bulkUpdate({
          ids: [entry.id],
          changes: { notes: "Forbidden" },
        }),
      () => bob.reconciliation.list({ accountId: shared.id }),
    ])
      await expect(operation()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await alice.accounts.get(shared)).holdings?.cash[0]?.amount).toBe(
      "100.1234",
    );
  });

  test("unsharing and removal revoke access even for a previously resolved scope", async () => {
    const { workspaceId, shared } = await workspaceFixture();
    const scope = await resolveWorkspaceScope(
      db,
      resolveAccessScope("bob"),
      workspaceId,
    );
    expect(
      (await latestHoldings(db as unknown as Database, scope, [shared.id]))
        .size,
    ).toBe(1);
    await alice.workspaces.unshareAccount({
      workspaceId,
      accountId: shared.id,
    });
    expect(await bob.accounts.list({ workspaceId })).toEqual([]);
    expect(
      (await latestHoldings(db as unknown as Database, scope, [shared.id]))
        .size,
    ).toBe(0);
    await alice.workspaces.shareAccount({ workspaceId, accountId: shared.id });
    await alice.workspaces.removeMember({ workspaceId, userId: "bob" });
    await expect(bob.accounts.list({ workspaceId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      (await latestHoldings(db as unknown as Database, scope, [shared.id]))
        .size,
    ).toBe(0);
    expect((await alice.accounts.get(shared)).name).toBe("Shared bank");
  });

  test("duplicates and sharing with multiple audiences never double-count; transfers are excluded", async () => {
    const { workspaceId, shared } = await workspaceFixture();
    await alice.workspaces.shareAccount({ workspaceId, accountId: shared.id });
    const other = await alice.workspaces.create({
      ...workspaceDefaults,
      name: "Second audience",
    });
    await alice.workspaces.shareAccount({
      workspaceId: other.id,
      accountId: shared.id,
    });
    expect(await db.$count(schema.workspaceAccountShare)).toBe(2);
    expect((await alice.portfolio.netWorth({ workspaceId })).total).toBe(
      "100.1234",
    );
    await alice.spending.create({
      accountId: shared.id,
      postedDate: "2026-10-02",
      amount: "-999",
      currency: "SGD",
      description: "Transfer",
      merchant: null,
      notes: null,
      categoryId: null,
      isTransfer: true,
    });
    const summary = await bob.spending.summary({
      workspaceId,
      month: "2026-10",
    });
    expect(summary).toHaveLength(1);
    expect(summary[0]!.count).toBe(1);
    expect(summary[0]!.spent).not.toBe("999");
  });

  test("uses workspace currency and reports missing rates, unpriced holdings and archived accounts", async () => {
    const { workspaceId, shared } = await workspaceFixture();
    await alice.workspaces.update({
      ...workspaceDefaults,
      workspaceId,
      displayCurrency: "USD",
    });
    let worth = await bob.portfolio.netWorth({ workspaceId });
    expect(worth.currency).toBe("USD");
    expect(worth.unconverted).toEqual([
      { currency: "SGD", amount: "100.1234" },
    ]);
    await db.insert(schema.fxRate).values({
      base: "SGD",
      quote: "USD",
      date: "2026-10-01",
      rate: "0.75",
      source: "test",
    });
    worth = await bob.portfolio.netWorth({ workspaceId });
    expect(worth.total).toBe("75.0926");
    const investment = await alice.accounts.create(broker);
    await alice.workspaces.shareAccount({
      workspaceId,
      accountId: investment.id,
    });
    await alice.portfolio.recordSnapshot({
      accountId: investment.id,
      asOf: "2026-10-01",
      cash: [],
      positions: [
        {
          symbol: "UNPRICED",
          exchange: "",
          name: "",
          assetClass: "stock",
          currency: "USD",
          quantity: "1",
          averageCost: null,
          price: null,
        },
      ],
    });
    expect((await bob.portfolio.netWorth({ workspaceId })).unpriced).toBe(1);
    await alice.accounts.remove(shared);
    expect(
      (await bob.portfolio.netWorth({ workspaceId })).accounts.map((a) => a.id),
    ).toEqual([investment.id]);
    expect(
      (await bob.accounts.list({ workspaceId })).find((a) => a.id === shared.id)
        ?.archivedAt,
    ).toBeInstanceOf(Date);
  });
});

describe("workspace management and invitations", () => {
  test("requires authentication and required two-factor enrollment", async () => {
    const signedOut = { ...contextFor("alice"), session: null };
    await expect(
      workspacesRouter.createCaller(signedOut).list(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const unenrolled = contextFor("alice");
    unenrolled.session.user.twoFactorEnabled = false;
    await expect(
      workspacesRouter.createCaller(unenrolled).create(workspaceDefaults),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("only owners manage membership; members share only their own accounts; viewers only read", async () => {
    const { workspaceId, shared, privateAccount } = await workspaceFixture();
    await addWorkspaceMember(workspaceId, "charlie", "viewer");
    const charlieOwn = await charlie.accounts.create(bank);
    await expect(
      charlie.workspaces.shareAccount({
        workspaceId,
        accountId: charlieOwn.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const operation of [
      () => bob.workspaces.update({ ...workspaceDefaults, workspaceId }),
      () =>
        bob.workspaces.invite({
          workspaceId,
          email: "other@example.com",
          role: "member",
        }),
      () => bob.workspaces.removeMember({ workspaceId, userId: "charlie" }),
      () =>
        bob.workspaces.setMemberRole({
          workspaceId,
          userId: "charlie",
          role: "member",
        }),
      () => bob.workspaces.transferOwnership({ workspaceId, userId: "bob" }),
      () => bob.workspaces.remove({ workspaceId }),
    ])
      await expect(operation()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      bob.workspaces.shareAccount({
        workspaceId,
        accountId: privateAccount.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      bob.workspaces.unshareAccount({ workspaceId, accountId: shared.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const bobOwn = await bob.accounts.create(bank);
    await bob.workspaces.shareAccount({ workspaceId, accountId: bobOwn.id });
    expect(
      (await charlie.accounts.list({ workspaceId })).map((a) => a.id),
    ).toContain(bobOwn.id);
    // Owner can revoke a member's grant without obtaining write access to their records.
    await alice.workspaces.unshareAccount({
      workspaceId,
      accountId: bobOwn.id,
    });
    await expect(
      alice.accounts.update({ ...bank, id: bobOwn.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await bob.accounts.get(bobOwn)).id).toBe(bobOwn.id);
  });

  test("departure and viewer demotion remove the member's shares across all financial queries", async () => {
    const { workspaceId } = await workspaceFixture();
    const own = await bob.accounts.create(bank);
    await bob.workspaces.shareAccount({ workspaceId, accountId: own.id });
    await alice.workspaces.setMemberRole({
      workspaceId,
      userId: "bob",
      role: "viewer",
    });
    expect(
      (await alice.accounts.list({ workspaceId })).map((a) => a.id),
    ).not.toContain(own.id);
    expect((await bob.workspaces.get({ workspaceId })).role).toBe("viewer");
    await alice.workspaces.setMemberRole({
      workspaceId,
      userId: "bob",
      role: "member",
    });
    await bob.workspaces.shareAccount({ workspaceId, accountId: own.id });
    await bob.workspaces.removeMember({ workspaceId, userId: "bob" });
    expect(await bob.workspaces.list()).toEqual([]);
    expect(
      (await alice.workspaces.get({ workspaceId })).shares.some(
        (s) => s.accountId === own.id,
      ),
    ).toBe(false);
    expect((await bob.accounts.get(own)).id).toBe(own.id);
  });

  test("owners must transfer before leaving; transfers revoke pending invites; deletion retains finances", async () => {
    const { workspaceId, shared } = await workspaceFixture();
    await expect(
      alice.workspaces.removeMember({ workspaceId, userId: "alice" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      alice.workspaces.setMemberRole({
        workspaceId,
        userId: "alice",
        role: "viewer",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const invite = await alice.workspaces.invite({
      workspaceId,
      email: "charlie@example.com",
      role: "viewer",
    });
    await alice.workspaces.transferOwnership({ workspaceId, userId: "bob" });
    expect((await bob.workspaces.get({ workspaceId })).role).toBe("owner");
    expect((await alice.workspaces.get({ workspaceId })).role).toBe("member");
    await expect(
      charlie.workspaces.acceptInvitation({
        token: workspaceToken(invite.url),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      alice.workspaces.remove({ workspaceId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await bob.workspaces.remove({ workspaceId });
    expect(await alice.workspaces.list()).toEqual([]);
    expect(await db.$count(schema.workspaceMember)).toBe(0);
    expect(await db.$count(schema.workspaceAccountShare)).toBe(0);
    expect((await alice.accounts.get(shared)).holdings?.cash[0]?.amount).toBe(
      "100.1234",
    );
  });

  test("invites are email-bound, hashed, single-use, replaceable, revocable and expiring", async () => {
    const { id: workspaceId } =
      await alice.workspaces.create(workspaceDefaults);
    const first = await alice.workspaces.invite({
      workspaceId,
      email: "BOB@example.com",
      role: "viewer",
    });
    const token = workspaceToken(first.url);
    const [stored] = await db.select().from(schema.workspaceInvitation);
    expect(stored!.email).toBe("bob@example.com");
    expect(stored!.tokenHash).not.toBe(token);
    expect(stored!.tokenHash).toHaveLength(64);
    const invite = await findPendingWorkspaceInvitation(db, token);
    expect(invite).toMatchObject({
      workspaceName: "Our family",
      role: "viewer",
    });
    await expect(
      charlie.workspaces.acceptInvitation({ token }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.$count(schema.workspaceMember)).toBe(1);
    const second = await alice.workspaces.invite({
      workspaceId,
      email: "bob@example.com",
      role: "member",
    });
    await expect(
      bob.workspaces.acceptInvitation({ token }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await bob.workspaces.acceptInvitation({
      token: workspaceToken(second.url),
    });
    await expect(
      bob.workspaces.acceptInvitation({ token: workspaceToken(second.url) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      alice.workspaces.invite({
        workspaceId,
        email: "bob@example.com",
        role: "viewer",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const third = await alice.workspaces.invite({
      workspaceId,
      email: "charlie@example.com",
      role: "viewer",
    });
    const pending = (await alice.workspaces.get({ workspaceId }))
      .invitations[0]!;
    await alice.workspaces.revokeInvitation({
      workspaceId,
      invitationId: pending.id,
    });
    await expect(
      charlie.workspaces.acceptInvitation({ token: workspaceToken(third.url) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const fourth = await alice.workspaces.invite({
      workspaceId,
      email: "charlie@example.com",
      role: "viewer",
    });
    const fresh = (await alice.workspaces.get({ workspaceId })).invitations[0]!;
    await db
      .update(schema.workspaceInvitation)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.workspaceInvitation.id, fresh.id));
    expect(
      await findPendingWorkspaceInvitation(
        db as unknown as Database,
        workspaceToken(fourth.url),
      ),
    ).toBeNull();
    expect(
      await findPendingWorkspaceInvitation(
        db as unknown as Database,
        "invalid-token",
      ),
    ).toBeNull();
    await expect(
      charlie.workspaces.acceptInvitation({
        token: workspaceToken(fourth.url),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const audit = await db.select().from(schema.auditLog);
    expect(JSON.stringify(audit)).not.toContain(token);
    expect(audit.some((a) => a.action === "workspace.invitation.accept")).toBe(
      true,
    );
  });

  test("registration acceptance creates membership once and never grants an application role", async () => {
    const { id: workspaceId } = await alice.workspaces.create({
      ...workspaceDefaults,
      kind: "fund",
    });
    const invitation = await alice.workspaces.invite({
      workspaceId,
      email: "new-user@example.com",
      role: "viewer",
    });
    await db.insert(schema.user).values({
      id: "new-user",
      name: "New viewer",
      email: "new-user@example.com",
      role: "user",
    });
    const token = workspaceToken(invitation.url);
    await acceptWorkspaceInvitation(db as unknown as Database, token, {
      id: "new-user",
      email: "new-user@example.com",
    });
    const [newUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, "new-user"));
    expect(newUser!.role).toBe("user");
    expect(
      (await callers("new-user").workspaces.get({ workspaceId })).role,
    ).toBe("viewer");
    await expect(
      acceptWorkspaceInvitation(db as unknown as Database, token, {
        id: "new-user",
        email: "new-user@example.com",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await db.delete(schema.user).where(eq(schema.user.id, "new-user"));
  });

  test("rejects invalid names, currencies, IDs and cross-workspace invitation revocation", async () => {
    await expect(
      alice.workspaces.create({ ...workspaceDefaults, name: " " }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      alice.workspaces.create({ ...workspaceDefaults, displayCurrency: "XYZ" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      alice.accounts.list({ workspaceId: "not-an-id" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { id: workspaceId } =
      await alice.workspaces.create(workspaceDefaults);
    const other = await alice.workspaces.create({
      ...workspaceDefaults,
      name: "Other",
    });
    await alice.workspaces.invite({
      workspaceId,
      email: "bob@example.com",
      role: "viewer",
    });
    const invitationId = (await alice.workspaces.get({ workspaceId }))
      .invitations[0]!.id;
    await expect(
      alice.workspaces.revokeInvitation({
        workspaceId: other.id,
        invitationId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      alice.workspaces.transferOwnership({ workspaceId, userId: "charlie" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

test("concurrent invitation acceptance succeeds once and does not duplicate membership", async () => {
  const { id: workspaceId } = await alice.workspaces.create(workspaceDefaults);
  const invitation = await alice.workspaces.invite({
    workspaceId,
    email: "bob@example.com",
    role: "viewer",
  });
  const token = workspaceToken(invitation.url);
  const outcomes = await Promise.allSettled([
    bob.workspaces.acceptInvitation({ token }),
    bob.workspaces.acceptInvitation({ token }),
  ]);
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect(
    (await alice.workspaces.get({ workspaceId })).members.filter(
      (m) => m.userId === "bob",
    ),
  ).toHaveLength(1);
});

const consolidatedStock = {
  symbol: "SHARED",
  exchange: "XNAS",
  name: "Example company",
  assetClass: "stock" as const,
  currency: "USD",
  quantity: "0.1",
  averageCost: null,
  price: "100",
  value: null,
};

describe("consolidated portfolio", () => {
  test("combines exact fractional quantities across active owned brokers, retains exchange identity and uses only current entries", async () => {
    const a = await alice.accounts.create({ ...broker, name: "Broker A" });
    const b = await alice.accounts.create({ ...broker, name: "Broker B" });
    const c = await alice.accounts.create({ ...broker, name: "Local broker" });
    const archived = await alice.accounts.create({
      ...broker,
      name: "Archived broker",
    });
    const hidden = await bob.accounts.create({
      ...broker,
      name: "Private broker",
    });
    const banking = await alice.accounts.create(bank);
    await alice.portfolio.recordSnapshot({
      accountId: a.id,
      asOf: "2026-08-31",
      positions: [{ ...consolidatedStock, quantity: "999" }],
      cash: [],
    });
    await alice.portfolio.recordSnapshot({
      accountId: a.id,
      asOf: "2026-10-19",
      positions: [consolidatedStock],
      cash: [{ currency: "USD", amount: "10" }],
    });
    await alice.portfolio.recordSnapshot({
      accountId: b.id,
      asOf: "2026-09-30",
      positions: [{ ...consolidatedStock, quantity: "0.2" }],
      cash: [{ currency: "SGD", amount: "5" }],
    });
    await alice.portfolio.recordSnapshot({
      accountId: c.id,
      asOf: "2026-10-01",
      positions: [
        {
          ...consolidatedStock,
          exchange: "XSES",
          currency: "SGD",
          quantity: "5",
          price: "2",
        },
      ],
      cash: [],
    });
    await alice.portfolio.recordSnapshot({
      accountId: archived.id,
      asOf: "2026-10-19",
      positions: [],
      cash: [{ currency: "SGD", amount: "99" }],
    });
    await alice.accounts.remove(archived);
    await bob.portfolio.recordSnapshot({
      accountId: hidden.id,
      asOf: "2026-10-19",
      positions: [consolidatedStock],
      cash: [],
    });
    await alice.portfolio.recordSnapshot({
      accountId: banking.id,
      asOf: "2026-10-19",
      positions: [],
      cash: [{ currency: "SGD", amount: "999" }],
    });
    ratesRequest.mockResolvedValue([
      {
        date: "2026-10-19",
        base: "SGD",
        quote: "USD",
        rate: "0.8",
        source: "frankfurter",
      },
    ]);
    const all = await alice.portfolio.consolidated();
    expect(all).toMatchObject({
      total: "65",
      currency: "SGD",
      selectedBrokerCount: 3,
      archivedCount: 1,
      unpriced: 0,
      unrecorded: 0,
      incomplete: false,
      oldestEntry: "2026-09-30",
      newestEntry: "2026-10-19",
      securities: { total: "47.5" },
      cash: { total: "17.5" },
    });
    expect(all.positions).toHaveLength(2);
    expect(all.positions.find((p) => p.exchange === "XNAS")).toMatchObject({
      symbol: "SHARED",
      quantity: "0.3",
      total: "37.5",
      weight: "57.7",
    });
    expect(all.positions.find((p) => p.exchange === "XSES")).toMatchObject({
      symbol: "SHARED",
      quantity: "5",
      total: "10",
    });
    expect(
      all.positions
        .find((p) => p.exchange === "XNAS")!
        .brokers.map((lot) => [lot.accountId, lot.quantity, lot.asOf]),
    ).toEqual([
      [a.id, "0.1000000000", "2026-10-19"],
      [b.id, "0.2000000000", "2026-09-30"],
    ]);
    expect(all.brokers.map((x) => x.id)).not.toContain(hidden.id);
    expect(all.brokers.map((x) => x.id)).not.toContain(banking.id);
    expect(all.brokers.map((x) => x.id)).not.toContain(archived.id);
    expect(
      all.cashBalances.map((x) => [x.currency, x.amount, x.total]),
    ).toEqual([
      ["SGD", "5", "5"],
      ["USD", "10", "12.5"],
    ]);
    const single = await alice.portfolio.consolidated({ accountId: a.id });
    expect(single).toMatchObject({
      total: "25",
      selectedBrokerCount: 1,
      positions: [{ quantity: "0.1" }],
    });
    expect(single.brokers).toHaveLength(3);
    for (const other of [hidden.id, archived.id, banking.id])
      await expect(
        alice.portfolio.consolidated({ accountId: other }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db
      .insert(schema.userSettings)
      .values({ userId: "alice", displayCurrency: "USD" });
    const usd = await alice.portfolio.consolidated();
    expect(usd).toMatchObject({
      currency: "USD",
      total: "52",
      securities: { total: "38" },
      cash: { total: "14" },
    });
  });

  test("shows missing prices, exchange rates and entries without inventing allocation or zero values", async () => {
    const a = await alice.accounts.create(broker);
    const b = await alice.accounts.create({
      ...broker,
      name: "Foreign broker",
    });
    await alice.accounts.create({ ...broker, name: "Not recorded yet" });
    await alice.portfolio.recordSnapshot({
      accountId: a.id,
      asOf: "2026-10-19",
      positions: [
        {
          ...consolidatedStock,
          symbol: "UNPRICED",
          currency: "SGD",
          price: null,
        },
      ],
      cash: [{ currency: "SGD", amount: "0" }],
    });
    await alice.portfolio.recordSnapshot({
      accountId: b.id,
      asOf: "2026-10-19",
      positions: [consolidatedStock],
      cash: [],
    });
    const all = await alice.portfolio.consolidated();
    expect(all).toMatchObject({
      total: "0",
      incomplete: true,
      unpriced: 1,
      unrecorded: 1,
      unconverted: [{ currency: "USD", amount: "10" }],
    });
    expect(all.positions.every((p) => p.weight === null)).toBe(true);
    expect(all.positions.find((p) => p.symbol === "UNPRICED")).toMatchObject({
      total: null,
      unpriced: 1,
    });
    expect(all.positions.find((p) => p.symbol === "SHARED")).toMatchObject({
      total: null,
      unconverted: [{ currency: "USD", amount: "10" }],
    });
    const cashOnly = await alice.accounts.create({
      ...broker,
      name: "Cash only",
    });
    await alice.portfolio.recordSnapshot({
      accountId: cashOnly.id,
      asOf: "2026-10-19",
      positions: [],
      cash: [{ currency: "SGD", amount: "25" }],
    });
    expect(
      await alice.portfolio.consolidated({ accountId: cashOnly.id }),
    ).toMatchObject({
      total: "25",
      securities: { total: "0" },
      cash: { total: "25" },
      positions: [],
    });
    expect(await charlie.portfolio.consolidated()).toMatchObject({
      total: null,
      brokers: [],
      positions: [],
      cashBalances: [],
    });
  });
});

describe("market prices", () => {
  const quotedAt = new Date("2026-10-19T08:00:00Z");
  const quote = (price: string, currency = "SGD"): Quote => ({
    price,
    previousClose: "74",
    currency,
    quotedAt,
    date: "2026-10-19",
    source: "yahoo",
  });
  const holding = {
    exchange: "XSES",
    name: "",
    assetClass: "stock" as const,
    currency: "SGD",
    averageCost: null,
    value: null,
  };

  test("refreshes held prices into net worth, skipping funds and other-currency listings", async () => {
    const request = spyOn(quotes, "quote").mockImplementation(async (symbol) =>
      symbol === "D05.SI" ? quote("75") : quote("9", "USD"),
    );
    try {
      const account = await alice.accounts.create(broker);
      const entry = {
        accountId: account.id,
        asOf: "2026-10-19",
        positions: [
          { ...holding, symbol: "D05", quantity: "10", price: "70" },
          { ...holding, symbol: "MIS", quantity: "1", price: "8" },
          {
            ...holding,
            symbol: "FUND",
            exchange: "",
            assetClass: "fund" as const,
            quantity: "1",
            price: "5",
          },
        ],
        cash: [],
      };
      await alice.portfolio.addSnapshot(entry);
      expect((await alice.portfolio.netWorth()).prices).toMatchObject({
        feed: true,
        holdings: 3,
        quoted: 0,
        oldest: null,
      });

      // Someone else's refresh never looks up what Alice holds.
      expect(await bob.portfolio.refreshPrices()).toMatchObject({ checked: 0 });
      expect(request).not.toHaveBeenCalled();

      expect(await alice.portfolio.refreshPrices()).toEqual({
        enabled: true,
        checked: 2,
        updated: 1,
        unsupported: ["FUND"],
        failed: [],
        mismatched: ["MIS XSES"],
      });
      const worth = await alice.portfolio.netWorth();
      expect(worth.total).toBe("763");
      expect(worth.prices).toMatchObject({
        holdings: 3,
        quoted: 1,
        oldest: quotedAt,
        change: { total: "10", unconverted: [] },
      });
      const [close] = await db.select().from(schema.priceHistory);
      expect(close).toMatchObject({ date: "2026-10-19", close: "75.00000000" });

      // A statement newer than the quote wins until the next refresh.
      await alice.portfolio.addSnapshot({
        ...entry,
        asOf: "2026-10-20",
        positions: [entry.positions[0]!],
      });
      expect((await alice.portfolio.netWorth()).total).toBe("700");

      // The scheduled refresh covers every open account's latest entry, but not archived ones.
      request.mockClear();
      expect(await refreshQuotes(db as unknown as Database)).toMatchObject({
        checked: 1,
        updated: 1,
      });
      await alice.accounts.remove(account);
      request.mockClear();
      expect(await refreshQuotes(db as unknown as Database)).toMatchObject({
        checked: 0,
      });
      expect(request).not.toHaveBeenCalled();
    } finally {
      request.mockRestore();
    }
  });

  test("coins recorded in SGD are priced in USD and converted", async () => {
    const request = spyOn(quotes, "quote").mockResolvedValue(
      quote("100000", "USD"),
    );
    ratesRequest.mockResolvedValue([
      {
        date: "2026-10-19",
        base: "SGD",
        quote: "USD",
        rate: "0.8",
        source: "frankfurter",
      },
    ]);
    try {
      const account = await alice.accounts.create(broker);
      await alice.portfolio.addSnapshot({
        accountId: account.id,
        asOf: "2026-10-19",
        positions: [
          {
            ...holding,
            symbol: "BTC",
            exchange: "",
            assetClass: "crypto",
            quantity: "0.01",
            averageCost: "100000",
            price: "120000",
          },
        ],
        cash: [],
      });
      expect(await alice.portfolio.refreshPrices()).toMatchObject({
        updated: 1,
        mismatched: [],
      });
      expect(request).toHaveBeenCalledWith("BTC-USD", { force: undefined });
      // 0.01 × US$100,000 = US$1,000 = S$1,250 at 0.8 USD per SGD.
      expect((await alice.portfolio.netWorth()).total).toBe("1250");

      // Viewed in USD the value needs no rate, but the S$1,000 cost still does.
      await db
        .insert(schema.userSettings)
        .values({ userId: "alice", displayCurrency: "USD" });
      const [coin] = (await alice.portfolio.consolidated()).positions;
      expect(coin).toMatchObject({
        total: "1000",
        gain: { cost: "800", amount: "200" },
      });
    } finally {
      request.mockRestore();
    }
  });

  test("past closes backfill the chart before the first entry, once per security", async () => {
    const request = spyOn(quotes, "closes").mockImplementation(
      async (symbol) =>
        symbol === "D05.SI"
          ? {
              currency: "SGD",
              source: "yahoo",
              closes: [
                { date: "2025-10-01", close: "60" },
                { date: "2026-09-30", close: "69" },
                { date: "2026-10-02", close: "72" },
              ],
            }
          : {
              currency: "USD",
              source: "yahoo",
              closes: [{ date: "2025-10-01", close: "80000" }],
            },
    );
    await db.insert(schema.fxRate).values({
      base: "SGD",
      quote: "USD",
      date: "2026-10-01",
      rate: "0.8",
      source: "test",
    });
    try {
      const account = await alice.accounts.create(broker);
      await alice.portfolio.addSnapshot({
        accountId: account.id,
        asOf: "2026-10-01",
        positions: [
          { ...holding, symbol: "D05", quantity: "10", price: "70" },
          {
            ...holding,
            symbol: "BTC",
            exchange: "",
            assetClass: "crypto",
            quantity: "0.01",
            price: "120000",
          },
          {
            ...holding,
            symbol: "FUND",
            exchange: "",
            assetClass: "fund",
            quantity: "1",
            price: "5",
          },
        ],
        cash: [],
      });
      const backfill = (ownerId: string) =>
        backfillPriceHistory(db as unknown as Database, { ownerId });
      expect(await backfill("bob")).toEqual({
        checked: 0,
        stored: 0,
        failed: [],
      });
      expect(await backfill("alice")).toEqual({
        checked: 2,
        stored: 4,
        failed: [],
      });
      expect(request).toHaveBeenCalledWith("D05.SI", "2025-10-01");
      expect(request).toHaveBeenCalledWith("BTC-USD", "2025-10-01");
      // These closes leave months uncovered, so they are asked for again; nothing is duplicated.
      expect(await backfill("alice")).toMatchObject({ checked: 2, stored: 0 });

      expect(
        (await alice.portfolio.netWorthHistory()).points.map((p) => [
          p.date,
          p.total,
          p.backfilled,
        ]),
      ).toEqual([
        // S$600 of shares, US$800 of coin (S$1,000) and the unpriced fund at its S$5.
        ["2025-10-01", "1605", true],
        // The coin's only close is too old by now, so it keeps its statement value.
        ["2026-09-30", "1895", true],
        // On the entry date its own prices win over the previous day's close.
        ["2026-10-01", "1905", false],
        ["2026-10-02", "1925", false],
      ]);

      // Recording the entry's own day keeps the backfilled year before it.
      await recordNetWorth(db as unknown as Database, "alice", "2026-10-01");
      expect(
        (await alice.portfolio.netWorthHistory()).points.map((p) => [
          p.date,
          p.estimated,
          p.backfilled,
        ]),
      ).toEqual([
        ["2025-10-01", true, true],
        ["2026-09-30", true, true],
        ["2026-10-01", false, false],
      ]);
    } finally {
      request.mockRestore();
    }
  });

  test("coin closes saved without a currency do not count as history, and a fetch repairs them", async () => {
    const account = await alice.accounts.create(broker);
    await alice.portfolio.addSnapshot({
      accountId: account.id,
      asOf: "2026-10-01",
      positions: [
        {
          ...holding,
          symbol: "BTC",
          exchange: "",
          assetClass: "crypto",
          quantity: "0.01",
          price: "120000",
        },
      ],
      cash: [],
    });
    await db.insert(schema.fxRate).values({
      base: "SGD",
      quote: "USD",
      date: "2026-10-01",
      rate: "0.8",
      source: "test",
    });
    const [coin] = await db
      .select({ id: schema.security.id })
      .from(schema.security)
      .where(eq(schema.security.symbol, "BTC"));
    // A week apart from a year before the entry until today: complete, but in unknown currency.
    const dates: string[] = [];
    for (
      let d = new Date("2025-10-01T00:00:00Z");
      d.toISOString().slice(0, 10) <= todayIso();
      d.setUTCDate(d.getUTCDate() + 7)
    )
      dates.push(d.toISOString().slice(0, 10));
    dates.push(todayIso());
    await db.insert(schema.priceHistory).values(
      [...new Set(dates)].map((date) => ({
        securityId: coin!.id,
        date,
        close: "80000",
        source: "yahoo",
      })),
    );
    const before = await alice.portfolio.netWorthHistory();
    expect(before.points.some((p) => p.backfilled)).toBe(false);

    const request = spyOn(quotes, "closes").mockResolvedValue({
      currency: "USD",
      source: "yahoo",
      closes: [{ date: "2025-10-01", close: "80000" }],
    });
    try {
      expect(
        await backfillPriceHistory(db as unknown as Database, {
          ownerId: "alice",
        }),
      ).toEqual({ checked: 1, stored: 1, failed: [] });
      const [repaired] = await db
        .select()
        .from(schema.priceHistory)
        .where(eq(schema.priceHistory.date, "2025-10-01"));
      expect(repaired).toMatchObject({
        close: "80000.00000000",
        currency: "USD",
      });
      // US$800 of coin is S$1,000, now drawn from a year before the entry.
      expect((await alice.portfolio.netWorthHistory()).points[0]).toMatchObject(
        {
          date: "2025-10-01",
          total: "1000",
          backfilled: true,
        },
      );
    } finally {
      request.mockRestore();
    }
  });

  test("stored closes only count as history when they cover the range without long gaps", () => {
    const from = "2025-10-01";
    const until = "2026-01-31";
    const weekly = (start: string, weeks: number) =>
      Array.from({ length: weeks }, (_, i) =>
        new Date(Date.parse(`${start}T00:00:00Z`) + i * 7 * 86_400_000)
          .toISOString()
          .slice(0, 10),
      );
    expect(coversRange(weekly("2025-10-01", 18), from, until)).toBe(true);
    // A week-long market holiday is not missing data.
    expect(
      coversRange(
        ["2025-10-01", "2025-10-08", "2025-10-19", ...weekly("2025-10-26", 15)],
        from,
        until,
      ),
    ).toBe(true);
    // A close from long before, with nothing since, does not cover the range.
    expect(coversRange(["2024-03-01", "2024-03-04"], from, until)).toBe(false);
    expect(
      coversRange(["2024-03-01", ...weekly("2025-12-01", 9)], from, until),
    ).toBe(false);
    // Months missing in the middle, or at the end.
    expect(
      coversRange(
        [...weekly("2025-10-01", 4), ...weekly("2026-01-01", 5)],
        from,
        until,
      ),
    ).toBe(false);
    expect(coversRange(weekly("2025-10-01", 10), from, until)).toBe(false);
    expect(coversRange([], from, until)).toBe(false);
  });

  test("the move since the previous close is hidden when any quoted holding lacks one", async () => {
    const request = spyOn(quotes, "quote").mockImplementation(async (symbol) =>
      symbol === "D05.SI"
        ? quote("75")
        : { ...quote("8"), previousClose: null },
    );
    try {
      const account = await alice.accounts.create(broker);
      await alice.portfolio.addSnapshot({
        accountId: account.id,
        asOf: "2026-10-19",
        positions: [
          { ...holding, symbol: "D05", quantity: "10", price: "70" },
          { ...holding, symbol: "U11", quantity: "10", price: "8" },
        ],
        cash: [],
      });
      await alice.portfolio.refreshPrices();
      expect((await alice.portfolio.netWorth()).prices).toMatchObject({
        quoted: 2,
        change: null,
      });
    } finally {
      request.mockRestore();
    }
  });

  test("an older response never replaces a newer stored quote, and the feed can be turned off", async () => {
    const request = spyOn(quotes, "quote").mockResolvedValue(quote("75"));
    const settings = cachedInstanceSettings();
    try {
      const account = await alice.accounts.create(broker);
      await alice.portfolio.addSnapshot({
        accountId: account.id,
        asOf: "2026-10-01",
        positions: [{ ...holding, symbol: "D05", quantity: "1", price: "70" }],
        cash: [],
      });
      await alice.portfolio.refreshPrices();
      request.mockResolvedValue({
        ...quote("60"),
        quotedAt: new Date("2026-10-18T08:00:00Z"),
      });
      await alice.portfolio.refreshPrices();
      expect((await alice.portfolio.netWorth()).total).toBe("75");

      setCachedInstanceSettings({ ...settings, priceQuotes: false });
      request.mockClear();
      expect(await alice.portfolio.refreshPrices()).toMatchObject({
        enabled: false,
        checked: 0,
      });
      expect(request).not.toHaveBeenCalled();
      expect((await alice.portfolio.netWorth()).prices?.feed).toBe(false);
    } finally {
      setCachedInstanceSettings(settings);
      request.mockRestore();
    }
  });

  test("a market price far from the statement price is not used", async () => {
    // Bitcoin entered as a stock maps to Yahoo's "BTC", which is an ETF.
    const request = spyOn(quotes, "quote").mockImplementation(async (symbol) =>
      symbol === "BTC" ? quote("36.14", "USD") : quote("81700", "USD"),
    );
    try {
      const account = await alice.accounts.create(broker);
      const coin = {
        ...holding,
        symbol: "BTC",
        exchange: "",
        currency: "USD",
        quantity: "0.5",
        price: "80000",
      };
      const entry = await alice.portfolio.addSnapshot({
        accountId: account.id,
        asOf: "2026-10-01",
        positions: [coin],
        cash: [],
      });
      await alice.portfolio.refreshPrices();
      let holdings = (await alice.accounts.get(account)).holdings!;
      expect(holdings.totals).toEqual([{ currency: "USD", amount: "40000" }]);
      expect((await alice.portfolio.netWorth()).prices).toMatchObject({
        quoted: 0,
        implausible: ["BTC in Broker"],
      });

      // Correcting the type drops the wrong quote; the next refresh asks for the coin.
      const { version } = await alice.portfolio.snapshot({
        accountId: account.id,
        snapshotId: entry.id,
      });
      await alice.portfolio.updateSnapshot({
        snapshotId: entry.id,
        version,
        entry: {
          accountId: account.id,
          asOf: "2026-10-01",
          positions: [{ ...coin, assetClass: "crypto" }],
          cash: [],
        },
      });
      expect(await db.select().from(schema.securityQuote)).toEqual([]);
      await alice.portfolio.refreshPrices();
      expect(request).toHaveBeenLastCalledWith("BTC-USD", {
        force: undefined,
      });
      holdings = (await alice.accounts.get(account)).holdings!;
      expect(holdings.totals).toEqual([{ currency: "USD", amount: "40850" }]);
    } finally {
      request.mockRestore();
    }
  });
});

describe("correcting holdings", () => {
  const d05: Parameters<
    typeof alice.portfolio.addSnapshot
  >[0]["positions"][number] = {
    symbol: "D05",
    exchange: "XSES",
    name: "",
    assetClass: "stock",
    currency: "SGD",
    quantity: "100",
    averageCost: null,
    price: "74",
    value: null,
  };
  const listings = async (symbol: string) =>
    (
      await db
        .select()
        .from(schema.security)
        .where(eq(schema.security.symbol, symbol))
    )
      .map((s) => `${s.currency} ${s.assetClass} ${s.name ?? ""}`.trim())
      .sort();

  test("a holding entered in the wrong currency can be corrected and does not block anyone", async () => {
    const account = await alice.accounts.create(broker);
    const typo = await alice.portfolio.addSnapshot({
      accountId: account.id,
      asOf: "2026-10-01",
      positions: [{ ...d05, currency: "USD" }],
      cash: [],
    });
    const { version } = await alice.portfolio.snapshot({
      accountId: account.id,
      snapshotId: typo.id,
    });
    await alice.portfolio.updateSnapshot({
      snapshotId: typo.id,
      version,
      entry: {
        accountId: account.id,
        asOf: "2026-10-01",
        positions: [d05],
        cash: [],
      },
    });
    expect((await alice.accounts.get(account)).holdings?.totals).toEqual([
      { currency: "SGD", amount: "7400" },
    ]);
    const bobAccount = await bob.accounts.create(broker);
    await bob.portfolio.addSnapshot({
      accountId: bobAccount.id,
      asOf: "2026-10-01",
      positions: [d05],
      cash: [],
    });
    expect(await listings("D05")).toEqual(["SGD stock", "USD stock"]);
  });

  test("a corrected type or name sticks, unless someone else holds the instrument", async () => {
    const account = await alice.accounts.create(broker);
    const entry = {
      accountId: account.id,
      asOf: "2026-10-01",
      positions: [{ ...d05, assetClass: "fund" } as typeof d05],
      cash: [],
    };
    const created = await alice.portfolio.addSnapshot(entry);
    const edit = async (positions: (typeof entry)["positions"]) =>
      alice.portfolio.updateSnapshot({
        snapshotId: created.id,
        version: (
          await alice.portfolio.snapshot({
            accountId: account.id,
            snapshotId: created.id,
          })
        ).version,
        entry: { ...entry, positions },
      });
    await edit([{ ...d05, name: "DBS Group" }]);
    expect(await listings("D05")).toEqual(["SGD stock DBS Group"]);

    const bobAccount = await bob.accounts.create(broker);
    await bob.portfolio.addSnapshot({
      ...entry,
      accountId: bobAccount.id,
      positions: [d05],
    });
    await edit([{ ...d05, assetClass: "etf", name: "Something else" }]);
    expect(await listings("D05")).toEqual(["SGD stock DBS Group"]);
  });

  test("entries cannot be dated in the future", async () => {
    const account = await alice.accounts.create(broker);
    const future = new Date(Date.now() + 3 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await expect(
      alice.portfolio.addSnapshot({
        accountId: account.id,
        asOf: future,
        positions: [],
        cash: [{ currency: "SGD", amount: "1" }],
      }),
    ).rejects.toThrow("The entry date can't be in the future");
    await alice.portfolio.addSnapshot({
      accountId: account.id,
      asOf: new Date().toISOString().slice(0, 10),
      positions: [],
      cash: [{ currency: "SGD", amount: "1" }],
    });
  });
});
