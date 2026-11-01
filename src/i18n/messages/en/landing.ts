const landing = {
  meta: {
    title: "Sign in",
  },
  home: {
    how: "How it works",
    signIn: "Sign in",
    invite: "Invite only. Ask whoever runs this Finfolio for a link.",
    headlineFirst: "Every account,",
    headlineSecond: "one number.",
    intro:
      "Finfolio keeps your brokerage, bank and card accounts in one place. Balances are converted to the currency you choose and added up, so you can see what you're worth and where this month's money went.",
    add: "Add your accounts",
    record: "Record what changed",
    keep: "Keep it to yourself",
    recordBody:
      "Upload a statement or screenshot and an AI model you pick reads it; nothing is saved until you check it line by line. Balances, holdings and spending can be entered by hand too.",
    keepBody:
      "It runs on your own server. New users need an invite. Sign in with email and password or a passkey, with two-step verification for added protection. AI provider keys are stored encrypted.",
    sample: "The poster uses made-up figures, not anyone's real data.",
    addBody: (count: number, currencies: number) =>
      `Pick from ${count} brokers and banks (IBKR, moomoo, Tiger, DBS and the rest) or add your own. Each account keeps its own currency, and ${currencies} currencies are supported.`,
  },
  book: {
    accounts: "Accounts",
    samplePortfolio: "SAMPLE PORTFOLIO",
    monthEnd: "BALANCES AT MONTH END, S$",
    lastDecember: "last December",
    change: "Change",
    netWorth: "Net worth",
    role: "book",
    previous: "Previous month",
    next: "Next month",
    pause: "Pause",
    play: "Play",
    caption: "Nº 01 — A year of one portfolio",
    captionLeft:
      "The accounts on the left add up to the net worth on the right.",
    captionBody:
      "The line shows net worth so far, and the allocation below shows what it's made of. Drag a page corner, click a page or pick a month to turn. Sample figures.",
    from: (month: string) => `From ${month}`,
    monthAccounts: (month: string) => `${month} · accounts`,
    aria: (month: string) =>
      `Sample ledger, ${month}. Use the arrow keys to turn pages.`,
  },
  chart: {
    overTime: "NET WORTH OVER TIME",
    allocation: "WHAT YOU OWN",
    lastDecember: "last December",
    up: "up",
    down: "down",
    aria: (
      start: string,
      end: string,
      worth: string,
      direction: string,
      change: string,
    ) =>
      `Sample portfolio, ${start} to ${end}: net worth ${worth}, ${direction} ${change} on the month.`,
    page: (page: string) => `PAGE ${page} OF 12`,
    worthMonth: (month: string) => `NET WORTH · ${month}`,
    onMonth: (month: string) => `on ${month}`,
  },
  sample: {
    classes: {
      stocks: "Stocks",
      bonds: "Bonds",
      cash: "Cash",
      crypto: "Crypto",
    },
    spending: {
      housing: "Housing",
      food: "Food",
      shopping: "Shopping",
      family: "Family",
      insurance: "Insurance",
      bills: "Bills",
      transport: "Transport",
      travel: "Travel",
      other: "Everything else",
    },
    income: {
      Salary: "Salary",
      Bonus: "Bonus",
      Dividends: "Dividends",
    },
  },
  cashFlow: {
    accountList: (names: string[]) => names.join(" and "),
    title: "Cash flow",
    moneyIn: "Money in",
    moneyOut: "Money out",
    saved: "Saved",
    inOut: "IN AND OUT",
    year: "THE YEAR SO FAR",
    in: "IN",
    out: "OUT",
    sinceJanuary: "Saved since January",
    averageRate: "Average saving rate",
    aria: (month: string) => `Sample cash flow for ${month}`,
    statement: (month: string, page: string) =>
      `${month} · STATEMENT ${page} OF 12`,
    savedTo: (percent: string, accounts: string) =>
      `${percent} of income · added to ${accounts}`,
    spentShare: (percent: string) => `Spent · ${percent}`,
    savedShare: (percent: string) => `Saved · ${percent}`,
    split: (spent: string, saved: string) =>
      `Income split: spent ${spent}, saved ${saved}`,
    vs: (month: string) => `VS ${month}`,
  },
  glyphs: {
    netWorth: "NET WORTH",
    signIn: "Sign in",
    seal: "SIGN IN · FINFOLIO · INVITE ONLY ·",
  },
};

export default landing;
