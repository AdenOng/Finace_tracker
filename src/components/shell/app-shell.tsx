"use client";

import { useQueryClient } from "@tanstack/react-query";

import {
  ArrowLeftRight,
  Bot,
  Database,
  Gauge,
  History,
  Building2,
  CalendarDays,
  FileStack,
  FileUp,
  LayoutGrid,
  Layers,
  LogOut,
  Menu,
  type LucideIcon,
  Server,
  Settings,
  ShieldCheck,
  Tags,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Wordmark } from "~/components/brand";
import { AmountsToggle, useHideAmounts } from "~/components/finance/privacy";
import { LanguageSwitch } from "~/components/shell/language-switch";
import { Drawer } from "~/components/ui/dialog";
import { useT } from "~/i18n/client";
import type { Messages } from "~/i18n/messages";
import { cn } from "~/lib/cn";
import { authClient } from "~/server/auth/client";

type NavItem = {
  href: string;
  label: (t: Messages) => string;
  icon: LucideIcon;
  /** Only active on this exact path, not its children. */
  exact?: boolean;
  /** Shown in the phone tab bar; the rest live in the menu. */
  tab?: boolean;
};

const mainNav: NavItem[] = [
  {
    href: "/",
    label: (t) => t.shell.nav.overview,
    icon: LayoutGrid,
    exact: true,
    tab: true,
  },
  {
    href: "/accounts",
    label: (t) => t.shell.nav.accounts,
    icon: Wallet,
    tab: true,
  },
  { href: "/portfolio", label: (t) => t.shell.nav.portfolio, icon: Layers },
  {
    href: "/spending",
    label: (t) => t.shell.nav.spending,
    icon: ArrowLeftRight,
    tab: true,
  },
  {
    href: "/cash-flow",
    label: (t) => t.shell.nav.cashFlow,
    icon: CalendarDays,
  },
  {
    href: "/imports",
    label: (t) => t.shell.nav.imports,
    icon: FileUp,
    tab: true,
  },
  { href: "/workspaces", label: (t) => t.shell.nav.workspaces, icon: Users },
  { href: "/settings", label: (t) => t.shell.nav.settings, icon: Settings },
];

const adminNav: NavItem[] = [
  {
    href: "/admin",
    label: (t) => t.shell.adminNav.status,
    icon: Gauge,
    exact: true,
  },
  { href: "/admin/users", label: (t) => t.shell.adminNav.users, icon: Users },
  {
    href: "/admin/security",
    label: (t) => t.shell.adminNav.security,
    icon: ShieldCheck,
  },
  {
    href: "/admin/imports",
    label: (t) => t.shell.adminNav.importJobs,
    icon: FileStack,
  },
  { href: "/admin/ai", label: (t) => t.shell.adminNav.ai, icon: Bot },
  {
    href: "/admin/institutions",
    label: (t) => t.shell.adminNav.institutions,
    icon: Building2,
  },
  {
    href: "/admin/categories",
    label: (t) => t.shell.adminNav.categories,
    icon: Tags,
  },
  { href: "/admin/data", label: (t) => t.shell.adminNav.data, icon: Database },
  {
    href: "/admin/system",
    label: (t) => t.shell.adminNav.system,
    icon: Server,
  },
  {
    href: "/admin/activity",
    label: (t) => t.shell.adminNav.activity,
    icon: History,
  },
];

function isActive(pathname: string, item: NavItem) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const t = useT();
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
      {item.label(t)}
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
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hideAmounts] = useHideAmounts();
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
    <div
      data-amounts={hideAmounts ? "hidden" : "shown"}
      className="desk relative isolate min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]"
    >
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
            <div className="space-y-0.5 pt-6 pb-2">
              <p className="eyebrow px-3 pb-2">{t.shell.adminNav.heading}</p>
              {admin.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          ) : null}
        </nav>
        <div className="px-6 pt-3">
          <LanguageSwitch compact />
        </div>
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
          {!enrolling ? (
            <AmountsToggle
              global
              className="text-ink-3 hover:text-ink size-8 shrink-0 px-0"
            />
          ) : null}
          <button
            type="button"
            onClick={signOut}
            title={t.shell.signOut}
            aria-label={t.shell.signOut}
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
        <div className="flex items-center gap-1">
          {!enrolling ? <AmountsToggle global /> : null}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t.shell.openMenu}
            className="rounded-full"
          >
            <Avatar name={user.name} />
          </button>
        </div>
      </header>

      <main className="min-w-0 px-4 pt-6 pb-28 sm:px-8 lg:px-14 lg:py-12">
        <div className="animate-rise mx-auto max-w-6xl">{children}</div>
      </main>

      {tabs.length > 0 ? (
        <nav
          aria-label={t.shell.nav.main}
          className="border-line fixed inset-x-0 bottom-0 z-20 grid border-t bg-[#f8f4ea]/92 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
          style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, 1fr)` }}
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
                {item.label(t)}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            className="text-ink-3 flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium"
          >
            <span className="grid h-7 w-12 place-items-center">
              <Menu className="size-[18px]" aria-hidden="true" />
            </span>
            {t.shell.nav.more}
          </button>
        </nav>
      ) : null}

      <Drawer
        open={menuOpen}
        confirmDiscard={false}
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
            {t.shell.signOut}
          </button>
        }
      >
        <nav className="space-y-0.5">
          {nav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
          {admin.length > 0 ? (
            <div className="space-y-0.5 pt-6">
              <p className="eyebrow px-3 pb-2">{t.shell.adminNav.heading}</p>
              {admin.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          ) : null}
        </nav>
        <div className="border-line mt-6 border-t px-3 pt-5">
          <p className="eyebrow pb-2">{t.common.language.label}</p>
          <LanguageSwitch />
        </div>
      </Drawer>
    </div>
  );
}
