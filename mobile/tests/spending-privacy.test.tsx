import { expect, mock, test } from "bun:test";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

mock.module("react-native", () => ({
  Pressable: "pressable",
  Text: "text",
  View: "view",
}));
mock.module("@react-navigation/native", () => ({ useNavigation: () => ({}) }));
mock.module("../src/auth/Provider", () => ({ useFinfolio: () => ({}) }));
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
const { SpendingSheet } = await import("../src/features/Overview");
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

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
