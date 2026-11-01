"use client";

import { useT } from "~/i18n/client";
import { useRouter } from "next/navigation";

import { Checkbox } from "~/components/ui/field";
import { api } from "~/trpc/react";

/** Whether CPF and SRS balances count toward the net worth headline. */
export function CountCpfSrs() {
  const t = useT();
  const router = useRouter();
  const utils = api.useUtils();
  const [settings] = api.settings.get.useSuspenseQuery();
  const mutation = api.settings.setCountCpfSrs.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.settings.get.invalidate(),
        utils.portfolio.invalidate(),
      ]);
      router.refresh();
    },
  });

  // Without CPF and SRS in the preset, any existing balances are always counted.
  if (!settings.cpfSrsEnabled) return null;
  return (
    <div className="border-line mt-6 border-t pt-6">
      <Checkbox
        label={t.settings.countCpfSrs.countCpfAndSrsIn}
        description={t.settings.countCpfSrs.theyStillShowOnThe}
        checked={
          mutation.isPending ? mutation.variables.count : settings.countCpfSrs
        }
        disabled={mutation.isPending}
        onChange={(event) => mutation.mutate({ count: event.target.checked })}
      />
      {mutation.error ? (
        <p role="alert" className="text-loss mt-2 text-[13px]">
          {mutation.error.message}
        </p>
      ) : null}
    </div>
  );
}
