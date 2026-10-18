"use client";

import { useQueryClient } from "@tanstack/react-query";

import {
  ArrowLeftRight,
  Bot,
  Gauge,
  History,
  Building2,
  FileUp,
  LayoutGrid,
  LogOut,
  type LucideIcon,
  Settings,
  Tags,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Wordmark } from "~/components/brand";
import { cn } from "~/lib/cn";
import { authClient } from "~/server/auth/client";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
  /** Only active on this exact path, not its children. */
  exact?: boolean;
};

const mainNav: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/spending", label: "Spending", icon: ArrowLeftRight },
  { href: "/imports", label: "Imports", icon: FileUp, soon: true },
  { href: "/workspaces", label: "Workspaces", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

const adminNav: NavItem[] = [
  { href: "/admin", label: "Status", icon: Gauge, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/institutions", label: "Brokers & banks", icon: Building2 },
  { href: "/admin/categories", label: "Categories", icon: Tags },
  { href: "/admin/ai", label: "AI providers", icon: Bot },
  { href: "/admin/activity", label: "Activity log", icon: History },
];

function isActive(pathname: string, item: NavItem) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item);
  const Icon = item.icon;
  if (item.soon) {
    return (
      <span
        className="text-ink-3/70 rounded-ctl flex h-9 shrink-0 items-center gap-3 px-3 text-[14px]"
        title="Coming in a later build step"
      >
        <Icon className="size-[17px]" strokeWidth={1.75} />
        {item.label}
        <span className="border-line-2 text-ink-3 ml-auto rounded-full border px-1.5 font-mono text-[10px] tracking-wider uppercase">
          Soon
        </span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group rounded-ctl relative flex h-9 shrink-0 items-center gap-3 px-3 text-[14px] transition-colors",
        active
          ? "bg-surface-2 text-ink shadow-[inset_0_0_0_1px_var(--color-line)]"
          : "text-ink-2 hover:bg-wash/60 hover:text-ink",
      )}
    >
      <Icon
        className={cn(
          "size-[17px] transition-colors",
          active ? "text-brand" : "text-ink-3 group-hover:text-ink-2",
        )}
        strokeWidth={1.75}
      />
      {item.label}
      {active ? (
        <span className="bg-brand ml-auto size-1.5 rounded-full shadow-[0_0_10px_var(--color-brand)]" />
      ) : null}
    </Link>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function AppShell({
  user,
  isAdmin,
  enrolling = false,
  children,
}: {
  user: { name: string; email: string };
  isAdmin: boolean;
  enrolling?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <div className="relative isolate min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <div
        aria-hidden
        className="grid-lines pointer-events-none fixed inset-x-0 top-0 -z-10 h-[28rem] [mask-image:linear-gradient(black,transparent)] opacity-40"
      />
      <aside className="border-line bg-sunken/70 flex flex-col border-b backdrop-blur lg:sticky lg:top-0 lg:h-dvh lg:border-r lg:border-b-0">
        <div className="flex h-16 items-center px-5 lg:h-20">
          <Link href={enrolling ? "/settings" : "/"}>
            <Wordmark />
          </Link>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:flex-1 lg:overflow-y-auto lg:pb-0">
          <p className="eyebrow hidden px-3 pb-2 lg:block">Ledger</p>
          <div className="flex gap-1 lg:block lg:space-y-0.5">
            {mainNav
              .filter((item) => !enrolling || item.href === "/settings")
              .map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
          </div>
          {isAdmin && !enrolling ? (
            <div className="flex gap-1 lg:mt-8 lg:block lg:space-y-0.5">
              <p className="eyebrow hidden px-3 pb-2 lg:block">Admin console</p>
              {adminNav.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          ) : null}
        </nav>

        <div className="hidden p-3 lg:block">
          <div className="card flex items-center gap-3 p-3">
            <span className="from-brand to-brand-3 text-on-brand font-display grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[15px]">
              {initials(user.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">
                {user.name}
              </span>
              <span className="text-ink-3 block truncate text-[12px]">
                {user.email}
              </span>
            </span>
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="rounded-ctl text-ink-3 hover:bg-wash hover:text-brand grid size-8 shrink-0 place-items-center transition-colors"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-5 py-8 sm:px-10 lg:px-14 lg:py-14">
        <div className="animate-rise mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
