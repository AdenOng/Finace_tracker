import type {
  NetWorthPoint,
  NetWorthSeries,
} from "~/components/overview/net-worth-chart";
import { type AccountGroup, accountGroups } from "~/lib/accounts";

/** Today's figure for one account group, as its overview card shows it. */
export type GroupToday = {
  /** Whether any of the group's accounts has an entry. */
  entered: boolean;
  /** Null when none of the group could be converted to the display currency. */
  total: string | null;
  partial: boolean;
};

/**
 * The overview chart's series: the whole net worth, then each account group, each ending on
 * today's figure. A group with nothing convertible today keeps its history without a made-up
 * drop to zero. Series with fewer than two points are left out.
 */
export function netWorthSeries(input: {
  trend: NetWorthPoint[];
  groups: Record<AccountGroup, NetWorthPoint[]>;
  today: string;
  now: Record<AccountGroup, GroupToday>;
}): NetWorthSeries[] {
  return [
    {
      key: "all",
      label: "Net worth",
      points: input.trend,
      headline: true,
    },
    ...(Object.keys(accountGroups) as AccountGroup[]).map((group) => {
      const { entered, total, partial } = input.now[group];
      return {
        key: group,
        label: accountGroups[group].label,
        points: [
          ...input.groups[group].filter((p) => p.date < input.today),
          ...(entered && total !== null
            ? [
                {
                  date: input.today,
                  total,
                  partial,
                  estimated: false,
                  backfilled: false,
                },
              ]
            : []),
        ],
      };
    }),
  ].filter((series) => series.points.length > 1);
}
