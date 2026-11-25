import { CardSkeleton } from "~/components/ui/panel";
import { getT } from "~/i18n/server";

export default async function AppLoading() {
  const t = await getT();
  return (
    <div className="space-y-4">
      <CardSkeleton rows={3} label={t.common.status.loading} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CardSkeleton rows={4} />
        <CardSkeleton rows={4} />
      </div>
    </div>
  );
}
