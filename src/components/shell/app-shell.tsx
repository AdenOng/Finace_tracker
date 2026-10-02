"use client";

import {
  ArrowLeftRight,
  Bot,
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
};

const mainNav: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/accounts", label: "Accounts", icon: Wallet, soon: true },
  { href: "/spending", label: "Spending", icon: ArrowLeftRight, soon: true },
  { href: "/imports", label: "Imports", icon: FileUp, soon: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

const adminNav: NavItem[] = [
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/institutions", label: "Brokers & banks", icon: Building2 },
  { href: "/admin/categories", label: "Categories", icon: Tags },
  { href: "/admin/ai", label: "AI providers", icon: Bot },
];

function isActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  if (item.soon) {
    return (
      <span
        className="flex h-10 items-center gap-3 px-5 text-[14px] text-white/35"
        title="Coming in a later build step"
      >
        <Icon className="size-[18px]" />
        {item.label}
        <span className="ml-auto text-[11px] font-semibold text-white/35">
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
        "relative flex h-10 items-center gap-3 px-5 text-[14px] font-medium transition-colors",
        active
          ? "bg-forest-3 text-white"
          : "hover:bg-forest-2 text-white/70 hover:text-white",
      )}
    >
      {active ? (
        <span className="bg-mint absolute inset-y-0 left-0 w-1" />
      ) : null}
      <Icon className="size-[18px]" />
      {item.label}
    </Link>
  );
}

export function AppShell({
  user,
  isAdmin,
  children,
}: {
  user: { name: string; email: string };
  isAdmin: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_1fr]">
      <aside className="bg-forest flex flex-col text-white lg:sticky lg:top-0 lg:h-dvh">
        <div className="flex h-16 items-center px-5">
          <Link href="/" className="text-white">
            <Wordmark inverse />
          </Link>
        </div>

        <nav className="flex gap-1 overflow-x-auto pb-2 lg:block lg:flex-1 lg:overflow-y-auto lg:pb-0">
          <div className="flex lg:block">
            {mainNav.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
          {isAdmin ? (
            <div className="flex lg:mt-8 lg:block">
              <p className="text-mint hidden px-5 pb-2 text-[12px] font-semibold lg:block">
                Admin console
              </p>
              {adminNav.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          ) : null}
        </nav>

        <div className="hidden border-t border-white/10 px-5 py-4 lg:block">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-[13px] text-white/55">{user.email}</p>
          <button
            type="button"
            onClick={signOut}
            className="hover:text-mint mt-3 inline-flex items-center gap-2 text-[13px] font-semibold text-white/70"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 px-5 py-8 sm:px-10 lg:px-14 lg:py-12">
        <div className="animate-rise mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
