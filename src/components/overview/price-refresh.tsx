"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";

/** Fetches market prices for everything held, then re-renders the totals. */
export function PriceRefresh() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const refresh = api.portfolio.refreshPrices.useMutation({
    onMutate: () => setNote(null),
    onSuccess: (r) => {
      const skipped = [...r.failed, ...r.mismatched];
      if (skipped.length)
        setNote(
          `No market price for ${skipped.join(", ")}, so the statement price is used.`,
        );
      router.refresh();
    },
    onError: (error) => setNote(error.message),
  });
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-my-1 -ml-2"
        loading={refresh.isPending}
        onClick={() => refresh.mutate()}
      >
        <RefreshCw aria-hidden="true" className="size-3.5" />
        Refresh prices
      </Button>
      {note ? <span className="text-warn basis-full">{note}</span> : null}
    </>
  );
}
