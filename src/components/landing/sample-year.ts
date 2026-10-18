/**
 * One made-up year of one portfolio, built bottom-up so every figure on the front page agrees:
 * account balances come from asset-class values, and net worth, monthly change and allocation
 * are derived from the accounts. Not anyone's real data.
 */

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Distinct asset colors on cream paper; red and green remain cash-flow signals.
export const CLASSES = [
  { key: "stocks", label: "Stocks", color: "#3569ab" },
  { key: "bonds", label: "Bonds", color: "#c38a26" },
  { key: "cash", label: "Cash", color: "#278b83" },
  { key: "crypto", label: "Crypto", color: "#8956a6" },
] as const;

type ClassKey = (typeof CLASSES)[number]["key"];

/** Balances on 31 December the year before. */
const OPENING: Record<ClassKey, number> = {
  stocks: 92_000,
  bonds: 26_000,
  cash: 38_000,
  crypto: 9_000,
};

/** Monthly returns in percent: stocks swing, crypto swings hard, bonds barely move. */
const RETURNS: Record<"stocks" | "bonds" | "crypto", number[]> = {
  stocks: [3.1, 2.4, -5.8, 4.6, 3.9, -2.7, 4.2, 2.8, -3.9, 4.1, 2.6, 3.3],
  bonds: [0.4, 0.2, 0.5, 0.1, 0.3, 0.4, 0.2, 0.3, 0.5, 0.1, 0.3, 0.4],
  crypto: [12, -9, -18, 22, 6, -14, 15, -7, -11, 19, 9, -6],
};

/** Take-home pay, plus quarterly dividends and a year-end bonus. */
const INCOME_EXTRA = [0, 0, 180, 0, 0, 240, 0, 0, 160, 0, 0, 2400];
const SALARY = 6500;

/** What is left after spending goes into cash each month. */
const SAVED = [
  1200, 1300, 1100, 1500, 1200, 1250, 1300, 1200, 1400, 1150, 1300, 1600,
];

export const SPENDING = [
  { key: "housing", label: "Housing" },
  { key: "food", label: "Food" },
  { key: "shopping", label: "Shopping" },
  { key: "family", label: "Family" },
  { key: "insurance", label: "Insurance" },
  { key: "bills", label: "Bills" },
  { key: "transport", label: "Transport" },
  { key: "travel", label: "Travel" },
  { key: "other", label: "Everything else" },
] as const;

/** Monthly spend by category; "Everything else" is whatever is left of the month's spending. */
const SPEND: Record<
  Exclude<(typeof SPENDING)[number]["key"], "other">,
  number[]
> = {
  housing: Array<number>(12).fill(1850),
  food: [1020, 960, 1080, 990, 1050, 1110, 1000, 1040, 980, 1070, 1010, 1240],
  shopping: [520, 410, 600, 380, 560, 480, 450, 530, 420, 610, 500, 880],
  family: Array<number>(12).fill(500),
  insurance: Array<number>(12).fill(420),
  bills: [340, 330, 350, 320, 335, 360, 345, 340, 330, 350, 340, 370],
  transport: [310, 290, 330, 300, 320, 340, 300, 310, 290, 330, 300, 360],
  travel: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1500],
};

export const ACCOUNTS = [
  { name: "IBKR", holds: "stocks", share: 0.7 },
  { name: "moomoo", holds: "stocks", share: 0.3 },
  { name: "Endowus", holds: "bonds", share: 1 },
  { name: "Tiger", holds: "cash", share: 0.65 },
  { name: "Longbridge", holds: "cash", share: 0.35 },
  { name: "Coinhako", holds: "crypto", share: 1 },
] as const satisfies readonly {
  name: string;
  holds: ClassKey;
  share: number;
}[];

export type SampleMonth = {
  name: string;
  /** Account balances in whole S$. */
  accounts: number[];
  /** Asset-class totals in S$, summed from the accounts. */
  classes: number[];
  worth: number;
  change: number;
  /** Asset-class shares of net worth, 0–1. */
  shares: number[];
  income: { label: string; amount: number }[];
  incomeTotal: number;
  /** Spending by category, in the order of SPENDING. */
  spending: number[];
  spendingTotal: number;
  /** Income minus spending: exactly what the cash accounts grew by. */
  saved: number;
};

function build(): SampleMonth[] {
  const values = { ...OPENING };
  let previous = Object.values(OPENING).reduce((a, b) => a + b, 0);
  return MONTHS.map((name, m) => {
    values.stocks *= 1 + RETURNS.stocks[m]! / 100;
    values.bonds *= 1 + RETURNS.bonds[m]! / 100;
    values.crypto *= 1 + RETURNS.crypto[m]! / 100;
    values.cash += SAVED[m]!;

    // Whole dollars; the last account of each class takes the remainder so classes add up.
    const accounts = ACCOUNTS.map(() => 0);
    for (const c of CLASSES) {
      const total = Math.round(values[c.key]);
      let left = total;
      const members = ACCOUNTS.flatMap((a, i) =>
        a.holds === c.key ? [i] : [],
      );
      members.forEach((i, j) => {
        const v =
          j === members.length - 1
            ? left
            : Math.round(total * ACCOUNTS[i]!.share);
        accounts[i] = v;
        left -= v;
      });
    }
    const classes = CLASSES.map((c) =>
      ACCOUNTS.reduce(
        (sum, a, i) => (a.holds === c.key ? sum + accounts[i]! : sum),
        0,
      ),
    );
    const worth = accounts.reduce((a, b) => a + b, 0);
    const change = worth - previous;
    previous = worth;

    const extra = INCOME_EXTRA[m]!;
    const income = [
      { label: "Salary", amount: SALARY },
      ...(extra > 0
        ? [{ label: m === 11 ? "Bonus" : "Dividends", amount: extra }]
        : []),
    ];
    const incomeTotal = SALARY + extra;
    const spendingTotal = incomeTotal - SAVED[m]!;
    const known = SPENDING.map((c) =>
      c.key === "other" ? 0 : SPEND[c.key][m]!,
    );
    const other = spendingTotal - known.reduce((a, b) => a + b, 0);
    const spending = known.map((v, i) =>
      SPENDING[i]!.key === "other" ? other : v,
    );

    return {
      name,
      accounts,
      classes,
      worth,
      change,
      shares: classes.map((v) => v / worth),
      income,
      incomeTotal,
      spending,
      spendingTotal,
      saved: SAVED[m]!,
    };
  });
}

export const SAMPLE_YEAR = build();
