import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError, type TRPCLink } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import { observable } from "@trpc/server/observable";
import { Window } from "happy-dom";
import { act, type ReactNode } from "react";
import type { createRoot as createReactRoot, Root } from "react-dom/client";

import { Combobox } from "~/components/ui/combobox";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { Drawer } from "~/components/ui/dialog";
import { LocaleProvider } from "~/i18n/client";
import en from "~/i18n/messages/en";
import { checkImportBalance } from "~/lib/import-balance-check";
import type { AppRouter } from "~/server/api/root";
import { api, type RouterOutputs } from "~/trpc/react";

await mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    refresh: () => undefined,
  }),
  usePathname: () => "/spending",
}));

const { ImportReview } = await import("~/components/imports/import-review");
const { SpendingView } = await import("~/components/spending/spending-view");

const dom = new Window({ url: "https://finfolio.test/spending" });
const globals = {
  window: dom,
  Event: dom.Event,
  MouseEvent: dom.MouseEvent,
  document: dom.document,
  requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
  cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
  IS_REACT_ACT_ENVIRONMENT: true,
};
const originals = Object.getOwnPropertyDescriptors(globalThis);
let createRoot: typeof createReactRoot;

beforeAll(async () => {
  Object.assign(globalThis, globals);
  ({ createRoot } = await import("react-dom/client"));
});

afterAll(async () => {
  for (const name of Object.keys(globals)) {
    const original = originals[name as keyof typeof originals];
    if (original) Object.defineProperty(globalThis, name, original);
    else Reflect.deleteProperty(globalThis, name);
  }
  await dom.happyDOM.close();
});

const accountId = "11111111-1111-4111-8111-111111111111";
const id = "88888888-8888-4888-8888-888888888888";
const account = {
  id: accountId,
  name: "Everyday Bank",
  type: "checking",
  currency: "SGD",
  archivedAt: null,
};

async function render(
  child: ReactNode,
  respond: (path: string, input: unknown) => unknown = () => undefined,
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  });
  queryClient.setQueryData(getQueryKey(api.accounts.list, undefined, "query"), [
    account,
  ]);
  queryClient.setQueryData(
    getQueryKey(api.catalog.categories, undefined, "query"),
    [],
  );
  queryClient.setQueryData(
    getQueryKey(api.catalog.currencies, undefined, "query"),
    [{ code: "SGD" }],
  );
  const calls: { path: string; input: unknown }[] = [];
  const link: TRPCLink<AppRouter> =
    () =>
    ({ op }) =>
      observable((observer) => {
        calls.push({ path: op.path, input: op.input });
        try {
          observer.next({ result: { data: respond(op.path, op.input) } });
          observer.complete();
        } catch (error) {
          observer.error(TRPCClientError.from(error as Error));
        }
      });
  const client = api.createClient({ links: [link] });
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <api.Provider client={client} queryClient={queryClient}>
          <LocaleProvider locale="en" messages={en}>
            {child}
          </LocaleProvider>
        </api.Provider>
      </QueryClientProvider>,
    );
  });
  const wrap = (node: ReactNode) => (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={client} queryClient={queryClient}>
        <LocaleProvider locale="en" messages={en}>
          {node}
        </LocaleProvider>
      </api.Provider>
    </QueryClientProvider>
  );
  return {
    container,
    calls,
    async rerender(next: ReactNode) {
      await act(async () => root.render(wrap(next)));
    },
    async cleanup() {
      await act(async () => root.unmount());
      queryClient.clear();
      container.remove();
    },
  };
}

function button(container: HTMLElement, name: string) {
  const found = [...container.querySelectorAll("button")].find(
    (element) =>
      (element.getAttribute("aria-label") ?? element.textContent?.trim()) ===
      name,
  );
  if (!found) throw new Error(`Cannot find button: ${name}`);
  return found;
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

test("dirty Drawer keeps edits until discard is confirmed", async () => {
  const onClose = mock(() => undefined);
  const view = await render(
    <Drawer open onClose={onClose} title="Edit entry">
      <input aria-label="Description" defaultValue="Old entry" />
    </Drawer>,
  );
  try {
    const input = view.container.querySelector("input")!;
    input.value = "New entry";
    await act(async () => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(button(view.container, "Close"));
    expect(onClose).not.toHaveBeenCalled();
    expect(view.container.querySelector('[role="alert"]')).not.toBeNull();
    await click(button(view.container, "Keep editing"));
    expect(input.value).toBe("New entry");
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
    await click(button(view.container, "Close"));
    await click(button(view.container, "Discard"));
    expect(onClose).toHaveBeenCalledTimes(1);
  } finally {
    await view.cleanup();
  }
});

test("Import Review gates Save on acknowledgment and Discard on a second click", async () => {
  const job = {
    id,
    status: "needs_review",
    error: null,
    model: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    startedAt: null,
    finishedAt: null,
    documentId: id,
    fileName: "synthetic.pdf",
    mimeType: "application/pdf",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    accountId,
    accountName: account.name,
    accountType: "checking",
    accountCurrency: "SGD",
    accountArchivedAt: null,
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
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      openingBalance: 100,
      closingBalance: 70,
      warnings: [],
    },
    rows: [
      {
        id: accountId,
        kind: "transaction",
        matchStatus: "new",
        decision: "accept",
        committedRecordId: null,
        removed: false,
        data: {
          postedDate: "2026-10-01",
          transactionDate: null,
          description: "Groceries",
          amount: "-10",
          currency: "SGD",
          merchant: null,
          reference: null,
          printedAmount: null,
          printedDirection: null,
          signMismatch: false,
          suggestedAmount: null,
          originalAmount: null,
          originalCurrency: null,
          categoryId: null,
          isTransfer: false,
        },
      },
    ],
  } satisfies Omit<RouterOutputs["imports"]["get"], "balanceCheck">;
  const view = await render(
    <ImportReview
      id={id}
      initialJob={{ ...job, balanceCheck: checkImportBalance(job) }}
    />,
    () => ({ ok: true }),
  );
  try {
    const save = button(view.container, "Save 1 to Everyday Bank");
    expect(save.disabled).toBeTrue();
    await click(view.container.querySelector('input[type="checkbox"]')!);
    expect(save.disabled).toBeFalse();
    expect(view.calls.some((call) => call.path === "imports.get")).toBeFalse();
    await click(button(view.container, "Discard"));
    expect(
      view.calls.some((call) => call.path === "imports.discard"),
    ).toBeFalse();
    await click(button(view.container, "Click again to confirm"));
    expect(
      view.calls.filter((call) => call.path === "imports.discard"),
    ).toEqual([{ path: "imports.discard", input: { jobId: id } }]);
  } finally {
    await view.cleanup();
  }
});

test("Spending writes account filters to the URL and exports the filtered results with an error alert on failure", async () => {
  const row = {
    id,
    accountId,
    accountName: account.name,
    createdAt: "2026-10-01 00:00:00+00",
    postedDate: "2026-10-01",
    description: "Coffee",
    merchant: null,
    amount: "-10",
    currency: "SGD",
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categorySource: null,
    isTransfer: false,
    transferLinkId: null,
    source: "manual",
    notes: null,
    cleared: false,
    reconciliationId: null,
  } satisfies RouterOutputs["spending"]["list"][number];
  // First a transport failure (no server error data), then a deliberate server error.
  let exportFailure: unknown = new Error("signal is aborted without reason");
  const view = await render(
    <SpendingView
      initialMonth="2026-10"
      initialAccountId={null}
      hasExplicitMonth
    />,
    (path) => {
      if (path === "spending.list") return [row];
      if (path === "spending.export") throw exportFailure;
      return [];
    },
  );
  try {
    await click(button(view.container, "Filter by account"));
    const option = [
      ...view.container.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((element) => element.textContent?.trim() === account.name)!;
    await act(async () => {
      option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(new URL(window.location.href).searchParams.get("account")).toBe(
      accountId,
    );
    expect(
      view.calls.some(
        (call) =>
          call.path === "spending.list" &&
          (call.input as { accountId?: string }).accountId === accountId,
      ),
    ).toBeTrue();
    // The filter change refetches the list; Export stays disabled until that settles.
    const exportButton = () =>
      button(view.container, "Export these transactions as CSV");
    for (let i = 0; exportButton().disabled && i < 50; i++)
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    await click(exportButton());
    expect(
      view.calls.find((call) => call.path === "spending.export")?.input,
    ).toMatchObject({
      accountId,
      month: "2026-10",
    });
    const alertText = () =>
      view.container.querySelector('[role="alert"]')?.textContent ?? "";
    expect(alertText()).toContain(en.spending.spendingView.exportFailed);
    expect(alertText()).not.toContain("signal is aborted");
    await click(button(view.container, "Dismiss"));
    expect(view.container.querySelector('[role="alert"]')).toBeNull();

    exportFailure = {
      error: {
        message: "Too many rows to export",
        code: -32600,
        data: { code: "BAD_REQUEST", httpStatus: 400 },
      },
    };
    await click(exportButton());
    expect(alertText()).toContain("Too many rows to export");
    await click(button(view.container, "Dismiss"));
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
  } finally {
    await view.cleanup();
  }
});

test("ConfirmButton cancels on Escape and on blur", async () => {
  const onConfirm = mock(() => undefined);
  const view = await render(
    <ConfirmButton onConfirm={onConfirm}>Remove</ConfirmButton>,
  );
  try {
    await click(button(view.container, "Remove"));
    const armed = button(view.container, "Click again to confirm");
    await act(async () => {
      armed.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(button(view.container, "Remove")).toBeTruthy();

    await click(button(view.container, "Remove"));
    await act(async () => {
      button(view.container, "Click again to confirm").dispatchEvent(
        new window.FocusEvent("focusout", { bubbles: true }),
      );
    });
    await click(button(view.container, "Remove"));
    expect(onConfirm).not.toHaveBeenCalled();
    await click(button(view.container, "Click again to confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  } finally {
    await view.cleanup();
  }
});

test("Combobox keeps the typed filter when its parent re-renders", async () => {
  function Parent({ tick }: { tick: number }) {
    // A fresh options array on every render, as most callers pass.
    const options = [
      { value: "", label: `All categories ${tick > 0 ? "" : ""}`.trim() },
      { value: "a", label: "Groceries" },
      { value: "b", label: "Transport" },
    ];
    return (
      <Combobox
        value=""
        onChange={() => undefined}
        aria-label="Category"
        options={options}
      />
    );
  }
  const view = await render(<Parent tick={0} />);
  try {
    await click(button(view.container, "Category"));
    const search = view.container.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    expect(document.activeElement).toBe(search);
    await act(async () => {
      Reflect.set(window.HTMLInputElement.prototype, "value", "groc", search);
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await view.rerender(<Parent tick={1} />);
    const options = [
      ...view.container.querySelectorAll('[role="option"]'),
    ].map((o) => o.textContent);
    expect(search.value).toBe("groc");
    expect(options).toEqual(["Groceries"]);
  } finally {
    await view.cleanup();
  }
});

test("Spending month arrows do not refetch search results", async () => {
  const view = await render(
    <SpendingView
      initialMonth="2026-10"
      initialAccountId={null}
      hasExplicitMonth
      initialSearch="coffee"
    />,
    () => [],
  );
  try {
    const listCalls = () =>
      view.calls.filter((call) => call.path === "spending.list").length;
    const before = listCalls();
    await click(button(view.container, "Previous month"));
    await click(button(view.container, "Previous month"));
    expect(listCalls()).toBe(before);
    expect(
      view.calls.some(
        (call) =>
          call.path === "spending.summary" &&
          (call.input as { month?: string }).month === "2026-08",
      ),
    ).toBeTrue();
  } finally {
    await view.cleanup();
  }
});
