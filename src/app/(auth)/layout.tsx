import type { ReactNode } from "react";

import { Wordmark } from "~/components/brand";

const ledgerRows = [
  { name: "Interactive Brokers", width: "86%" },
  { name: "moomoo", width: "54%" },
  { name: "Longbridge", width: "38%" },
  { name: "POEMS", width: "62%" },
  { name: "Bank & cards", width: "27%" },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="bg-forest relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Wordmark inverse className="text-white" />

        <div className="relative z-10 max-w-md pt-24">
          <h1 className="font-wide text-5xl leading-[1.02] font-extrabold xl:text-6xl">
            Every account.
            <br />
            <span className="text-mint">One number.</span>
          </h1>
          <p className="mt-6 text-[15px] leading-relaxed text-white/75">
            Brokerages across markets, bank statements and card spending, read
            by the model you choose and checked by you before anything is saved.
          </p>
        </div>

        <div className="relative z-10 space-y-3" aria-hidden>
          {ledgerRows.map((row) => (
            <div
              key={row.name}
              className="grid grid-cols-[9rem_1fr] items-center gap-4"
            >
              <span className="truncate text-[13px] text-white/60">
                {row.name}
              </span>
              <span className="h-2.5 bg-white/10">
                <span
                  className="bg-mint block h-full"
                  style={{ width: row.width }}
                />
              </span>
            </div>
          ))}
        </div>

        {/* Stepped growth line, echoing the brand mark. */}
        <svg
          aria-hidden
          viewBox="0 0 600 600"
          className="text-forest-2 pointer-events-none absolute -top-10 -right-16 h-[19rem] w-[19rem] xl:h-[22rem] xl:w-[22rem]"
        >
          {Array.from({ length: 13 }, (_, i) => (
            <line
              key={`h${i}`}
              x1="0"
              x2="600"
              y1={i * 50}
              y2={i * 50}
              stroke="currentColor"
              strokeWidth="1"
            />
          ))}
          {Array.from({ length: 13 }, (_, i) => (
            <line
              key={`v${i}`}
              y1="0"
              y2="600"
              x1={i * 50}
              x2={i * 50}
              stroke="currentColor"
              strokeWidth="1"
            />
          ))}
          <path
            d="M0 500h100v-50h100v-100h50v50h100v-150h100v-50h50v-100h100"
            fill="none"
            stroke="#4be3a1"
            strokeWidth="6"
            strokeLinecap="square"
            opacity="0.9"
          />
        </svg>
      </aside>

      <main className="flex flex-col px-6 py-10 sm:px-12">
        <div className="lg:hidden">
          <Wordmark />
        </div>
        <div className="animate-rise mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
