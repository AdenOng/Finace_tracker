import { expect, mock, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import Decimal from "decimal.js";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { OverviewSpendingCard } from "../src/components/overview/spending-card";
import { ForecastChart } from "../src/components/planning/forecast-chart";
import { Combobox } from "../src/components/ui/combobox";
import { ConfirmButton } from "../src/components/ui/confirm-button";
import { Drawer } from "../src/components/ui/dialog";
import { FlashNotice } from "../src/components/ui/flash-notice";
import { LocaleProvider } from "../src/i18n/client";
import { resolveMessages } from "../src/i18n/template";
import en from "../src/i18n/messages/en";
import zh from "../src/i18n/messages/zh";
import {
  formatMoney,
  fractionDigits,
  normalizeDecimal,
} from "../src/lib/format";
import { rollupOverviewSpending } from "../src/server/modules/portfolio/overview";
import { createQueryClient } from "../src/trpc/query-client";
import { api } from "../src/trpc/react";

await mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    refresh: () => undefined,
  }),
  usePathname: () => "/",
}));

const { AppShell } = await import("../src/components/shell/app-shell");
const { SpendingView } =
  await import("../src/components/spending/spending-view");
const { AccountsView } =
  await import("../src/components/accounts/accounts-view");

function renderApp(
  ui: ReactNode,
  seed?: (c: ReturnType<typeof createQueryClient>) => void,
) {
  const client = createQueryClient();
  seed?.(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <api.Provider
        client={api.createClient({ links: [] })}
        queryClient={client}
      >
        <LocaleProvider locale="en" messages={en}>
          {ui}
        </LocaleProvider>
      </api.Provider>
    </QueryClientProvider>,
  );
}

test("web money formatter matches mobile minor units for IDR and normalizes decimal inputs", () => {
  expect(fractionDigits("IDR")).toBe(0);
  expect(fractionDigits("JPY")).toBe(0);
  expect(fractionDigits("KRW")).toBe(0);
  expect(formatMoney("1234.567", "IDR")).toBe("Rp 1,235");
  expect(formatMoney("1234.567", "SGD")).toBe("S$1,234.57");
  expect(normalizeDecimal("12,50")).toBe("12.50");
  expect(normalizeDecimal("1,234.50")).toBe("1234.50");
});

test("FlashNotice renders error as role=alert, success as role=status, and localized dismiss button", () => {
  const errEn = renderToStaticMarkup(
    <LocaleProvider locale="en" messages={en}>
      <FlashNotice
        flash={{
          tone: "error",
          message: en.spending.spendingView.exportFailed,
        }}
        onDismiss={() => undefined}
      />
    </LocaleProvider>,
  );
  expect(errEn).toContain('role="alert"');
  expect(errEn).toContain("Could not export transactions");
  expect(errEn).toContain('aria-label="Dismiss"');

  const errZh = renderToStaticMarkup(
    <LocaleProvider locale="zh" messages={zh}>
      <FlashNotice
        flash={{
          tone: "error",
          message: zh.spending.spendingView.exportFailed,
        }}
        onDismiss={() => undefined}
      />
    </LocaleProvider>,
  );
  expect(errZh).toContain('role="alert"');
  expect(errZh).toContain("导出交易失败");
  expect(errZh).toContain('aria-label="关闭提示"');

  const ok = renderToStaticMarkup(
    <LocaleProvider locale="en" messages={en}>
      <FlashNotice
        flash={{
          tone: "success",
          message: "Saved.",
          action: <a href="/spending">View</a>,
        }}
        onDismiss={() => undefined}
      />
    </LocaleProvider>,
  );
  expect(ok).toContain('role="status"');
  expect(ok).toContain('href="/spending"');
});

test("ForecastChart renders Y-axis ticks, zero line, and keyboard-focusable inspection surface", () => {
  const html = renderApp(
    <ForecastChart
      currency="SGD"
      points={[
        { date: "2026-11-01", change: "0", balance: "1200.00" },
        { date: "2026-11-05", change: "-1650.00", balance: "-450.00" },
        { date: "2026-11-20", change: "3650.00", balance: "3200.00" },
      ]}
      events={[{ date: "2026-11-05", name: "Rent", amount: "-1650.00" }]}
    />,
  );
  expect(html).toContain('data-zero-line="true"');
  expect(html).toContain("Zero");
  expect(html).toContain('tabindex="0"');
  expect(html).toContain('role="group"');
  expect(html).toContain("sensitive");
});

test("OverviewSpendingCard rolls up child categories and links bars to Spending drill-downs", () => {
  const parentId = "11111111-1111-4111-8111-111111111111";
  const childId = "22222222-2222-4222-8222-222222222222";
  const rolled = rollupOverviewSpending({
    categories: [
      { id: parentId, parentId: null, name: "Food & Dining" },
      { id: childId, parentId, name: "Cafes & Coffee" },
    ],
    spentByCategory: [
      { categoryId: childId, spent: "45.50" },
      { categoryId: null, spent: "12.00" },
    ],
    translateCategory: (name) => name,
    notCategorisedLabel: "Not categorised",
    otherLabel: "Other",
  });
  expect(rolled.shown.map((r) => [r.id, r.spent.toFixed(2)])).toEqual([
    [parentId, "45.50"],
    ["none", "12.00"],
  ]);

  const html = renderApp(
    <OverviewSpendingCard
      t={resolveMessages(en)}
      locale="en"
      month="2026-11"
      currency="SGD"
      moneyIn={new Decimal(5000)}
      moneyOut={new Decimal("57.50")}
      lastOut={new Decimal(0)}
      shown={rolled.shown}
      rest={rolled.rest}
      largest={rolled.largest}
      otherCurrencies={[]}
      bankTotal={new Decimal(2000)}
      banking={[]}
    />,
  );
  expect(html).toContain(`/spending?month=2026-11&amp;category=${parentId}`);
  expect(html).toContain("/spending?month=2026-11&amp;uncategorised=1");
});

test("SpendingView clarifies month picker scope while searching and renders searchable comboboxes", () => {
  const html = renderApp(
    <SpendingView
      initialMonth="2026-11"
      hasExplicitMonth
      initialAccountId={null}
      initialSearch="FairPrice"
    />,
    (client) => {
      client.setQueryData(getQueryKey(api.accounts.list, undefined, "query"), [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "DBS Multiplier",
          type: "checking",
          currency: "SGD",
          last4: "1234",
          institutionId: null,
          institutionName: "DBS",
          institutionKey: "dbs",
          archivedAt: null,
          asOf: "2026-11-01",
          totals: [{ currency: "SGD", amount: "1000" }],
          unpriced: 0,
        },
      ]);
      client.setQueryData(
        getQueryKey(api.catalog.categories, undefined, "query"),
        [],
      );
      client.setQueryData(
        getQueryKey(api.catalog.currencies, undefined, "query"),
        [],
      );
    },
  );
  expect(html).toContain("All months");
  expect(html).toContain(
    "Search shows matches from every month; the month picker updates the monthly overview below.",
  );
  expect(html).toContain('role="combobox"');
});

test("AccountsView renders both mobile card list and desktop table", () => {
  const html = renderApp(<AccountsView initialTab="open" />, (client) => {
    client.setQueryData(getQueryKey(api.accounts.list, undefined, "query"), [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "DBS Multiplier",
        type: "checking",
        currency: "SGD",
        last4: "9012",
        institutionId: null,
        institutionName: "DBS",
        institutionKey: "dbs",
        archivedAt: null,
        asOf: "2026-11-01",
        totals: [{ currency: "SGD", amount: "1850.00" }],
        unpriced: 0,
      },
    ]);
    client.setQueryData(getQueryKey(api.settings.get, undefined, "query"), {
      displayCurrency: "SGD",
      countCpfSrs: true,
      cpfSrsEnabled: false,
      hideAmounts: false,
      amountScopes: {},
    });
    client.setQueryData(
      getQueryKey(api.catalog.institutions, undefined, "query"),
      [],
    );
    client.setQueryData(
      getQueryKey(api.catalog.currencies, undefined, "query"),
      [],
    );
  });
  expect(html).toContain("sm:hidden");
  expect(html).toContain("hidden sm:block");
});

test("AppShell renders skip-to-content link, main landmark, and semantic theme classes", () => {
  const html = renderApp(
    <AppShell
      user={{ name: "Alex Tan", email: "alex@example.com" }}
      isAdmin={false}
    >
      <div>Body</div>
    </AppShell>,
  );
  expect(html).toContain('href="#main-content"');
  expect(html).toContain("Skip to main content");
  expect(html).toContain('id="main-content"');
  expect(html).toContain("bg-desk/85");
  expect(html).toContain("bg-surface/92");
  expect(html).not.toContain("bg-[#e6dfd0]");
  expect(html).not.toContain("bg-[#f8f4ea]");
});

test("Combobox, ConfirmButton, and Drawer primitives render accessible markup", () => {
  const combo = renderApp(
    <Combobox
      name="categoryId"
      value="a"
      onChange={() => undefined}
      aria-label="Category"
      options={[
        { value: "a", label: "Groceries" },
        { value: "b", label: "Transport" },
      ]}
    />,
  );
  expect(combo).toContain('role="combobox"');
  expect(combo).toContain('name="categoryId"');
  expect(combo).toContain("Groceries");

  const confirm = renderApp(
    <ConfirmButton onConfirm={() => undefined} confirmLabel="Confirm discard">
      Discard
    </ConfirmButton>,
  );
  expect(confirm).toContain("Discard");

  const drawer = renderApp(
    <Drawer open onClose={() => undefined} title="Edit item" dirty>
      <input name="test" />
    </Drawer>,
  );
  expect(drawer).toContain("Edit item");
});
