const overview = {
  sentenceEnd: ".",
  meta: { title: "Overview" },
  accountRow: {
    notRecorded: "Not recorded",
    awaitingPrices: "Awaiting prices",
    rateUnavailable: "Rate unavailable",
    partialFXUnavailable: "Partial · FX unavailable",
    owed: "owed",
    unpriced: (n: number) => `${n} unpriced holding${n === 1 ? "" : "s"}`,
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
    srsRelief: (cap: string) =>
      `What you put into SRS comes off your taxable income, up to ${cap} a year.`,
    putIn: (year: number | string) => `Put in ${year}`,
    capReached: (cap: string, year: number | string) =>
      `You've reached the ${cap} cap for ${year}.`,
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
    since: (date: string) => `since ${date}`,
    chartDescription: (
      label: string,
      first: string,
      last: string,
      start: string,
      end: string,
    ) =>
      `${label} from ${first} to ${last}: ${start} to ${end}. Use the left and right arrow keys to read each date.`,
    estimateNotice: (date: string | null) =>
      `Estimated from your account entries and past market prices${date ? `, until daily figures began on ${date}.` : ". Daily figures are recorded from today."}`,
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
    unavailable: (symbols: string) =>
      `No market price for ${symbols}, so the statement price is used.`,
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
    netWorthName: (name: string | undefined) => `Net worth · ${name ?? ""}`,
    recordedBalances: (oldest: string | null, latest: string) =>
      `Latest recorded balances${oldest && oldest !== latest ? `, from ${oldest} to ${latest}` : `, as of ${latest}`}. Balances more than 45 days old are marked stale.`,
    marketPrices: (quoted: number, holdings: number, date: string) =>
      `${quoted === holdings ? "All" : `${quoted} of`} ${holdings} holding${holdings === 1 ? "" : "s"} at market prices, as of ${date}.`,
    implausible: (symbols: string) =>
      `The market price of ${symbols} is far from its statement price, so the statement price is used. Check the symbol, exchange and type in that account's entry.`,
    availableToday: "you can reach today.",
    inRetirement: "is in CPF and SRS.",
    leavesOut: "Leaves out",
    retirementAfter: "in CPF and SRS.",
    debtBefore: "After",
    debtAfter: "card debt",
    converted: (currency: string, date: string) =>
      `Converted to ${currency} · exchange rates as of ${date}.`,
    notConverted: (currency: string) =>
      `Not included, no exchange rate to ${currency} yet:`,
    unpriced: (n: number) =>
      `${n} holding${n === 1 ? "" : "s"} without a price ${n === 1 ? "is" : "are"} not counted.`,
    accountsShare: (n: number, share: string) =>
      `${n} account${n === 1 ? "" : "s"} · ${share}`,
    locked: (share: string) => `Locked for later · ${share}`,
    setup: (done: number, total: number) => `Getting set up · ${done}/${total}`,
    spendingMonth: (month: string) => `Spending · ${month}`,
    comparison: (less: boolean, month: string) =>
      `${less ? "less" : "more"} than ${month}. Transfers between your own accounts aren't counted.`,
    noSpending: (month: string) => `No spending recorded for ${month} yet.`,
    excludedSpending: (currencies: string) =>
      `Spending in ${currencies} isn't included: there is no exchange rate for it yet.`,
    netWorth: "Net worth",
  },
  transferFreshnessNotices: {
    from: (name: string) => `Transfer from ${name} (`,
    to: (date: string, name: string) => `on ${date}) to ${name} (`,
    explanation: (
      date: string,
      missing: boolean,
      fresh: string,
      freshDate: string,
      stale: string,
      staleDate: string,
      outgoing: boolean,
    ) =>
      `on ${date}) is temporarily ${missing ? "missing from net worth" : "counted twice in net worth"}: ${fresh}'s balance from ${freshDate} includes it, but ${stale}'s is from ${staleDate}, before the transfer ${outgoing ? "left" : "reached"} it.`,
    update: (name: string, shared: boolean) =>
      `${shared ? "Ask the owner to update" : "Update"} ${name} to fix`,
  },
};
export default overview;
