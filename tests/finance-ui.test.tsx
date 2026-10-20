import { afterEach, expect, mock, setSystemTime, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

import { ConsolidatedPortfolio } from "../src/components/portfolio/consolidated-portfolio";
import { consolidateHoldings } from "../src/server/modules/portfolio/consolidated";
import type { Holdings } from "../src/server/modules/portfolio/holdings";
import { ImportReview } from "../src/components/imports/import-review";
import { TransactionDrawer } from "../src/components/spending/transaction-drawer";
import { SpendingView } from "../src/components/spending/spending-view";
import { AccountRow } from "../src/components/overview/account-row";
import { PortfolioSettings } from "../src/components/overview/portfolio-settings";
import { createQueryClient } from "../src/trpc/query-client";
import { api, type RouterOutputs } from "../src/trpc/react";

await mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    refresh: () => undefined,
  }),
}));
const { AccountDetail } =
  await import("../src/components/accounts/account-detail");
const { WorkspaceManagement } =
  await import("../src/components/workspaces/workspace-management");

const originalZone = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalZone;
  setSystemTime();
});

const accountId = "11111111-1111-4111-8111-111111111111";
const brokerTotal: RouterOutputs["portfolio"]["netWorth"]["accounts"][number] =
  {
    id: accountId,
    ownerId: "alice",
    ownerName: "Alice",
    name: "Broker",
    type: "brokerage",
    last4: null,
    institutionName: "Interactive Brokers",
    institutionKey: "ibkr",
    asOf: "2026-10-19",
    unpriced: 0,
    totals: [
      { currency: "USD", amount: "1100" },
      { currency: "SGD", amount: "12.63" },
    ],
    total: "1387.63",
    unconverted: [],
  };

test("broker rows show one converted holdings-and-cash total instead of currency balances", () => {
  const html = renderToStaticMarkup(
    <AccountRow account={brokerTotal} currency="SGD" />,
  );
  expect(html).toContain("S$1,387.63");
  expect(html).not.toContain("US$1,100");
  expect(html).not.toContain("S$12.63");
  expect(html).not.toContain("Partial");
  const incomplete = renderToStaticMarkup(
    <AccountRow
      account={{
        ...brokerTotal,
        total: "12.63",
        unconverted: [{ currency: "USD", amount: "1100" }],
      }}
      currency="SGD"
    />,
  );
  expect(incomplete).toContain("Partial");
  expect(incomplete).not.toContain("US$1,100");
  const unrecorded = renderToStaticMarkup(
    <AccountRow
      account={{ ...brokerTotal, asOf: null, total: null, totals: [] }}
      currency="SGD"
    />,
  );
  expect(unrecorded).toContain("Not recorded");
});

test("portfolio settings expose accessible SVG gear buttons in both card headers", () => {
  const html = renderToStaticMarkup(
    <PortfolioSettings currency="SGD" id="test-currency" />,
  );
  expect(html).toContain('aria-label="Net worth display settings"');
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain("<svg");
  expect(html).toContain("SGD");
  const investment = renderToStaticMarkup(
    <PortfolioSettings currency="SGD" id="investment-currency" iconOnly />,
  );
  expect(investment).toContain('aria-label="Investment display settings"');
});
const categoryId = "22222222-2222-4222-8222-222222222222";
const transaction: RouterOutputs["spending"]["list"][number] = {
  id: "33333333-3333-4333-8333-333333333333",
  accountId,
  accountName: "Bank",
  postedDate: "2026-10-01",
  description: "Coffee",
  merchant: null,
  amount: "-100",
  currency: "USD",
  categoryId,
  categoryName: "Archived category",
  categoryColor: null,
  categorySource: "rule",
  isTransfer: false,
  notes: null,
  source: "manual",
  cleared: false,
  reconciliationId: null,
};

function render(
  children: ReactNode,
  setup?: (client: ReturnType<typeof createQueryClient>) => void,
) {
  const queryClient = createQueryClient();
  queryClient.setQueryData(getQueryKey(api.accounts.list, undefined, "query"), [
    {
      id: accountId,
      name: "Bank",
      type: "checking",
      currency: "SGD",
      archivedAt: null,
    },
  ]);
  queryClient.setQueryData(
    getQueryKey(api.catalog.categories, undefined, "query"),
    [],
  );
  queryClient.setQueryData(
    getQueryKey(api.catalog.currencies, undefined, "query"),
    [{ code: "SGD" }],
  );
  queryClient.setQueryData(
    getQueryKey(api.reconciliation.list, { accountId }, "query"),
    [],
  );
  queryClient.setQueryData(
    getQueryKey(api.catalog.institutions, undefined, "query"),
    [],
  );
  queryClient.setQueryData(getQueryKey(api.settings.get, undefined, "query"), {
    displayCurrency: "SGD",
  });
  setup?.(queryClient);
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <api.Provider
        client={api.createClient({ links: [] })}
        queryClient={queryClient}
      >
        {children}
      </api.Provider>
    </QueryClientProvider>,
  );
}

test("editing keeps archived category and inactive currency selected in the actual form", () => {
  const html = render(
    <TransactionDrawer
      transaction={transaction}
      defaultAccountId={null}
      onClose={() => undefined}
      onSaved={async () => undefined}
    />,
  );
  expect(html).toContain(
    `<option value="${categoryId}" selected="">Archived category (archived)</option>`,
  );
  expect(html).toContain(
    '<option value="USD" selected="">USD (inactive)</option>',
  );
});

test("month heading matches server markup across UTC and Singapore at the month boundary", () => {
  setSystemTime(new Date("2026-09-30T16:30:00Z"));
  process.env.TZ = "UTC";
  // The page serializes this month for the first browser render.
  const server = render(
    <SpendingView initialAccountId={null} initialMonth="2026-09" />,
  );
  process.env.TZ = "Asia/Singapore";
  const browser = render(
    <SpendingView initialAccountId={null} initialMonth="2026-09" />,
  );
  expect(browser).toBe(server);
  expect(browser).toContain("September 2026");
});

const workspaceId = "44444444-4444-4444-8444-444444444444";
const sharedAccount: RouterOutputs["accounts"]["get"] = {
  id: accountId,
  ownerId: "owner",
  ownerName: "Account Owner",
  name: "Shared bank",
  type: "checking",
  currency: "SGD",
  last4: null,
  notes: null,
  institutionId: null,
  institutionName: null,
  institutionKey: null,
  archivedAt: null,
  createdAt: new Date("2026-10-01"),
  holdings: {
    snapshotId: "55555555-5555-4555-8555-555555555555",
    asOf: "2026-10-01",
    source: "manual",
    positions: [],
    cash: [{ currency: "SGD", amount: "100", bucket: null }],
    totals: [{ currency: "SGD", amount: "100" }],
    unpriced: 0,
  },
};

test("shared account detail renders financial data without editing or reconciliation controls", () => {
  const html = render(
    <AccountDetail
      id={accountId}
      workspaceId={workspaceId}
      initialAccount={sharedAccount}
    />,
  );
  expect(html).toContain("Shared by Account Owner");
  expect(html).toContain("Read-only");
  expect(html).toContain("S$100.00");
  expect(html).toContain("entered by the owner");
  expect(html).not.toContain("Update balance");
  expect(html).not.toContain(">Edit<");
  expect(html).not.toContain("Reconcile");
  expect(html).not.toContain("entered by you");
  expect(html).toContain(`/workspaces/${workspaceId}`);
  const personal = render(
    <AccountDetail id={accountId} initialAccount={sharedAccount} />,
  );
  expect(personal).toContain("Update balance");
  expect(personal).toContain(">Edit<");
});

test("workspace viewer markup omits sharing, invitation and membership management controls", () => {
  const w: RouterOutputs["workspaces"]["get"] = {
    id: workspaceId,
    name: "Fund audience",
    kind: "fund",
    ownerId: "owner",
    displayCurrency: "SGD",
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: "viewer",
    role: "viewer",
    shares: [{ accountId, sharedById: "owner" }],
    invitations: [],
    members: [
      { userId: "owner", name: "Owner", role: "owner" },
      { userId: "viewer", name: "Viewer", role: "viewer" },
    ],
  };
  const account = {
    ...sharedAccount,
    asOf: "2026-10-01",
    totals: [{ currency: "SGD", amount: "100" }],
    unpriced: 0,
  };
  const html = render(
    <WorkspaceManagement workspace={w} accounts={[account]} />,
  );
  expect(html).toContain("Viewers can read shared accounts");
  expect(html).toContain("Leave workspace");
  expect(html).not.toContain("Share account</button>");
  expect(html).not.toContain("Stop sharing</button>");
  expect(html).not.toContain("Create invitation link");
  expect(html).not.toContain("Remove member</button>");
  expect(html).not.toContain("Delete workspace</button>");
  const owner = render(
    <WorkspaceManagement
      workspace={{ ...w, userId: "owner", role: "owner" }}
      accounts={[account]}
    />,
  );
  expect(owner).toContain("Create invitation link");
  expect(owner).toContain("Stop sharing");
  expect(owner).toContain("Transfer ownership");
});

test("personal and distinct workspace queries have separate cache identities", () => {
  const other = "66666666-6666-4666-8666-666666666666";
  expect(getQueryKey(api.accounts.list, undefined, "query")).not.toEqual(
    getQueryKey(api.accounts.list, { workspaceId }, "query"),
  );
  expect(getQueryKey(api.accounts.get, { id: accountId }, "query")).not.toEqual(
    getQueryKey(api.accounts.get, { id: accountId, workspaceId }, "query"),
  );
  expect(
    getQueryKey(api.portfolio.netWorth, { workspaceId }, "query"),
  ).not.toEqual(
    getQueryKey(api.portfolio.netWorth, { workspaceId: other }, "query"),
  );
});

test("shared account detail hides cached financial data after permission errors", () => {
  const input = { id: accountId, workspaceId };
  const html = render(
    <AccountDetail
      id={accountId}
      workspaceId={workspaceId}
      initialAccount={sharedAccount}
    />,
    (client) => {
      const key = getQueryKey(api.accounts.get, input, "query");
      client.setQueryData(key, sharedAccount);
      client
        .getQueryCache()
        .find({ queryKey: key })!
        .setState({ error: new Error("Account not found"), status: "error" });
    },
  );
  expect(html).toContain("Account not found");
  expect(html).not.toContain("S$100.00");
  expect(html).not.toContain("Shared bank");
});

test("completed imports expose removal only for saved rows and keep removed evidence distinct from excluded rows", () => {
  const id = "88888888-8888-4888-8888-888888888888";
  const job: RouterOutputs["imports"]["get"] = {
    id,
    status: "completed",
    error: null,
    model: null,
    createdAt: new Date(),
    startedAt: null,
    finishedAt: null,
    documentId: "99999999-9999-4999-8999-999999999999",
    fileName: "example.png",
    mimeType: "image/png",
    periodStart: null,
    periodEnd: null,
    accountId,
    accountName: "Broker",
    accountArchivedAt: null,
    accountType: "brokerage",
    accountCurrency: "SGD",
    institutionName: null,
    institutionKey: null,
    latestHoldingsAsOf: "2026-09-30",
    importedHoldingsAsOf: "2026-09-30",
    importedHoldingsAdjusted: false,
    stale: false,
    summary: null,
    rows: [
      {
        id: "a",
        kind: "cash_balance",
        data: { currency: "SGD", amount: "10", bucket: null },
        matchStatus: "new",
        decision: "accept",
        committedRecordId: "snapshot",
        removed: false,
      },
      {
        id: "b",
        kind: "cash_balance",
        data: { currency: "USD", amount: "20", bucket: null },
        matchStatus: "new",
        decision: "skip",
        committedRecordId: "snapshot",
        removed: true,
      },
      {
        id: "c",
        kind: "cash_balance",
        data: { currency: "HKD", amount: "30", bucket: null },
        matchStatus: "duplicate",
        decision: "skip",
        committedRecordId: null,
        removed: false,
      },
    ],
  };
  const html = render(<ImportReview id={id} />, (client) =>
    client.setQueryData(getQueryKey(api.imports.get, { id }, "query"), job),
  );
  expect(html).toContain('aria-label="Remove SGD cash"');
  expect(html).not.toContain('aria-label="Remove USD cash"');
  expect(html).not.toContain('aria-label="Remove HKD cash"');
  expect(html).toContain("Removed");
  expect(html).toContain("Excluded");
  expect(html).toContain("US$20.00");
  expect(html).not.toContain('type="checkbox"');
  const pending = render(<ImportReview id={id} />, (client) =>
    client.setQueryData(getQueryKey(api.imports.get, { id }, "query"), {
      ...job,
      status: "needs_review",
      rows: [job.rows[0]],
    }),
  );
  expect(pending).toContain('type="checkbox"');
  expect(pending).not.toContain('aria-label="Remove SGD cash"');
  const archived = render(<ImportReview id={id} />, (client) =>
    client.setQueryData(getQueryKey(api.imports.get, { id }, "query"), {
      ...job,
      accountArchivedAt: new Date(),
    }),
  );
  expect(archived).toContain("Restore original account");
  expect(archived).toContain(
    "Adding this broker again creates a separate account",
  );
  expect(archived).toContain("Restore the original account to manage this row");
  const orphaned = render(<ImportReview id={id} />, (client) =>
    client.setQueryData(getQueryKey(api.imports.get, { id }, "query"), {
      ...job,
      accountId: null,
      accountName: null,
      accountType: null,
    }),
  );
  expect(orphaned).toContain("The original account was deleted");
  expect(orphaned).not.toContain("Restore original account");
});

test("consolidated portfolio renders combined quantities, expandable broker dates, search, cash and missing-data labels", () => {
  const accounts = [
    {
      id: accountId,
      name: "Broker A",
      type: "brokerage" as const,
      institutionName: null,
      institutionKey: null,
    },
    {
      id: "88888888-8888-4888-8888-888888888888",
      name: "Broker B",
      type: "srs" as const,
      institutionName: null,
      institutionKey: null,
    },
  ];
  const entries = new Map<string, Holdings>(
    accounts.map((a, i) => [
      a.id,
      {
        snapshotId: "snapshot",
        asOf: i ? "2026-09-30" : "2026-10-19",
        source: i ? "statement" : "manual",
        positions: [
          {
            id: a.id,
            securityId: "same-stock",
            symbol: "SHARED",
            exchange: "XNAS",
            name: "Example company",
            assetClass: "stock",
            currency: "SGD",
            quantity: i ? "0.2" : "0.1",
            averageCost: i ? null : "80",
            statementPrice: "100",
            statementValue: null,
            quotedAt: null,
            implausibleQuote: false,
            value: { currency: "SGD", amount: i ? "20" : "10" },
            dayChange: null,
          },
        ],
        cash: [{ currency: "SGD", amount: "5", bucket: null }],
        totals: [{ currency: "SGD", amount: i ? "25" : "15" }],
        unpriced: 0,
      },
    ]),
  );
  // With a cost on every lot: 0.3 units cost 24 and are worth 30.
  const costed = new Map(
    [...entries].map(([id, h]) => [
      id,
      {
        ...h,
        positions: h.positions.map((p) => ({ ...p, averageCost: "80" })),
      },
    ]),
  );
  const withCost = consolidateHoldings(accounts, costed, "SGD", new Map());
  expect(withCost.positions[0]!.gain).toEqual({
    cost: "24",
    amount: "6",
    percent: "25.0",
  });
  expect(withCost.gain).toEqual({ amount: "6", percent: "25.0", holdings: 1 });
  // Every lot has a cost but one has no price: its cost would otherwise read as a loss.
  const halfPriced = consolidateHoldings(
    accounts,
    new Map(
      [...costed].map(([id, h], i) => [
        id,
        {
          ...h,
          positions: h.positions.map((p) => (i ? { ...p, value: null } : p)),
          unpriced: i,
        },
      ]),
    ),
    "SGD",
    new Map(),
  );
  expect(halfPriced.positions[0]!.gain).toBeNull();
  expect(halfPriced.gain).toBeNull();
  expect(withCost.positions[0]!.inSrs).toBe(true);
  expect(withCost.srs?.total).toBe("25");
  const portfolio = {
    ...consolidateHoldings(accounts, entries, "SGD", new Map()),
    fxAsOf: null,
    archivedCount: 1,
  };
  const setup = (client: ReturnType<typeof createQueryClient>) =>
    client.setQueryData(
      getQueryKey(api.portfolio.consolidated, undefined, "query"),
      portfolio,
    );
  const html = render(<ConsolidatedPortfolio />, setup);
  expect(html).toContain("Portfolio");
  expect(html).toContain("Nasdaq");
  expect(html).toContain("75.0%");
  expect(html).toContain(">SRS<");
  expect(html).toContain("<span>40</span>");
  expect(html).toContain("0.3");
  expect(html).toContain("units · ");
  expect(html).toContain("Broker A");
  expect(html).toContain("Broker B");
  expect(html).toContain("30 Sept 2026");
  expect(html).toContain("19 Oct 2026");
  expect(html).toContain("Imported");
  expect(html).toContain("Manual");
  expect(html).toContain('aria-label="Filter by broker"');
  // Cost is known for one of the two lots only, so no gain is claimed for the holding.
  expect(portfolio.positions[0]!.gain).toBeNull();
  expect(portfolio.gain).toBeNull();
  expect(html).toContain("Search holdings");
  expect(html).toContain("<summary");
  expect(html).toContain("Broker cash");
  expect(html).toContain("archived account");
  expect(html).not.toContain(">Partial<");
  const incomplete = render(<ConsolidatedPortfolio />, (client) =>
    client.setQueryData(
      getQueryKey(api.portfolio.consolidated, undefined, "query"),
      {
        ...portfolio,
        incomplete: true,
        unpriced: 1,
        unrecorded: 1,
        brokers: [
          ...portfolio.brokers,
          {
            ...portfolio.brokers[0]!,
            id: "99999999-9999-4999-8999-999999999999",
            name: "Broker C",
            asOf: null,
            total: null,
          },
        ],
        unconverted: [{ currency: "USD", amount: "100" }],
        positions: portfolio.positions.map((p) => ({ ...p, weight: null })),
      },
    ),
  );
  expect(incomplete).toContain("Partial");
  expect(incomplete).toContain("no price");
  expect(incomplete).toContain("Nothing recorded");
  expect(incomplete).toContain("Waiting for exchange rates");
  expect(incomplete).toContain("Broker C");
  expect(incomplete).not.toContain("75.0%");
});
