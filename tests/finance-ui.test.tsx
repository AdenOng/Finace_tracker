import { afterEach, expect, mock, setSystemTime, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

import { TransactionDrawer } from "../src/components/spending/transaction-drawer";
import { SpendingView } from "../src/components/spending/spending-view";
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
    cash: [{ currency: "SGD", amount: "100" }],
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
