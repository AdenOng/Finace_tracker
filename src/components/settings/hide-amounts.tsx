"use client";

import { useHideAmounts } from "~/components/finance/privacy";
import { Checkbox } from "~/components/ui/field";

/** The main switch for masking money across the app. */
export function HideAmounts() {
  const [hidden, setHidden, unsaved] = useHideAmounts();
  return (
    <>
      <Checkbox
        label="Hide amounts"
        description="Balances, totals and transaction amounts show as dots on every page. Click the dots to see one amount, or use the eye on a card to show or hide just that card; changing this setting resets every card."
        checked={hidden}
        onChange={(event) => setHidden(event.target.checked)}
      />
      {unsaved ? (
        <p role="alert" className="text-warn mt-2 text-[13px]">
          Couldn&apos;t save this to your account. It applies on this device
          until you reload; try again in a moment.
        </p>
      ) : null}
    </>
  );
}
