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
      await utils.settings.get.invalidate();
      router.refresh();
    },
  });

  return (
    <Select
      id={id}
      aria-label="Display currency"
      className={cn(
        compact ? "h-8 w-auto pr-8 font-mono text-[12px]" : "w-auto min-w-44",
        className,
      )}
      value={mutation.variables?.code ?? settings.displayCurrency}
      disabled={mutation.isPending}
      onChange={(event) => mutation.mutate({ code: event.target.value })}
    >
      {currencies.map((c) => (
        <option key={c.code} value={c.code}>
          {compact ? c.code : `${c.code} · ${c.name}`}
        </option>
      ))}
    </Select>
  );
}
