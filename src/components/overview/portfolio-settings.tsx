"use client";

import { Settings } from "lucide-react";
import { Suspense, useState } from "react";

import { CurrencySelect } from "~/components/settings/currency-select";
import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/dialog";

export function PortfolioSettings({
  currency,
  id,
  iconOnly = false,
}: {
  currency: string;
  id: string;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-11 min-w-11"
        aria-label={
          iconOnly
            ? "Investment display settings"
            : "Net worth display settings"
        }
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {!iconOnly ? <span className="font-mono">{currency}</span> : null}
        <Settings aria-hidden="true" className="size-4" />
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Portfolio display"
        description="Choose one currency for your net worth, investments and account totals."
        footer={<Button onClick={() => setOpen(false)}>Done</Button>}
      >
        <label
          htmlFor={id}
          className="text-ink-2 mb-2 block text-sm font-medium"
        >
          Display currency
        </label>
        <Suspense
          fallback={<p className="text-ink-3 text-sm">Loading currencies…</p>}
        >
          <CurrencySelect id={id} />
        </Suspense>
        <p className="text-ink-3 mt-4 text-sm">
          Each account total includes its investments and cash, converted using
          the latest available daily exchange rates. Changing currency updates
          every total together.
        </p>
        <p className="text-ink-3 mt-3 text-sm">
          Exchange rates refresh automatically. If a rate is unavailable, the
          total is marked as partial until conversion is available.
        </p>
      </Drawer>
    </>
  );
}
