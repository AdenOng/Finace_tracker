import { message } from "../../template";
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
    addBody: message<[count: number, currencies: number]>(
      "Pick from {0} brokers and banks (IBKR, moomoo, Tiger, DBS and the rest) or add your own. Each account keeps its own currency, and {1} currencies are supported.",
    ),
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
    from: message<[month: string]>("From {0}"),
    monthAccounts: message<[month: string]>("{0} · accounts"),
    aria: message<[month: string]>(
      "Sample ledger, {0}. Use the arrow keys to turn pages.",
    ),
  },
  chart: {
    overTime: "NET WORTH OVER TIME",
    allocation: "WHAT YOU OWN",
    lastDecember: "last December",
    up: "up",
    down: "down",
    aria: message<
      [
        start: string,
        end: string,
        worth: string,
        direction: string,
        change: string,
      ]
    >("Sample portfolio, {0} to {1}: net worth {2}, {3} {4} on the month."),
    page: message<[page: string]>("PAGE {0} OF 12"),
    worthMonth: message<[month: string]>("NET WORTH · {0}"),
    onMonth: message<[month: string]>("on {0}"),
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
    accountList: message<[names: string[]]>(["join", 0, " and "]),
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
    aria: message<[month: string]>("Sample cash flow for {0}"),
    statement: message<[month: string, page: string]>(
      "{0} · STATEMENT {1} OF 12",
    ),
    savedTo: message<[percent: string, accounts: string]>(
      "{0} of income · added to {1}",
    ),
    spentShare: message<[percent: string]>("Spent · {0}"),
    savedShare: message<[percent: string]>("Saved · {0}"),
    split: message<[spent: string, saved: string]>(
      "Income split: spent {0}, saved {1}",
    ),
    vs: message<[month: string]>("VS {0}"),
  },
  glyphs: {
    netWorth: "NET WORTH",
    signIn: "Sign in",
    seal: "SIGN IN · FINFOLIO · INVITE ONLY ·",
  },
};

export default landing;
