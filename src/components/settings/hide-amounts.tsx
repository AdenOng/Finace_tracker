"use client";

import { useT } from "~/i18n/client";
import { useHideAmounts } from "~/components/finance/privacy";
import { Checkbox } from "~/components/ui/field";

/** The main switch for masking money across the app. */
export function HideAmounts() {
  const t = useT();
  const [hidden, setHidden, unsaved] = useHideAmounts();
  return (
    <>
      <Checkbox
        label={t.settings.hideAmounts.hideAmounts}
        description={t.settings.hideAmounts.balancesTotalsAndTransactionAmounts}
        checked={hidden}
        onChange={(event) => setHidden(event.target.checked)}
      />
      {unsaved ? (
        <p role="alert" className="text-warn mt-2 text-[13px]">
          {t.settings.hideAmounts.couldntSaveThisToYour}
        </p>
      ) : null}
    </>
  );
}
