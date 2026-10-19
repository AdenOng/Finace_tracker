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
  Layers,
  LogOut,
  type LucideIcon,
  Settings,
  Tags,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Wordmark } from "~/components/brand";
import { Drawer } from "~/components/ui/dialog";
import { cn } from "~/lib/cn";
import { authClient } from "~/server/auth/client";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only active on this exact path, not its children. */
  exact?: boolean;
  /** Shown in the phone tab bar; the rest live in the menu. */
  tab?: boolean;
};

const mainNav: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutGrid, exact: true, tab: true },
  { href: "/accounts", label: "Accounts", icon: Wallet, tab: true },
  { href: "/portfolio", label: "Portfolio", icon: Layers },
  { href: "/spending", label: "Spending", icon: ArrowLeftRight, tab: true },
  { href: "/imports", label: "Imports", icon: FileUp, tab: true },
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
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-ctl flex h-9 items-center gap-3 px-3 text-[14px] transition-colors",
        active
          ? "bg-ink text-paper font-semibold"
          : "text-ink-2 hover:bg-wash hover:text-ink",
      )}
    >
      <Icon className="size-[17px]" strokeWidth={1.75} />
      {item.label}
    </Link>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="bg-art-cobalt font-poster grid size-9 shrink-0 place-items-center rounded-full text-[14px] font-bold text-white">
      {initials(name)}
    </span>
  );
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
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    router.replace("/sign-in");
    router.refresh();
  }

  const nav = mainNav.filter((item) => !enrolling || item.href === "/settings");
  const tabs = nav.filter((item) => item.tab);
  const admin = isAdmin && !enrolling ? adminNav : [];

  return (
    <div className="desk relative isolate min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Desktop: a quiet column on the desk */}
      <aside className="border-line hidden flex-col border-r lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <div className="flex h-20 items-center px-5">
          <Link href={enrolling ? "/settings" : "/"}>
            <Wordmark />
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {nav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
          {admin.length > 0 ? (
            <div className="space-y-0.5 pt-8">
              <p className="eyebrow px-3 pb-2">Admin</p>
              {admin.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          ) : null}
        </nav>
        <div className="border-line m-3 flex items-center gap-3 border-t pt-3">
          <Avatar name={user.name} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">
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
            className="rounded-ctl text-ink-3 hover:bg-wash hover:text-ink grid size-8 shrink-0 place-items-center transition-colors"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      {/* Phone and tablet: wordmark and the account menu, nothing else */}
      <header className="border-line sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-[#e6dfd0]/85 px-4 backdrop-blur lg:hidden">
        <Link href={enrolling ? "/settings" : "/"}>
          <Wordmark />
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="rounded-full"
        >
          <Avatar name={user.name} />
        </button>
      </header>

      <main className="min-w-0 px-4 pt-6 pb-28 sm:px-8 lg:px-14 lg:py-12">
        <div className="animate-rise mx-auto max-w-6xl">{children}</div>
      </main>

      {tabs.length > 0 ? (
        <nav
          aria-label="Main"
          className="border-line fixed inset-x-0 bottom-0 z-20 grid border-t bg-[#f8f4ea]/92 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
        >
          {tabs.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-ink" : "text-ink-3",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-12 place-items-center rounded-full transition-colors",
                    active && "bg-ink text-paper",
                  )}
                >
                  <Icon className="size-[18px]" strokeWidth={1.8} />
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={user.name}
        description={user.email}
        className="max-w-xs"
        footer={
          <button
            type="button"
            onClick={signOut}
            className="text-ink-2 hover:text-ink mr-auto inline-flex items-center gap-2 text-sm font-semibold"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        }
      >
        <nav className="space-y-0.5">
          {nav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
          {admin.length > 0 ? (
            <div className="space-y-0.5 pt-6">
              <p className="eyebrow px-3 pb-2">Admin</p>
              {admin.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          ) : null}
        </nav>
      </Drawer>
    </div>
  );
}
