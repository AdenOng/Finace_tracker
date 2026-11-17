import { expect, mock, test } from "bun:test";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
mock.module("react-native", () => ({ Pressable: "pressable" }));
const { AmountPrivacy, SensitiveValue } =
  await import("../src/components/AmountPrivacy");
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

test("reveals only the tapped value, covers on a second tap, and resets with the eye", async () => {
  let renderer!: ReactTestRenderer;
  const screen = (revision: number, hidden = true) => (
    <AmountPrivacy.Provider value={revision}>
      {["100", "200"].map((value) => (
        <SensitiveValue
          key={value}
          hidden={hidden}
          render={(mask) => <span>{mask ? "••••" : value}</span>}
        />
      ))}
    </AmountPrivacy.Provider>
  );
  await act(async () => {
    renderer = create(screen(0));
  });
  const values = () =>
    renderer.root.findAllByType("span").map((node) => node.children.join(""));
  let stopped = 0;
  const tap = async () => {
    await act(async () => {
      renderer.root
        .findAll((node) => (node.type as string) === "pressable")[0]!
        .props.onPress({ stopPropagation: () => stopped++ });
    });
  };
  expect(values()).toEqual(["••••", "••••"]);
  await tap();
  expect(values()).toEqual(["100", "••••"]);
  expect(stopped).toBe(1);
  await tap();
  expect(values()).toEqual(["••••", "••••"]);
  await tap();
  await act(async () => {
    renderer.update(screen(1));
  });
  expect(values()).toEqual(["••••", "••••"]);
  await act(async () => {
    renderer.update(screen(2, false));
  });
  expect(values()).toEqual(["100", "200"]);
  expect(
    renderer.root.findAll((node) => (node.type as string) === "pressable"),
  ).toHaveLength(0);
  await act(async () => {
    renderer.update(screen(3));
  });
  expect(values()).toEqual(["••••", "••••"]);
  await act(async () => renderer.unmount());
});
