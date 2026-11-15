import { expect, test } from "bun:test";
import React, { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { SessionGate } from "../src/auth/SessionGate";
import { FinanceProvider } from "../src/api/Provider";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

test("session refresh preserves the active two-factor step", async () => {
  function SignIn() {
    const [factor, setFactor] = useState(false);
    return (
      <button onClick={() => setFactor(true)}>
        {factor ? "Verify TOTP" : "Sign in"}
      </button>
    );
  }
  const screen = (pending: boolean) => (
    <SessionGate
      pending={pending}
      authenticated={false}
      loading={<span>Loading</span>}
      signIn={<SignIn />}
    />
  );
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(screen(true));
  });
  expect(renderer.root.findByType("span").children).toEqual(["Loading"]);
  await act(async () => {
    renderer.update(screen(false));
  });
  await act(async () => {
    renderer.root.findByType("button").props.onClick();
  });
  await act(async () => {
    renderer.update(screen(true));
  });
  expect(renderer.root.findByType("button").children).toEqual(["Verify TOTP"]);
  await act(async () => {
    renderer.update(screen(false));
  });
  expect(renderer.root.findByType("button").children).toEqual(["Verify TOTP"]);
  await act(async () => renderer.unmount());
});

test("restored sessions finish queries; changing identity discards the old cache", async () => {
  const clients = new Map<string, QueryClient>();
  const requests = new Map<string, (value: string) => void>();
  function Balance({ user }: { user: string }) {
    clients.set(user, useQueryClient());
    const result = useQuery({
      queryKey: ["balance"],
      queryFn: () =>
        new Promise<string>((resolve) => requests.set(user, resolve)),
    });
    return <span>{result.data ?? "Loading"}</span>;
  }
  const screen = (user: string) => (
    <FinanceProvider
      key={user}
      origin="https://example.test"
      auth={{ getCookie: () => "" }}
      onUnauthorized={() => {}}
    >
      <Balance user={user} />
    </FinanceProvider>
  );
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(screen("alice"));
  });
  await act(async () => {
    requests.get("alice")!("123.45");
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(renderer.root.findByType("span").children).toEqual(["123.45"]);
  await act(async () => {
    renderer.update(screen("bob"));
  });
  expect(clients.get("alice")!.getQueryCache().getAll()).toHaveLength(0);
  expect(renderer.root.findByType("span").children).toEqual(["Loading"]);
  await act(async () => {
    requests.get("bob")!("999.00");
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(renderer.root.findByType("span").children).toEqual(["999.00"]);
  await act(async () => renderer.unmount());
  expect(clients.get("bob")!.getQueryCache().getAll()).toHaveLength(0);
});
