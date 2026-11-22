import { expect, mock, test } from "bun:test";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import superjson from "superjson";
import { api } from "../src/api/client";
import { shiftMonth, today } from "../src/utils/server";

let hidden = false;

mock.module("react-native", () => ({
  Pressable: "pressable",
  Text: "text",
  View: "view",
}));
mock.module("@react-navigation/native", () => ({ useNavigation: () => ({}) }));
mock.module("react-native-svg", () => ({
  default: "svg",
  Line: "line",
  Path: "path",
}));
mock.module("../src/auth/Provider", () => ({
  useFinfolio: () => ({ hidden, user: { name: "Test User" } }),
}));
mock.module("../src/components/finance", () => ({
  AccountRow: "account",
  Allocation: "allocation",
  CategoryBars: "bars",
  TopBar: "topbar",
}));
mock.module("../src/components/ui", () => ({
  Button: "button",
  Card: "card",
  Eyebrow: "eyebrow",
  FigureGrid: "grid",
  HeroFigure: "hero",
  InkStrip: "strip",
  Notice: "notice",
  Page: "page",
  SheetHeader: "sheet-header",
  Status: "status",
  Tag: "tag",
  colors: {},
  styles: {},
}));
const { Overview, SpendingSheet } = await import("../src/features/Overview");
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

test("the chart ends at the latest total, supports shorter ranges, and follows amount privacy", async () => {
  const date = today();
  const point = (date: string, total: string, estimated = false) => ({
    date,
    total,
    estimated,
    partial: false,
    backfilled: false,
  });
  const history = [
    point(`${shiftMonth(date.slice(0, 7), -18)}-01`, "25", true),
    point(`${shiftMonth(date.slice(0, 7), -7)}-01`, "40"),
    point(`${shiftMonth(date.slice(0, 7), -1)}-01`, "50"),
    point(date, "75"),
  ];
  const queryClient = new QueryClient({
    defaultOptions: { queries: { enabled: false, gcTime: Infinity } },
  });
  const client = api.createClient({
    links: [
      httpBatchLink({ url: "https://example.test", transformer: superjson }),
    ],
  });
  queryClient.setQueryData(
    getQueryKey(api.portfolio.netWorth, undefined, "query"),
    {
      currency: "SGD",
      total: "100",
      asOf: date,
      accounts: [],
      allocation: [],
      banking: { total: null },
      cpfSrs: { total: null },
      unconverted: [],
      unpriced: 0,
      transferWarnings: [],
    },
  );
  queryClient.setQueryData(
    getQueryKey(api.portfolio.netWorthHistory, undefined, "query"),
    {
      currency: "SGD",
      points: history,
    },
  );
  const screen = () => (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={client} queryClient={queryClient}>
        <Overview />
      </api.Provider>
    </QueryClientProvider>
  );
  let renderer!: ReactTestRenderer;
  const matches = (type: string) =>
    renderer.root.findAll((node) => node.type === type);
  const chartLabel = () => matches("svg")[0]!.props.accessibilityLabel;
  try {
    await act(async () => {
      renderer = create(screen());
    });
    expect(chartLabel()).toContain("from S$25.00");
    expect(chartLabel()).toContain("to S$100.00");
    expect(matches("path")[0]!.props.strokeDasharray).toBe("5 4");
    await act(async () => {
      matches("pressable")
        .find((node) => node.props.accessibilityLabel === "3 months")!
        .props.onPress();
    });
    // The point before the range remains when it is the nearest earlier balance.
    expect(chartLabel()).toContain("from S$40.00");
    expect(chartLabel()).toContain("to S$100.00");
    await act(async () => {
      hidden = true;
      renderer.update(screen());
    });
    expect(matches("svg")).toHaveLength(0);
  } finally {
    hidden = false;
    await act(async () => renderer?.unmount());
    queryClient.clear();
  }
});

test("changing spending months conceals revealed totals, including after a pending fetch", async () => {
  let renderer!: ReactTestRenderer;
  const screen = (month: string, pending = false) => (
    <SpendingSheet
      month={month}
      summary={
        pending
          ? undefined
          : {
              currency: "SGD",
              spent: month === "2026-11" ? "100" : "250",
              received: "500",
              categories: [],
              unconverted: [],
            }
      }
      previous={undefined}
      categories={[]}
      pending={pending}
      error={null}
      retry={() => undefined}
      hidden
    />
  );
  const header = () =>
    renderer.root.find((node) => (node.type as string) === "sheet-header");
  const buttons = () =>
    renderer.root.findAll((node) => (node.type as string) === "pressable");
  try {
    await act(async () => {
      renderer = create(screen("2026-11"));
    });
    expect(header().props.figure).toBe("••••");
    await act(async () => {
      for (const button of buttons())
        button.props.onPress({ stopPropagation() {} });
    });
    expect(header().props.figure).toContain("100");
    await act(async () => {
      renderer.update(screen("2026-10"));
    });
    expect(header().props.figure).toBe("••••");
    expect(
      buttons().every(
        (button) => button.props.accessibilityLabel === "Reveal amount",
      ),
    ).toBe(true);
    await act(async () => {
      buttons()[0]!.props.onPress({ stopPropagation() {} });
    });
    expect(header().props.figure).toContain("250");
    await act(async () => {
      renderer.update(screen("2026-09", true));
    });
    await act(async () => {
      renderer.update(screen("2026-09"));
    });
    expect(header().props.figure).toBe("••••");
  } finally {
    await act(async () => renderer?.unmount());
  }
});
