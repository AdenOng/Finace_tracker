const portfolio = {
  consolidated: {
    notValued: "Not valued",
    noAverageCostRecorded: "No average cost recorded",
    portfolio: "Portfolio",
    everyHoldingAcrossYourBrokersAddedUp:
      "Every holding across your brokers, added up.",
    manageAccounts: "Manage accounts ",
    loadingPortfolio: "Loading portfolio…",
    allBrokers: "All brokers",
    partial: "Partial",
    notRecorded: "Not recorded",
    nothingRecordedYetFor: "Nothing recorded yet for",
    holdings: "Holdings",
    brokerCash: "Broker cash",
    unrealisedGain: "Unrealised gain",
    addAverageCostsToSeeThis: "Add average costs to see this",
    waitingForExchangeRates: "Waiting for exchange rates:",
    consolidatedHoldings: "Consolidated holdings",
    searchHoldings: "Search holdings",
    searchSymbolOrName: "Search symbol or name",
    filterByBroker: "Filter by broker",
    noMatchingHoldings: "No matching holdings",
    noHoldingsRecorded: "No holdings recorded",
    tryAnotherSymbolOrCompanyName: "Try another symbol or company name.",
    recordHoldingsInAnInvestmentAccountOrImportAStatement:
      "Record holdings in an investment account or import a statement to see them here.",
    holding: "Holding",
    units: "Units",
    value: "Value",
    gain: "Gain",
    weight: "Weight",
    brokerAccounts: "Broker accounts",
    byBroker: "By broker",
    nothingRecorded: "Nothing recorded",
    theSameSymbolOnTheSameExchangeIsCombinedAcross:
      "The same symbol on the same exchange is combined across brokers.",
    accountsArchived: "Accounts → Archived",
    imported: "Imported",
    manual: "Manual",
    synced: "Synced",
    exchangeRateUnavailable: " · Exchange rate unavailable",
    beforeConversion: " before conversion",
    summary: (positions: number, accounts: number, date: string | null) =>
      `${positions} holding${positions === 1 ? "" : "s"} across ${accounts} account${accounts === 1 ? "" : "s"}${date ? `, up to ${date}` : ""}.`,
    includesBefore: "Includes",
    includesAfter: "in SRS.",
    costCount: (percent: string | null, count: number, total: number) =>
      `${percent !== null ? `${percent} · ` : ""}${count} of ${total} holdings have a cost`,
    unpriced: (n: number) =>
      `${n} position${n === 1 ? " has" : "s have"} no price and ${n === 1 ? "is" : "are"} excluded from the value.`,
    holdingsCount: (n: number) => `Holdings · ${n}`,
    fxDate: (date: string) => ` Exchange rates as of ${date}.`,
    archivedBefore: (n: number) =>
      `${n} archived account${n === 1 ? " is" : "s are"} left out (`,
    archivedAfter: ").",
    brokerCount: (n: number) => ` · ${n} brokers`,
    quoteDate: (date: string) => ` · Quote ${date}`,
    unitsWeight: " units · ",
    unitsDate: (date: string) => `units · ${date}`,
  },
  meta: {
    title: "Consolidated portfolio",
  },
};

export default portfolio;
