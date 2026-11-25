import { message } from "../../template";
const overview = {
  sentenceEnd: ".",
  meta: { title: "Overview" },
  accountRow: {
    notRecorded: "Not recorded",
    awaitingPrices: "Awaiting prices",
    rateUnavailable: "Rate unavailable",
    partialFXUnavailable: "Partial · FX unavailable",
    owed: "owed",
    unpriced: message<[n: number]>([
      "text",
      0,
      " unpriced holding",
      ["if", ["===", 0, ["number", 1]], "", "s"],
    ]),
  },
  cpfSrsSheet: {
    cPFSRSForLater: "CPF & SRS · for later",
    accounts: "Accounts",
    partialTotalSomeHoldingsAreMissingAPrice:
      "Partial total. Some holdings are missing a price or exchange rate.",
    copyYourOrdinarySpecialAndMediSaveBalancesFrom:
      "Copy your Ordinary, Special and MediSave balances from the CPF app.",
    addCPF: "Add CPF",
    notSplit: "Not split",
    notSplitByAccount: "Not split by account",
    addAnSRSAccount: "Add an SRS account",
    noTopupsRecordedYetAnythingInBy31:
      "No top-ups recorded yet. Anything in by 31 Dec comes off next year's tax bill. Deposits show up here when you import an SRS statement.",
    countedInNetWorth: "Counted in net worth.",
    notCountedInNetWorth: "Not counted in net worth.",
    cPFOpensUpFrom55SRSCanBe:
      "CPF opens up from 55; SRS can be withdrawn without penalty from your statutory retirement age.",
    changeThisUnderTheGearIcon: " Change this under the gear icon.",
    interestBefore: "About",
    interestAfter: "a year in interest at today's rates, paid in January.",
    srsRelief: message<[cap: string]>(
      "What you put into SRS comes off your taxable income, up to {0} a year.",
    ),
    putIn: message<[year: number | string]>("Put in {0}"),
    capReached: message<[cap: string, year: number | string]>(
      "You've reached the {0} cap for {1}.",
    ),
    roomAfter: "more by 31 Dec gets you the full tax relief.",
    roomBefore: "",
  },
  netWorthChart: {
    netWorthChartData: "Net worth chart data",
    overTime: "Over time",
    noChange: "No change",
    netWorthChartRange: "Net worth chart range",
    backfilled: "Backfilled*",
    backfilledLabel: "backfilled",
    backfilledSuffix: " · backfilled*",
    estimatedFromYourEntries: "Estimated from your entries",
    partialTotal: "partial total",
    dataIsBackfilledBeforeEachAccountsFirstEntry:
      "* Data is backfilled before each account’s first entry. Unable to determine the cost price or purchase date of items, so that entry’s holdings are valued at past market prices. Shows market movement, not your actual gains.",
    showAsTable: "Show as table",
    estimated: " · estimated",
    partial: "· partial",
    ranges: { "3m": "3M", "1y": "1Y", all: "All" },
    since: message<[date: string]>("since {0}"),
    chartDescription: message<
      [label: string, first: string, last: string, start: string, end: string]
    >(
      "{0} from {1} to {2}: {3} to {4}. Use the left and right arrow keys to read each date.",
    ),
    estimateNotice: message<[date: string | null]>([
      "text",
      "Estimated from your account entries and past market prices",
      [
        "if",
        0,
        ["text", ", until daily figures began on ", 0, "."],
        ". Daily figures are recorded from today.",
      ],
    ]),
  },
  portfolioSettings: {
    investmentDisplaySettings: "Investment display settings",
    netWorthDisplaySettings: "Net worth display settings",
    portfolioDisplay: "Portfolio display",
    chooseOneCurrencyForYourNetWorthInvestments:
      "Choose one currency for your net worth, investments and account totals.",
    displayCurrency: "Display currency",
    loadingCurrencies: "Loading currencies…",
    eachAccountTotalIncludesItsInvestmentsAndCash:
      "Each account total includes its investments and cash, converted using the latest available daily exchange rates. Changing currency updates every total together.",
    exchangeRatesRefreshAutomaticallyIfARateIs:
      "Exchange rates refresh automatically. If a rate is unavailable, the total is marked as partial until conversion is available.",
  },
  priceRefresh: {
    refreshPrices: "Refresh prices",
    unavailable: message<[symbols: string]>(
      "No market price for {0}, so the statement price is used.",
    ),
  },
  page: {
    notCategorised: "Not categorised",
    other: "Other",
    partialTotal: "Partial total",
    nothingToTotalYetAddAnAccountBelow:
      "Nothing to total yet. Add an account below and record what it holds.",
    holdingsAreValuedAtTheirStatementPrices:
      "Holdings are valued at their statement prices.",
    sinceThePreviousClose: "since the previous close",
    notCountedInNetWorth: "Not counted in net worth",
    twostepSignin: "Two-step sign-in",
    defaultAIProvider: "Default AI provider",
    anInvestmentAccount: "An investment account",
    aBankAccountOrCard: "A bank account or card",
    portfolio: "Portfolio",
    partialInvestmentTotalAllocationWillAppearWhenEvery:
      "Partial investment total. Allocation will appear when every holding has a price and exchange rate.",
    brokerageRetirementAndCryptoAccountsAreValuedFrom:
      "Brokerage, retirement and crypto accounts are valued from what they hold.",
    addOne: "Add one",
    transactions: "Transactions",
    moneyIn: "Money in",
    moneyOut: "Money out",
    leftOver: "Left over",
    whereItWent: "Where it went",
    everythingElse: "Everything else",
    savingsCurrentAndCreditCardAccountsCarryA:
      "Savings, current and credit card accounts carry a balance and your transactions.",
    netWorthName: message<[name: string | undefined]>([
      "text",
      "Net worth · ",
      ["??", 0, ""],
    ]),
    recordedBalances: message<[oldest: string | null, latest: string]>([
      "text",
      "Latest recorded balances",
      [
        "if",
        ["&&", 0, ["!==", 0, 1]],
        ["text", ", from ", 0, " to ", 1],
        ["text", ", as of ", 1],
      ],
      ". Balances more than 45 days old are marked stale.",
    ]),
    marketPrices: message<[quoted: number, holdings: number, date: string]>([
      "text",
      ["if", ["===", 0, 1], "All", ["text", 0, " of"]],
      " ",
      1,
      " holding",
      ["if", ["===", 1, ["number", 1]], "", "s"],
      " at market prices, as of ",
      2,
      ".",
    ]),
    implausible: message<[symbols: string]>(
      "The market price of {0} is far from its statement price, so the statement price is used. Check the symbol, exchange and type in that account's entry.",
    ),
    availableToday: "you can reach today.",
    inRetirement: "is in CPF and SRS.",
    leavesOut: "Leaves out",
    retirementAfter: "in CPF and SRS.",
    debtBefore: "After",
    debtAfter: "card debt",
    converted: message<[currency: string, date: string]>(
      "Converted to {0} · exchange rates as of {1}.",
    ),
    notConverted: message<[currency: string]>(
      "Not included, no exchange rate to {0} yet:",
    ),
    unpriced: message<[n: number]>([
      "text",
      0,
      " holding",
      ["if", ["===", 0, ["number", 1]], "", "s"],
      " without a price ",
      ["if", ["===", 0, ["number", 1]], "is", "are"],
      " not counted.",
    ]),
    accountsShare: message<[n: number, share: string]>([
      "text",
      0,
      " account",
      ["if", ["===", 0, ["number", 1]], "", "s"],
      " · ",
      1,
    ]),
    locked: message<[share: string]>("Locked for later · {0}"),
    setup: message<[done: number, total: number]>("Getting set up · {0}/{1}"),
    spendingMonth: message<[month: string]>("Spending · {0}"),
    comparison: message<[less: boolean, month: string]>([
      "text",
      ["if", 0, "less", "more"],
      " than ",
      1,
      ". Transfers between your own accounts aren't counted.",
    ]),
    noSpending: message<[month: string]>("No spending recorded for {0} yet."),
    excludedSpending: message<[currencies: string]>(
      "Spending in {0} isn't included: there is no exchange rate for it yet.",
    ),
    netWorth: "Net worth",
  },
  transferFreshnessNotices: {
    from: message<[name: string]>("Transfer from {0} ("),
    to: message<[date: string, name: string]>("on {0}) to {1} ("),
    explanation: message<
      [
        date: string,
        missing: boolean,
        fresh: string,
        freshDate: string,
        stale: string,
        staleDate: string,
        outgoing: boolean,
      ]
    >([
      "text",
      "on ",
      0,
      ") is temporarily ",
      ["if", 1, "missing from net worth", "counted twice in net worth"],
      ": ",
      2,
      "'s balance from ",
      3,
      " includes it, but ",
      4,
      "'s is from ",
      5,
      ", before the transfer ",
      ["if", 6, "left", "reached"],
      " it.",
    ]),
    update: message<[name: string, shared: boolean]>([
      "text",
      ["if", 1, "Ask the owner to update", "Update"],
      " ",
      0,
      " to fix",
    ]),
  },
};
export default overview;
