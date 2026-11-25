import Link from "next/link";

import { getT } from "~/i18n/server";

export default async function RootNotFound() {
  const t = await getT();
  return (
    <main className="desk grid min-h-dvh place-items-center p-6">
      <section className="card w-full max-w-md p-6 sm:p-8">
        <h1 className="font-display text-2xl font-semibold">
          {t.common.errors.notFoundTitle}
        </h1>
        <p className="text-ink-2 mt-2 text-sm">
          {t.common.errors.notFoundBody}
        </p>
        <div className="mt-5">
          <Link
            href="/"
            className="text-sm font-semibold underline underline-offset-4"
          >
            {t.common.errors.backToOverview}
          </Link>
        </div>
      </section>
    </main>
  );
}
