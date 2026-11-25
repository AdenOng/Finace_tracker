"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "~/components/ui/button";
import { useT } from "~/i18n/client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <section className="card max-w-xl p-6 sm:p-8" role="alert">
      <h1 className="font-display text-2xl font-semibold">
        {t.common.errors.pageErrorTitle}
      </h1>
      <p className="text-ink-2 mt-2 text-sm">{t.common.errors.pageErrorBody}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={reset}>{t.common.actions.retry}</Button>
        <Link
          href="/"
          className="text-sm font-semibold underline underline-offset-4"
        >
          {t.common.errors.backToOverview}
        </Link>
      </div>
    </section>
  );
}
