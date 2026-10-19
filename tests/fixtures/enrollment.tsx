import { expect, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import assert from "node:assert/strict";

let session: {
  user: {
    name: string;
    email: string;
    role: string;
    twoFactorEnabled: boolean;
  };
} | null = {
  user: {
    name: "Example",
    email: "example@example.com",
    role: "admin",
    twoFactorEnabled: false,
  },
};
let queries = 0;
const query = new Proxy(
  () => {
    queries++;
    return Promise.resolve();
  },
  {
    get: () => query,
  },
);

await mock.module("server-only", () => ({}));
await mock.module("next/headers", () => ({
  headers: async () => new Headers(),
}));
await mock.module("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  notFound: () => {
    throw new Error("not-found");
  },
  usePathname: () => "/settings",
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
await mock.module("~/server/auth/config", () => ({
  APP_NAME: "Finfolio",
  auth: { api: { getSession: async () => session } },
}));
await mock.module("~/trpc/server", () => ({
  api: query,
  HydrateClient: ({ children }: { children: React.ReactNode }) => children,
}));

const pages = [
  "accounts/page",
  "accounts/[id]/page",
  "page",
  "spending/page",
  "portfolio/page",
  "workspaces/page",
  "workspaces/[id]/page",
  "workspaces/[id]/accounts/[accountId]/page",
  "admin/page",
  "admin/ai/page",
  "admin/users/page",
  "admin/categories/page",
  "admin/institutions/page",
  "admin/activity/page",
];
for (const path of pages) {
  const { default: Page } = (await import(
    `../../src/app/(app)/${path}.tsx`
  )) as {
    default: (props: {
      params: Promise<object>;
      searchParams: Promise<object>;
    }) => Promise<unknown>;
  };
  await assert.rejects(
    () =>
      Page({ params: Promise.resolve({}), searchParams: Promise.resolve({}) }),
    { message: "redirect:/settings?enroll=1" },
  );
}
expect(queries).toBe(0);

const { default: AccountsPage } =
  await import("../../src/app/(app)/accounts/page");
session = null;
await assert.rejects(
  () => AccountsPage({ searchParams: Promise.resolve({}) }),
  { message: "redirect:/sign-in" },
);
expect(queries).toBe(0);

session = {
  user: {
    name: "Example",
    email: "example@example.com",
    role: "admin",
    twoFactorEnabled: false,
  },
};
const { default: SettingsPage } =
  await import("../../src/app/(app)/settings/page");
await SettingsPage({ searchParams: Promise.resolve({ enroll: "1" }) });
expect(queries).toBe(2);

session.user.twoFactorEnabled = true;
await AccountsPage({ searchParams: Promise.resolve({}) });
expect(queries).toBe(6);

const { AppShell } = await import("../../src/components/shell/app-shell");
function shell(enrolling: boolean) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <AppShell user={session!.user} isAdmin enrolling={enrolling}>
        Settings
      </AppShell>
    </QueryClientProvider>,
  );
}
const enrolling = shell(true);
expect(enrolling).toContain('href="/settings"');
expect(enrolling).not.toContain('href="/accounts"');
expect(enrolling).not.toContain('href="/admin"');
expect(shell(false)).toContain('href="/accounts"');
