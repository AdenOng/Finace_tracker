"use client";

import { X } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";

import { AuthHeading } from "~/components/auth/auth-heading";
import { SignInForm } from "~/components/auth/sign-in-form";
import { BrandMark, Wordmark } from "~/components/brand";
import { Button } from "~/components/ui/button";

import { GatherGlyph, KeepGlyph, ReadGlyph, Seal } from "./glyphs";
import { Book } from "./book";
import { CashFlow } from "./cash-flow";

function SignInDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal focuses the first control (the close button); start on the email field.
      dialog.querySelector<HTMLInputElement>("input")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="sign-in-title"
      className="card text-ink open:animate-pop m-auto w-[calc(100%-2rem)] max-w-[26rem] overflow-hidden p-0 shadow-[0_40px_120px_-30px_rgb(0_0_0/0.95)]"
    >
      {open ? (
        <div className="relative p-7 sm:p-9">
          <div
            aria-hidden
            className="ink-strip absolute inset-x-0 top-0 h-1 rounded-t-[var(--radius-card)]"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-ctl text-ink-3 hover:bg-wash hover:text-ink absolute top-4 right-4 grid size-9 place-items-center transition-colors"
          >
            <X className="size-[18px]" />
          </button>
          <BrandMark className="mb-6 size-9" />
          <div id="sign-in-title">
            <AuthHeading title="Sign in">
              Invite only. Ask whoever runs this Finfolio for a link.
            </AuthHeading>
          </div>
          <Suspense>
            <SignInForm />
          </Suspense>
        </div>
      ) : null}
    </dialog>
  );
}

const steps = [
  {
    title: "Add your accounts",
    Glyph: GatherGlyph,
    body: (count: number, currencies: number) =>
      `Pick from ${count} brokers and banks (IBKR, moomoo, Tiger, DBS and the rest) or add your own. Each account keeps its own currency, and ${currencies} currencies are supported.`,
  },
  {
    title: "Record what changed",
    Glyph: ReadGlyph,
    body: () =>
      "Enter balances and holdings, log spending by category, and check each statement line by line. Statement upload, read by an AI model you pick, is coming next.",
  },
  {
    title: "Keep it to yourself",
    Glyph: KeepGlyph,
    body: () =>
      "It runs on your own server. New users need an invite, sign-in takes a passkey or a two-step code, and AI provider keys are stored encrypted.",
  },
];

export function Landing({
  institutionCount,
  currencyCount,
  openSignIn,
}: {
  institutionCount: number;
  currencyCount: number;
  openSignIn: boolean;
}) {
  const [open, setOpen] = useState(openSignIn);
  const [month, setMonth] = useState(0);
  const signIn = () => setOpen(true);

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <header className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Wordmark />
        <nav className="flex items-center gap-6 text-[13px]">
          <a
            href="#how-it-works"
            className="text-ink-2 hover:text-ink hidden transition-colors sm:inline"
          >
            How it works
          </a>
          <Button size="sm" onClick={signIn}>
            Sign in
          </Button>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-5 sm:px-8">
        <section className="grid gap-8 pt-8 pb-14 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-end lg:gap-16 lg:pt-14">
          <h1
            className="font-poster animate-rise text-[56px] leading-[0.92] font-bold tracking-[-0.03em] sm:text-[84px] xl:text-[100px]"
            style={{ fontVariationSettings: '"wdth" 82' }}
          >
            <span className="text-ink-3">Every account,</span>
            <br />
            one number.
          </h1>
          <div className="animate-rise max-w-md [animation-delay:100ms] lg:pb-3">
            <p className="text-ink-2 text-[16px] leading-relaxed">
              Finfolio keeps your brokerage, bank and card accounts in one
              place. Balances are converted to the currency you choose and added
              up, so you can see what you&apos;re worth and where this
              month&apos;s money went.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Button size="lg" onClick={signIn}>
                Sign in
              </Button>
              <p className="text-ink-3 text-[13px]">
                Invite only. Ask whoever runs this Finfolio for a link.
              </p>
            </div>
          </div>
        </section>

        <section className="animate-rise relative mx-auto max-w-[60rem] pb-24 [animation-delay:200ms]">
          <div className="absolute -top-12 -right-10 z-20 hidden md:block">
            <Seal onClick={signIn} />
          </div>
          <Book onPageChange={setMonth} />
          <CashFlow month={month} />
        </section>

        <section id="how-it-works" className="scroll-mt-10 pb-24">
          <div className="border-line flex items-end justify-between gap-6 border-t pt-8">
            <h2 className="font-poster text-[40px] leading-none font-bold uppercase sm:text-[56px]">
              How it works
            </h2>
            <span className="ink-strip mb-3 hidden h-1.5 w-24 sm:block" />
          </div>
          <div className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
            {steps.map((m, i) => (
              <article key={m.title} className="group">
                <div className="bg-surface border-line grid aspect-[4/3] place-items-center rounded-[6px] border">
                  <div className="size-48 sm:size-52">
                    <m.Glyph />
                  </div>
                </div>
                <h3 className="mt-5 flex items-baseline gap-3">
                  <span className="figures text-ink-3 font-mono text-[12px]">
                    0{i + 1}
                  </span>
                  <span className="font-poster text-[28px] leading-none font-bold">
                    {m.title}
                  </span>
                </h3>
                <p className="text-ink-2 mt-3 max-w-sm text-[14px] leading-relaxed">
                  {m.body(institutionCount, currencyCount)}
                </p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer>
        <div className="ink-strip h-1" />
        <div className="text-ink-3 mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-[12px] sm:px-8">
          <span className="flex items-center gap-2">
            <BrandMark className="size-4" />
            Finfolio
          </span>
          <span>
            The poster uses made-up figures, not anyone&apos;s real data.
          </span>
        </div>
      </footer>

      <SignInDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
