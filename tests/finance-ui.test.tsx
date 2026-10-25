import { afterEach, expect, mock, setSystemTime, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

import { ConsolidatedPortfolio } from "../src/components/portfolio/consolidated-portfolio";
import { consolidateHoldings } from "../src/server/modules/portfolio/consolidated";
import type { Holdings } from "../src/server/modules/portfolio/holdings";
import { ImportReview } from "../src/components/imports/import-review";
import { BulkEditDrawer } from "../src/components/spending/bulk-edit-drawer";
import { TransactionDrawer } from "../src/components/spending/transaction-drawer";
import { TransferReview } from "../src/components/spending/transfer-review";
import { MobileTransactionRow } from "../src/components/spending/mobile-transaction-row";
import { SpendingView } from "../src/components/spending/spending-view";
import { AccountRow } from "../src/components/overview/account-row";
import { AccountsView } from "../src/components/accounts/accounts-view";
import { BalanceDate } from "../src/components/finance/balance-date";
import { TransferFreshnessNotices } from "../src/components/overview/transfer-freshness-notices";
import { AmountsProvider, AmountsScope } from "../src/components/finance/privacy";
import { transferFreshnessWarnings } from "../src/server/modules/transfers/freshness";
import { NetWorthChart } from "../src/components/overview/net-worth-chart";
import { netWorthSeries } from "../src/lib/net-worth-series";
import { formatDate } from "../src/lib/format";
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

test("net worth chart renders nearby large balances without hanging or invalid coordinates", () => {
  // A child process bounds a regression that would otherwise block the whole test runner.
  const result = Bun.spawnSync({
    cmd: [
      process.execPath,
      "--eval",
      `
        import { createElement } from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import { NetWorthChart } from "./src/components/overview/net-worth-chart";
        for (const totals of [
          ["9007199254740992", "9007199254740994"],
          ["1000000000000", "1000000000000.0001"],
          ["-9007199254740994", "-9007199254740992"],
          ["0", "0"],
          ["100", "200"],
        ]) {
          const points = totals.map((total, i) => ({
            date: i ? "2026-10-19" : "2026-10-18",
            total, estimated: false, backfilled: false, partial: false,
          }));
          console.log(renderToStaticMarkup(createElement(NetWorthChart, { series: [{ key: "all", label: "Net worth", points, headline: true }], currency: "SGD" })));
        }
      `,
    ],
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 2000,
  });
  expect(result.exitCode).toBe(0);
  const html = result.stdout.toString();
  expect(html.match(/<figure/g)).toHaveLength(5);
  expect(html).not.toMatch(/NaN|Infinity/);
  expect(html).toContain("9,007,199,254,740,994.00");
});

test("net worth chart marks backfilled days apart from estimates and recorded days", () => {
  const point = (
    date: string,
    total: string,
    kind: "backfilled" | "estimated" | "recorded",
  ) => ({
    date,
    total,
    partial: false,
    estimated: kind !== "recorded",
    backfilled: kind === "backfilled",
  });
  const html = renderToStaticMarkup(
    <NetWorthChart
      currency="SGD"
      series={[
        {
          key: "all",
          label: "Net worth",
          headline: true,
          points: [
            point("2025-10-01", "900", "backfilled"),
            point("2026-06-01", "950", "backfilled"),
            point("2026-10-01", "1000", "estimated"),
            point("2026-10-20", "1100", "recorded"),
          ],
        },
      ]}
    />,
  );
  // One line per kind: dotted for backfilled, dashed for estimated, solid for recorded.
  expect(html.match(/<path/g)).toHaveLength(3);
  expect(html).toContain('stroke-dasharray="1 4"');
  expect(html).toContain('stroke-dasharray="5 5"');
  // The change since the first, backfilled, day carries the asterisk.
  expect(html).toContain('aria-label="backfilled">*</span>');
  expect(html).toContain("Unable to determine the cost price or purchase date");
  // The backfilled stretch is shaded and labelled, ending on its last backfilled day.
  expect(html).toMatch(
    /class="bg-wash absolute inset-y-0" style="left:0%;width:63\.\d+%">/,
  );
  expect(html).toContain(">Backfilled*</span>");
  expect(html.match(/· backfilled\*/g)).toHaveLength(2);
  expect(html.match(/· estimated/g)).toHaveLength(1);

  // With one series there is nothing to pick between.
  expect(html).not.toContain("Net worth chart data");

  const recorded = (total: string) => [
    point("2026-10-19", total, "recorded"),
    point("2026-10-20", total, "recorded"),
  ];
  const groups = renderToStaticMarkup(
    <NetWorthChart
      currency="SGD"
      series={[
        {
          key: "all",
          label: "Net worth",
          points: recorded("1000"),
          headline: true,
        },
        { key: "investments", label: "Investments", points: recorded("700") },
        { key: "banking", label: "Bank & cards", points: recorded("200") },
        { key: "cpf_srs", label: "CPF & SRS", points: recorded("100") },
      ]}
    />,
  );
  expect(groups).not.toContain("backfilled");
  expect(groups).toContain('aria-label="Net worth chart data"');
  expect(groups.match(/aria-selected="true"/g)).toHaveLength(1);
  expect(groups).toMatch(/aria-selected="true"[^>]*>Net worth</);
  expect(groups).toContain(">Investments</button>");
  expect(groups).toContain(">CPF &amp; SRS</button>");
  // The whole net worth is the figure above the chart, so its caption shows only the change.
  expect(groups).toContain(">Over time</span>");
  // The first series is drawn until another is picked.
  expect(groups).toContain("S$1,000.00");
  expect(groups).not.toContain("S$700.00");
});

test("chart series keep an unknown figure unknown and show groups without a net worth total", () => {
  const point = (date: string, total: string) => ({
    date,
    total,
    partial: false,
    estimated: true,
    backfilled: false,
  });
  const none = { entered: false, total: null, partial: false };
  // Nothing of the investments could be converted today: no drop to S$0, and too short to draw.
  expect(
    netWorthSeries({
      trend: [point("2026-10-01", "100"), point("2026-10-25", "100")],
      groups: {
        investments: [point("2026-10-01", "100")],
        banking: [],
        cpf_srs: [],
      },
      today: "2026-10-25",
      now: {
        investments: { entered: true, total: null, partial: true },
        banking: none,
        cpf_srs: none,
      },
    }).map((s) => s.key),
  ).toEqual(["all"]);

  // Only CPF, not counted in net worth: there is no total, but CPF still has a chart.
  const cpfOnly = netWorthSeries({
    trend: [],
    groups: {
      investments: [],
      banking: [],
      cpf_srs: [point("2026-09-01", "600"), point("2026-10-25", "650")],
    },
    today: "2026-10-25",
    now: {
      investments: none,
      banking: none,
      cpf_srs: { entered: true, total: "700", partial: false },
    },
  });
  expect(cpfOnly).toEqual([
    {
      key: "cpf_srs",
      label: "CPF & SRS",
      points: [
        point("2026-09-01", "600"),
        // Today's point replaces any recorded earlier today.
        {
          date: "2026-10-25",
          total: "700",
          partial: false,
          estimated: false,
          backfilled: false,
        },
      ],
    },
  ]);
  // A group first in line is not the figure above the chart, so its caption shows its value.
  const html = renderToStaticMarkup(
    <NetWorthChart series={cpfOnly} currency="SGD" />,
  );
  expect(html).toContain('<span class="eyebrow mr-2">CPF &amp; SRS</span>');
  expect(html).toContain("S$700.00");
  expect(html).not.toContain("Net worth chart data");
});

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

test("balance dates stay visible and stale labels allow a monthly statement cadence in account rows and lists", () => {
  setSystemTime(new Date("2026-10-15T12:00:00Z"));
  const recent = renderToStaticMarkup(<BalanceDate asOf="2026-08-31" />);
  expect(recent).toContain('dateTime="2026-08-31"');
  expect(recent).not.toContain("Stale balance");
  const old = { ...brokerTotal, asOf: "2026-08-30" };
  const row = renderToStaticMarkup(<AccountRow account={old} currency="SGD" />);
  expect(row).toContain("As of");
  expect(row).toContain(formatDate(old.asOf));
  expect(row).toContain("Stale balance");
  expect(row).toContain("more than 45 days old");
  expect(row).not.toMatch(/class="sensitive"[^>]*>[^<]*As of/);
  const list = render(<AccountsView />, (client) =>
    client.setQueryData(getQueryKey(api.accounts.list, undefined, "query"), [
      { ...old, archivedAt: null },
    ]),
  );
  expect(list).toContain("Stale balance");
  expect(list).toContain('dateTime="2026-08-30"');
});

test("transfer freshness notices explain both dates and native amounts inside the net-worth privacy scope", () => {
  const warnings = transferFreshnessWarnings(
    [
      {
        id: "confirmed",
        outgoing: {
          accountId,
          accountName: "DBS",
          date: "2026-09-18",
          amount: "-2000",
          currency: "SGD",
        },
        incoming: {
          accountId: "receiver",
          accountName: "OCBC",
          date: "2026-09-20",
          amount: "1490",
          currency: "USD",
        },
      },
    ],
    new Map([
      [accountId, { asOf: "2026-08-31" }],
      ["receiver", { asOf: "2026-09-30" }],
    ]),
  );
  const html = render(
    <AmountsProvider initial={{ hidden: true, scopes: {} }}>
      <AmountsScope scope="overview-net-worth">
        <TransferFreshnessNotices warnings={warnings} />
      </AmountsScope>
    </AmountsProvider>,
  );
  expect(html).toContain('data-amounts-scope="hidden"');
  expect(html).toContain("counted twice in net worth");
  expect(html).toContain('<span class="sensitive">S$2,000.00</span>');
  expect(html).toContain('<span class="sensitive">US$1,490.00</span>');
  for (const date of ["2026-09-18", "2026-09-20", "2026-08-31", "2026-09-30"])
    expect(html).toContain(formatDate(date));
  expect(html).toContain(`href="/accounts/${accountId}"`);
  expect(html).toContain("Update DBS");
  const shared = renderToStaticMarkup(
    <TransferFreshnessNotices warnings={warnings} workspaceId={workspaceId} />,
  );
  expect(shared).toContain(
    `href="/workspaces/${workspaceId}/accounts/${accountId}"`,
  );
  expect(shared).toContain("Ask the owner to update DBS");
  const missing = renderToStaticMarkup(
    <TransferFreshnessNotices
      warnings={[
        { ...warnings[0]!, kind: "missing", staleAccountId: "receiver" },
      ]}
    />,
  );
  expect(missing).toContain("missing from net worth");
  expect(missing).toContain('href="/accounts/receiver"');
  expect(renderToStaticMarkup(<TransferFreshnessNotices warnings={[]} />)).toBe(
    "",
  );
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
  transferLinkId: null,
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
    updatedAt: new Date(),
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
    statementDates: ["2026-09-30"],
    importedHoldingsAsOf: "2026-09-30",
    importedHoldingsAdjusted: false,
    stale: false,
    summary: null,
    rows: [
      {
        id: "a",
        kind: "cash_balance",
        data: {
          currency: "SGD",
          amount: "10",
          bucket: null,
          balanceDirection: null,
          openingBalance: null,
          openingBalanceDirection: null,
        },
        matchStatus: "new",
        decision: "accept",
        committedRecordId: "snapshot",
        removed: false,
      },
      {
        id: "b",
        kind: "cash_balance",
        data: {
          currency: "USD",
          amount: "20",
          bucket: null,
          balanceDirection: null,
          openingBalance: null,
          openingBalanceDirection: null,
        },
        matchStatus: "new",
        decision: "skip",
        committedRecordId: "snapshot",
        removed: true,
      },
      {
        id: "c",
        kind: "cash_balance",
        data: {
          currency: "HKD",
          amount: "30",
          bucket: null,
          balanceDirection: null,
          openingBalance: null,
          openingBalanceDirection: null,
        },
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

test("import review requires a missing statement date and warns about dated replacements", () => {
  const id = "88888888-8888-4888-8888-888888888888";
  const job: RouterOutputs["imports"]["get"] = {
    id,
    status: "needs_review",
    error: null,
    model: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: null,
    finishedAt: null,
    documentId: "99999999-9999-4999-8999-999999999999",
    fileName: "statement.pdf",
    mimeType: "application/pdf",
    periodStart: null,
    periodEnd: null,
    accountId,
    accountName: "Broker",
    accountArchivedAt: null,
    accountType: "brokerage",
    accountCurrency: "SGD",
    institutionName: null,
    institutionKey: null,
    latestHoldingsAsOf: "2026-10-01",
    statementDates: ["2026-10-01", "2026-09-30"],
    importedHoldingsAsOf: null,
    importedHoldingsAdjusted: false,
    stale: false,
    summary: null,
    rows: [
      {
        id: "balance",
        kind: "cash_balance",
        data: {
          currency: "SGD",
          amount: "100",
          bucket: null,
          balanceDirection: null,
          openingBalance: null,
          openingBalanceDirection: null,
        },
        matchStatus: "new",
        decision: "accept",
        committedRecordId: null,
        removed: false,
      },
    ],
  };
  const review = (data: typeof job) =>
    render(<ImportReview id={id} />, (client) =>
      client.setQueryData(getQueryKey(api.imports.get, { id }, "query"), data),
    );
  const undated = review(job);
  expect(undated).toContain("Choose the statement date before saving");
  expect(undated).toMatch(/<input[^>]*type="date"[^>]*value=""/);
  const save = undated
    .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
    ?.find((button) => button.includes("Save "));
  expect(save).toContain('disabled=""');

  const dated = review({
    ...job,
    summary: {
      documentType: "brokerage_statement",
      institutionName: null,
      accountLast4: null,
      currency: "SGD",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      openingBalance: null,
      closingBalance: null,
      warnings: [],
    },
  });
  expect(dated).not.toContain("Choose the statement date before saving");
  expect(dated).toContain(
    "Saving replaces the statement holdings or balance already saved for",
  );
  expect(dated).toContain("The newer entry remains the current account value");

  const trades = review({
    ...job,
    rows: [
      {
        id: "trade",
        kind: "investment_transaction",
        data: {
          reference: null,
          tradeDate: "2026-09-15",
          settleDate: null,
          type: "buy",
          symbol: "AAPL",
          quantity: "1",
          price: "100",
          amount: "-100",
          fees: null,
          currency: "SGD",
          description: null,
        },
        matchStatus: "new",
        decision: "accept",
        committedRecordId: null,
        removed: false,
      },
    ],
  });
  // Even a trade-only document needs a dated context for linking its listings.
  expect(trades).toContain('type="date"');
  expect(trades).toContain("Choose the statement date before saving");
  const saved = review({
    ...job,
    status: "completed",
    accountType: "checking",
    importedHoldingsAsOf: "2026-09-30",
  });
  expect(saved).toContain(`balance on ${formatDate("2026-09-30")}`);
  expect(saved).not.toContain("balance on the statement date");
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

test("manual and bulk entry expose Expense, Income and Transfer choices with direction preserved", () => {
  const manual = render(
    <TransactionDrawer
      transaction={{
        ...transaction,
        isTransfer: true,
        reconciliationId: "closed",
      }}
      defaultAccountId={null}
      onClose={() => undefined}
      onSaved={async () => undefined}
    />,
  );
  expect(manual).toContain('aria-label="Transaction type"');
  expect(manual).toContain(
    '<option value="transfer" selected="">Transfer</option>',
  );
  expect(manual).toContain('value="income" disabled=""');
  expect(manual).toContain('aria-label="Direction"');
  const bulk = render(
    <BulkEditDrawer
      rows={[transaction, { ...transaction, id: "incoming", amount: "20" }]}
      action="edit"
      onClose={() => undefined}
      onSaved={async () => undefined}
    />,
  );
  expect(bulk).toContain('aria-label="Transaction type"');
  expect(bulk).toContain('value="expense" disabled=""');
  expect(bulk).toContain('value="income" disabled=""');
  expect(bulk).toContain('<option value="transfer">Transfer</option>');
  expect(bulk).toContain("Keep existing types");
});

test("import review keeps transfer categories editable and exposes sign-aware transaction types", () => {
  const id = "88888888-8888-4888-8888-888888888888";
  const job: RouterOutputs["imports"]["get"] = {
    id,
    status: "needs_review",
    error: null,
    model: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: null,
    finishedAt: null,
    documentId: "99999999-9999-4999-8999-999999999999",
    fileName: "transfers.pdf",
    mimeType: "application/pdf",
    periodStart: null,
    periodEnd: null,
    accountId,
    accountName: "Bank",
    accountArchivedAt: null,
    accountType: "checking",
    accountCurrency: "SGD",
    institutionName: null,
    institutionKey: null,
    latestHoldingsAsOf: null,
    statementDates: [],
    importedHoldingsAsOf: null,
    importedHoldingsAdjusted: false,
    stale: false,
    summary: null,
    rows: [
      {
        id: "transfer-row",
        kind: "transaction",
        data: {
          postedDate: "2026-10-01",
          transactionDate: null,
          description: "Broker funding",
          reference: null,
          merchant: null,
          amount: "-100",
          currency: "SGD",
          printedDirection: null,
          printedAmount: null,
          signMismatch: false,
          suggestedAmount: null,
          originalAmount: null,
          originalCurrency: null,
          categoryId,
          isTransfer: true,
        },
        matchStatus: "new",
        decision: "accept",
        committedRecordId: null,
        removed: false,
      },
    ],
  };
  const html = render(<ImportReview id={id} />, (client) => {
    client.setQueryData(getQueryKey(api.imports.get, { id }, "query"), job);
    client.setQueryData(
      getQueryKey(api.catalog.categories, undefined, "query"),
      [
        {
          id: categoryId,
          key: "transfers",
          name: "Transfers",
          kind: "transfer",
          parentId: null,
          color: null,
        },
      ],
    );
  });
  expect(html).toContain('aria-label="Transaction type"');
  expect(html).toContain(
    '<option value="transfer" selected="">Transfer</option>',
  );
  expect(html).toContain('value="income" disabled=""');
  expect(html).toContain('aria-label="Category"');
  expect(html).toContain(
    `<option value="${categoryId}" selected="">Transfers</option>`,
  );
});

test("bank and trade possible duplicates show Keep/Skip actions and block Save until resolved", () => {
  const id = "88888888-8888-4888-8888-888888888888";
  type Job = RouterOutputs["imports"]["get"];
  const bankRow: Job["rows"][number] = {
    id: "bank-pending",
    kind: "transaction",
    data: {
      reference: "bank-ref",
      postedDate: "2026-09-15",
      transactionDate: null,
      description: "Coffee",
      merchant: null,
      amount: "-5",
      currency: "SGD",
      printedDirection: null,
      printedAmount: null,
      signMismatch: false,
      suggestedAmount: null,
      originalAmount: null,
      originalCurrency: null,
      categoryId: null,
      isTransfer: false,
    },
    matchStatus: "possible_duplicate",
    decision: "pending",
    committedRecordId: null,
    removed: false,
  };
  const tradeRow: Job["rows"][number] = {
    id: "trade-pending",
    kind: "investment_transaction",
    data: {
      reference: "trade-ref",
      tradeDate: "2026-09-15",
      settleDate: null,
      type: "buy",
      symbol: "AAPL",
      quantity: "1",
      price: "100",
      amount: "-100",
      fees: null,
      currency: "SGD",
      description: "Bought AAPL",
    },
    matchStatus: "possible_duplicate",
    decision: "pending",
    committedRecordId: null,
    removed: false,
  };
  for (const row of [bankRow, tradeRow]) {
    const job: Job = {
      id,
      status: "needs_review",
      error: null,
      model: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      startedAt: null,
      finishedAt: null,
      documentId: "99999999-9999-4999-8999-999999999999",
      fileName: "statement.pdf",
      mimeType: "application/pdf",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      accountId,
      accountName: "Example account",
      accountArchivedAt: null,
      accountType: row.kind === "transaction" ? "checking" : "brokerage",
      accountCurrency: "SGD",
      institutionName: null,
      institutionKey: null,
      latestHoldingsAsOf: null,
      statementDates: [],
      importedHoldingsAsOf: null,
      importedHoldingsAdjusted: false,
      stale: false,
      summary: {
        documentType: "bank_statement",
        institutionName: null,
        accountLast4: null,
        currency: "SGD",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        openingBalance: null,
        closingBalance: null,
        warnings: [],
      },
      rows: [
        row,
        { ...row, id: `${row.id}-second` },
        {
          id: "balance",
          kind: "cash_balance",
          data: {
            currency: "SGD",
            amount: "100",
            bucket: null,
            balanceDirection: null,
            openingBalance: null,
            openingBalanceDirection: null,
          },
          matchStatus: "new",
          decision: "accept",
          committedRecordId: null,
          removed: false,
        },
      ],
    };
    const review = (data: Job) =>
      render(<ImportReview id={id} />, (client) => {
        client.setQueryData(
          getQueryKey(api.imports.get, { id }, "query"),
          data,
        );
        client.setQueryData(
          getQueryKey(api.catalog.categories, undefined, "query"),
          [],
        );
      });
    const saveButton = (html: string) =>
      html
        .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
        ?.find((button) => button.includes("Save "));
    const pending = review(job);
    expect(pending).toContain("2 possible duplicates need");
    expect(pending).toContain("2 undecided");
    expect(pending).toContain("Needs decision");
    expect(pending).toContain("bg-warn-wash");
    expect(pending).toContain(">Keep</button>");
    expect(pending).toContain(">Skip</button>");
    expect(pending).toContain(`Ref ${row.data.reference}`);
    expect(saveButton(pending)).toContain('disabled=""');
    const resolved = review({
      ...job,
      rows: job.rows.map((r, i) => ({
        ...r,
        decision: i === 0 ? "skip" : "accept",
      })),
    });
    expect(resolved).not.toContain("undecided");
    expect(resolved).not.toContain("Needs decision");
    expect(saveButton(resolved)).not.toContain('disabled=""');
  }
});

test("import amount warnings show printed evidence and corrections without blocking Save", () => {
  type Job = RouterOutputs["imports"]["get"];
  const id = "88888888-8888-4888-8888-888888888888";
  const job: Job = {
    id,
    status: "needs_review",
    error: null,
    model: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: null,
    finishedAt: null,
    documentId: "99999999-9999-4999-8999-999999999999",
    fileName: "card.pdf",
    mimeType: "application/pdf",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    accountId,
    accountName: "Card",
    accountArchivedAt: null,
    accountType: "credit_card",
    accountCurrency: "SGD",
    institutionName: null,
    institutionKey: null,
    latestHoldingsAsOf: null,
    statementDates: [],
    importedHoldingsAsOf: null,
    importedHoldingsAdjusted: false,
    stale: false,
    summary: {
      documentType: "card_statement",
      institutionName: null,
      accountLast4: null,
      currency: "SGD",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      openingBalance: null,
      closingBalance: null,
      warnings: [],
    },
    rows: [
      {
        id: "refund",
        kind: "transaction",
        data: {
          postedDate: "2026-09-01",
          transactionDate: null,
          description: "Refund",
          reference: null,
          merchant: null,
          amount: "-45",
          printedDirection: "credit",
          printedAmount: "45.00",
          signMismatch: true,
          suggestedAmount: "45",
          currency: "SGD",
          originalAmount: null,
          originalCurrency: null,
          categoryId: null,
          isTransfer: false,
        },
        matchStatus: "new",
        decision: "accept",
        committedRecordId: null,
        removed: false,
      },
      {
        id: "debt",
        kind: "cash_balance",
        data: {
          currency: "SGD",
          amount: "-100",
          bucket: null,
          openingBalance: "-50",
          balanceDirection: "owed",
          openingBalanceDirection: "owed",
        },
        matchStatus: "new",
        decision: "accept",
        committedRecordId: null,
        removed: false,
      },
    ],
  };
  const review = (data: Job) =>
    render(<ImportReview id={id} />, (client) => {
      client.setQueryData(getQueryKey(api.imports.get, { id }, "query"), data);
      client.setQueryData(
        getQueryKey(api.catalog.categories, undefined, "query"),
        [],
      );
    });
  const html = review(job);
  expect(html).toContain("Statement shows CR 45.00");
  expect(html).toContain("Check amount/direction");
  expect(html).toContain("Confirm current amount");
  expect(html).toContain("Use +S$45.00");
  expect(html).toContain("1 amount/direction warnings (saving allowed)");
  expect(html).toContain('aria-label="Edit amount for Refund"');
  expect(html).toContain(
    'aria-label="Edit amount for SGD closing/cash balance"',
  );
  const save = html
    .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
    ?.find((button) => button.includes("Save 2 to"));
  expect(save).toBeDefined();
  expect(save).not.toContain('disabled=""');
  const skipped = review({
    ...job,
    rows: job.rows.map((row) =>
      row.id === "refund" ? { ...row, decision: "skip" } : row,
    ),
  });
  expect(skipped).not.toContain("warnings (saving allowed)");
  const completed = review({ ...job, status: "completed" });
  expect(completed).not.toContain("Edit amount");
  expect(completed).not.toContain("Confirm current amount");
  const broker = review({
    ...job,
    accountType: "brokerage",
    rows: [
      job.rows[1]!,
      {
        id: "trade-edit",
        kind: "investment_transaction",
        data: {
          reference: null,
          tradeDate: "2026-09-01",
          settleDate: null,
          type: "buy",
          symbol: "AAPL",
          quantity: "1",
          price: "45",
          amount: "-45",
          fees: null,
          currency: "SGD",
          description: null,
        },
        matchStatus: "new",
        decision: "accept",
        committedRecordId: null,
        removed: false,
      },
    ],
  });
  expect(broker).toContain('aria-label="Edit amount for buy AAPL"');
  expect(broker).toContain(
    'aria-label="Edit amount for SGD closing/cash balance"',
  );
});

test("import balance review distinguishes extraction, saved gaps, currencies, provisional choices and acknowledgment", () => {
  type Job = RouterOutputs["imports"]["get"];
  type TransactionRow = Extract<Job["rows"][number], { kind: "transaction" }>;
  const id = "88888888-8888-4888-8888-888888888888";
  const row = (id: string, amount: string): TransactionRow => ({
    id,
    kind: "transaction",
    decision: "accept",
    matchStatus: "new",
    committedRecordId: null,
    removed: false,
    data: {
      postedDate: "2026-09-10",
      transactionDate: null,
      description: id,
      merchant: null,
      reference: null,
      amount,
      currency: "SGD",
      printedAmount: null,
      printedDirection: null,
      signMismatch: false,
      suggestedAmount: null,
      originalAmount: null,
      originalCurrency: null,
      categoryId: null,
      isTransfer: false,
    },
  });
  const job: Job = {
    id,
    status: "needs_review",
    error: null,
    model: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: null,
    finishedAt: null,
    documentId: "99999999-9999-4999-8999-999999999999",
    fileName: "balance.pdf",
    mimeType: "application/pdf",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    accountId,
    accountName: "Bank",
    accountArchivedAt: null,
    accountType: "checking",
    accountCurrency: "SGD",
    institutionName: null,
    institutionKey: null,
    latestHoldingsAsOf: null,
    statementDates: [],
    importedHoldingsAsOf: null,
    importedHoldingsAdjusted: false,
    stale: false,
    summary: {
      documentType: "bank_statement",
      institutionName: null,
      accountLast4: null,
      currency: "SGD",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      openingBalance: 100,
      closingBalance: 70,
      warnings: [],
    },
    rows: [row("Purchase", "-20"), { ...row("Fee", "-10"), decision: "skip" }],
  };
  const review = (data: Job) =>
    render(<ImportReview id={id} />, (client) => {
      client.setQueryData(getQueryKey(api.imports.get, { id }, "query"), data);
      client.setQueryData(
        getQueryKey(api.catalog.categories, undefined, "query"),
        [],
      );
    });
  const save = (html: string) =>
    html
      .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
      ?.find((b) => b.includes(" to Bank"));
  const gap = review(job);
  expect(gap).toContain("Extraction balances: matches");
  expect(gap).toContain("Saved records will balance: S$10.00 over closing");
  expect(gap).toContain("Skipped rows explain the difference");
  expect(gap).toContain("Fee · −S$10.00");
  expect(gap).toContain("I&#x27;ve checked this — save anyway");
  expect(save(gap)).toContain('disabled=""');
  const recorded = review({
    ...job,
    rows: [job.rows[0]!, { ...job.rows[1]!, matchStatus: "duplicate" }],
  });
  expect(recorded).toContain("Saved records will balance: matches");
  expect(recorded).not.toContain("save anyway");
  expect(save(recorded)).toBeDefined();
  expect(save(recorded)).not.toContain('disabled=""');
  const foreign = review({
    ...job,
    rows: [
      job.rows[0]!,
      { ...job.rows[1]!, decision: "accept" },
      {
        ...row("Foreign", "-999"),
        data: { ...row("Foreign", "-999").data, currency: "USD" },
      },
    ],
  });
  expect(foreign).toContain("1 line in USD not included");
  expect(foreign).not.toContain("save anyway");
  const pending = review({
    ...job,
    rows: [
      job.rows[0]!,
      {
        ...job.rows[1]!,
        decision: "pending",
        matchStatus: "possible_duplicate",
      },
    ],
  });
  expect(pending).toContain("Provisional — decide possible duplicates");
  expect(save(pending)).toContain('disabled=""');
  const partial = review({
    ...job,
    summary: { ...job.summary!, openingBalance: null },
  });
  expect(partial).toContain(
    "Unverified — no opening/closing balance to check against",
  );
  expect(partial).not.toContain("save anyway");
  expect(save(partial)).not.toContain('disabled=""');
  const completed = review({
    ...job,
    status: "completed",
    summary: {
      ...job.summary!,
      balanceAcknowledgment: { acknowledgedAt: "2026-10-25T00:00:00Z" },
    },
  });
  expect(completed).toContain("Saved with an acknowledged balance mismatch");
  expect(completed).not.toContain("save anyway");
  const card = review({
    ...job,
    accountType: "credit_card",
    summary: {
      ...job.summary!,
      documentType: "card_statement",
      closingBalance: 20,
      openingBalanceDirection: "owed",
      closingBalanceDirection: "credit",
    },
    rows: [row("Card payment", "120")],
  });
  expect(card).toContain("−S$100.00");
  expect(card).toContain("Saved records will balance: matches");
  expect(card).not.toContain("save anyway");
});

test("transfer review renders three suggested pairs once, two unpaired sides and linked transfers", () => {
  type Review = RouterOutputs["transfers"]["list"];
  const outgoing: Review["unmatched"][number] = {
    kind: "transaction",
    id: transaction.id,
    accountId,
    accountName: "Everyday bank",
    date: "2026-10-03",
    direction: "out",
    amount: "-1000",
    currency: "SGD",
    description: "Broker funding",
  };
  const incoming: typeof outgoing = {
    ...outgoing,
    kind: "investment",
    id: "44444444-4444-4444-8444-444444444444",
    accountId: "55555555-5555-4555-8555-555555555555",
    accountName: "Broker deposit",
    date: "2026-10-05",
    direction: "in",
    amount: "750",
    currency: "USD",
  };
  const suggestions: Review["suggestions"] = [
    {
      outgoing,
      incoming,
      feeAmount: null,
      feeCurrency: null,
      fxRate: "0.75",
      differenceRatio: "0",
      days: 2,
    },
    ...["Fee", "Exact"].map((name) => ({
      outgoing: {
        ...outgoing,
        id: `out-${name}`,
        accountName: `${name} bank`,
      },
      incoming: {
        ...incoming,
        id: `in-${name}`,
        accountName: `${name} savings`,
        amount: name === "Fee" ? "997" : "1000",
        currency: "SGD",
      },
      feeAmount: name === "Fee" ? "3.0000" : null,
      feeCurrency: name === "Fee" ? "SGD" : null,
      fxRate: null,
      differenceRatio: name === "Fee" ? "0.003" : "0",
      days: 2,
    })),
  ];
  const review: Review = {
    unmatched: [
      ...suggestions.flatMap((match) => [match.outgoing, match.incoming]),
      { ...outgoing, id: "unpaired-out", accountName: "Unpaired bank" },
      { ...incoming, id: "unpaired-in", accountName: "Unpaired broker" },
    ],
    fxAsOf: "2026-10-05",
    suggestions,
    links: [
      {
        id: "linked",
        outgoing,
        incoming,
        feeAmount: "3.0000",
        feeCurrency: "SGD",
      },
    ],
    excluded: [
      { ...outgoing, id: "excluded", accountName: "External account payment" },
    ],
  };
  const html = render(<TransferReview />, (client) =>
    client.setQueryData(
      getQueryKey(api.transfers.list, undefined, "query"),
      review,
    ),
  );
  expect(html).toContain("Suggested matches (3 pairs)");
  expect(html).toContain("Without a match (2)");
  expect(html).toContain("Linked transfers (1)");
  expect(html).not.toContain("Unmatched transfers");
  expect(html).not.toContain("Suggested counterpart");
  const suggested = html
    .split("Suggested matches (3 pairs)")[1]!
    .split("Without a match (2)")[0]!;
  expect(suggested.match(/<li\b/g)).toHaveLength(3);
  expect(suggested.match(/>Confirm<\/button>/g)).toHaveLength(3);
  expect(suggested.match(/>Not a pair<\/button>/g)).toHaveLength(3);
  expect(suggested.match(/>Choose another \/ fee<\/button>/g)).toHaveLength(3);
  expect(suggested.match(/From /g)).toHaveLength(3);
  expect(suggested.match(/To /g)).toHaveLength(3);
  expect(suggested.match(/→/g)).toHaveLength(3);
  for (const match of suggestions) {
    for (const side of [match.outgoing, match.incoming]) {
      expect(suggested.split(side.accountName)).toHaveLength(2);
    }
  }
  expect(suggested).toContain("Implied fee:");
  expect(suggested).not.toContain("Unpaired");
  const unpaired = html
    .split("Without a match (2)")[1]!
    .split("Linked transfers (1)")[0]!;
  expect(unpaired.match(/<li\b/g)).toHaveLength(2);
  expect(unpaired).toContain("Unpaired bank");
  expect(unpaired).toContain("Unpaired broker");
  expect(unpaired.match(/>Choose another \/ fee<\/button>/g)).toHaveLength(2);
  expect(unpaired.match(/>No counterpart in Finfolio<\/button>/g)).toHaveLength(
    2,
  );
  expect(unpaired).not.toContain(">Confirm</button>");
  expect(html).toContain("Everyday bank");
  expect(html).toContain("Broker deposit");
  expect(html).toContain("Approximate FX: 1 SGD = 0.75 USD");
  expect(html).toContain("Confirm");
  expect(html).toContain("Choose another / fee");
  expect(html).toContain("No counterpart in Finfolio");
  expect(html).toContain("Review again");
  expect(html).toContain("Unlink");
  expect(html).toContain("sensitive");
  expect(html).toContain("no transactions are created");
});

test("linked transfers have a small indicator on mobile transactions and spending links to review", () => {
  const html = renderToStaticMarkup(
    <MobileTransactionRow
      transaction={{
        ...transaction,
        isTransfer: true,
        transferLinkId: "linked",
      }}
      selected={false}
      disabled={false}
      onSelect={() => undefined}
      onEdit={() => undefined}
    />,
  );
  expect(html).toContain("Transfer · Linked");
  const spending = render(
    <SpendingView initialAccountId={null} initialMonth="2026-10" />,
  );
  expect(spending).toContain('href="/spending/transfers"');
});

test("transfer review explains unmatched sides and an empty queue", () => {
  const review = {
    unmatched: [],
    suggestions: [],
    links: [],
    excluded: [],
    fxAsOf: null,
  };
  const html = render(<TransferReview />, (client) =>
    client.setQueryData(
      getQueryKey(api.transfers.list, undefined, "query"),
      review,
    ),
  );
  expect(html).toContain("Suggested matches (0 pairs)");
  expect(html).toContain("Without a match (0)");
  expect(html).toContain("Linked transfers (0)");
  expect(html).toContain("No suggested matches.");
  expect(html).toContain("No transfers without a match.");
});
