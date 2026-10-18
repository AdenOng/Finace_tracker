import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "~/components/brand";

/** Setup, two-step, invitations and resets: one focused card on the grid. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <div
        aria-hidden
        className="grid-lines pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_60%_55%_at_50%_40%,black,transparent)] opacity-60"
      />
      <header className="mx-auto flex h-16 w-full max-w-7xl items-center px-5 sm:px-8">
        <Link href="/sign-in">
          <Wordmark />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="card animate-pop relative w-full max-w-[26rem] overflow-hidden p-7 shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)] sm:p-9">
          <div aria-hidden className="ink-strip absolute inset-x-0 top-0 h-1" />
          {children}
        </div>
      </main>
    </div>
  );
}
