"use client";

import { useRouter } from "next/navigation";

import { Select } from "~/components/ui/field";
import { cn } from "~/lib/cn";
import { api } from "~/trpc/react";

export function CurrencySelect({
  className,
  id,
  compact = false,
}: {
  className?: string;
  id?: string;
  /** Codes only, sized to sit beside a label. */
  compact?: boolean;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const [currencies] = api.catalog.currencies.useSuspenseQuery();
  const [settings] = api.settings.get.useSuspenseQuery();
  const mutation = api.settings.setDisplayCurrency.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.settings.get.invalidate(),
        utils.portfolio.invalidate(),
      ]);
      router.refresh();
    },
  });

  return (
    <div>
      <Select
        id={id}
        aria-label="Display currency"
        className={cn(
          compact ? "h-8 w-auto pr-8 font-mono text-[12px]" : "w-auto min-w-44",
          className,
        )}
        value={
          mutation.isPending
            ? mutation.variables.code
            : settings.displayCurrency
        }
        disabled={mutation.isPending}
        onChange={(event) => mutation.mutate({ code: event.target.value })}
      >
        {currencies.map((c) => (
          <option key={c.code} value={c.code}>
            {compact ? c.code : `${c.code} · ${c.name}`}
          </option>
        ))}
      </Select>
      {mutation.error ? (
        <p role="alert" className="text-loss mt-2 text-[13px]">
          {mutation.error.message}
        </p>
      ) : null}
    </div>
  );
}
