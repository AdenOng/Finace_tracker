import { message } from "../../template";
const accounts = {
  detail: {
    accounts: "Accounts",
    readOnly: "Read-only",
    restore: "Restore",
    importStatement: "Import statement",
    updateHoldings: "Update holdings",
    updateBalance: "Update balance",
    thisAccountIsArchivedItIsLeftOutOfYour:
      "This account is archived. It is left out of your net worth and cannot take new entries until restored.",
    value: "Value",
    balance: "Balance",
    enteredByTheOwner: ", entered by the owner",
    enteredByYou: ", entered by you",
    nothingHeld: "Nothing held",
    nothingRecordedYet: "Nothing recorded yet",
    recordHoldings: "Record holdings",
    recordBalance: "Record balance",
    enterWhatThisAccountHoldsAndItsCashToInclude:
      "Enter what this account holds and its cash to include it in your net worth.",
    enterTheCurrentBalanceToIncludeThisAccountInYour:
      "Enter the current balance to include this account in your net worth.",
    byAccount: "By account",
    notSplit: "Not split",
    holdings: "Holdings",
    onlyCashIsHeld: "Only cash is held.",
    holding: "Holding",
    quantity: "Quantity",
    price: "Price",
    averageCost: "Average cost",
    weight: "Weight",
    noPrice: "No price",
    cash: "Cash",
    sharedBy: message<[name: string]>(
      "Shared by {0}. Financial edits are available to the owner in Personal view.",
    ),
    unpriced: message<[n: number]>([
      "text",
      0,
      " holding",
      ["if", ["===", 0, ["number", 1]], " has", "s have"],
      " no price and ",
      ["if", ["===", 0, ["number", 1]], "is", "are"],
      " not counted.",
    ]),
    period: ".",
  },
  drawer: {
    removeExplanation:
      "Accounts with financial history will be archived and can be restored from Accounts → Archived. Empty accounts will be permanently deleted.",
    confirmRemove: "Confirm removal",
    brokersAndRoboAdvisers: "Brokers and robo-advisers",
    cryptoExchanges: "Crypto exchanges",
    depository: "Depository",
    banks: "Banks",
    cardIssuers: "Card issuers",
    government: "Government",
    sharesETFsFundsAndTheCashWaitingToBeInvested:
      "Shares, ETFs, funds and the cash waiting to be invested.",
    cPFInvestmentSchemeOrAnOverseasRetirementAccountThatInvests:
      "CPF Investment Scheme or an overseas retirement account that invests.",
    coinsOnAnExchangeOrInYourOwnWallet:
      "Coins on an exchange or in your own wallet.",
    savingsAndMultiplierAccountsThatPayInterest:
      "Savings and multiplier accounts that pay interest.",
    theAccountYourSalaryLandsInAndBillsLeaveFrom:
      "The account your salary lands in and bills leave from.",
    recordWhatYouOweAsANegativeBalance:
      "Record what you owe as a negative balance.",
    physicalCashYouWantCounted: "Physical cash you want counted.",
    anythingElseWithABalance: "Anything else with a balance.",
    yourOrdinarySpecialMediSaveAndRetirementBalances:
      "Your Ordinary, Special, MediSave and Retirement balances.",
    yourSRSCashAndWhateverItHasBought:
      "Your SRS cash and whatever it has bought.",
    addAnInvestmentAccount: "Add an investment account",
    valuedFromWhatItHoldsYouLlListTheShares:
      "Valued from what it holds. You'll list the shares, units and coins, and any cash.",
    iBKRMoomooEndowusSyfeCoinhako: "IBKR, moomoo, Endowus, Syfe, Coinhako",
    brokerOrPlatform: "Broker or platform",
    nextYouLlEnterItsHoldings: "Next, you'll enter its holdings.",
    addAndEnterHoldings: "Add and enter holdings",
    addABankAccountOrCard: "Add a bank account or card",
    carriesABalanceAndYourSpendingYouLlRecordThe:
      "Carries a balance and your spending. You'll record the balance, then add transactions.",
    dBSOCBCUOBTrustAmex: "DBS, OCBC, UOB, Trust, Amex",
    bankOrCardIssuer: "Bank or card issuer",
    nextYouLlRecordItsBalance: "Next, you'll record its balance.",
    addAndRecordBalance: "Add and record balance",
    addCPFOrSRS: "Add CPF or SRS",
    moneySetAsideForRetirementKeptApartFromYourOther:
      "Money set aside for retirement. Kept apart from your other accounts because you can't spend it yet.",
    cPFDBSSRSOCBCSRSEndowusSRS: "CPF, DBS SRS, OCBC SRS, Endowus SRS",
    heldWith: "Held with",
    nextYouLlRecordItsBalances: "Next, you'll record its balances.",
    addAndRecordBalances: "Add and record balances",
    addAccount: "Add account",
    whatKindOfAccountIsItEachIsTrackedDifferently:
      "What kind of account is it? Each is tracked differently.",
    typeCanOnlyChangeBeforeBalancesTransactionsOrReconciliationsAre:
      "Type can only change before balances, transactions or reconciliations are recorded.",
    notListed: "Not listed",
    howItShowsInYourLists: "How it shows in your lists.",
    eGIBKRPro: "e.g. IBKR Pro",
    eGDBSMultiplier: "e.g. DBS Multiplier",
    lastFourDigits: "Last four digits",
    optional: "Optional",
    saved: message<[name: string]>("Saved {0}."),
    added: message<[name: string]>("Added {0}."),
    removed: message<[name: string]>("Removed {0}."),
    archived: message<[name: string]>(
      "{0} has balances or transactions, so it was archived. Restore it from the archived list.",
    ),
  },
  reconciliation: {
    reconciliation: "Reconciliation",
    verifyStatementBalancesAndProtectTheEntriesYouHaveChecked:
      "Verify statement balances and protect the entries you have checked.",
    reconcileStatement: "Reconcile statement",
    loadingStatementPeriods: "Loading statement periods…",
    noReconciledStatementsYetEnterAStatementSOpeningAnd:
      "No reconciled statements yet. Enter a statement’s opening and closing balances, then check its transactions.",
    period: "Period",
    closingBalance: "Closing balance",
    actions: "Actions",
    statementReopenedItsEntriesCanBeChangedAndReconciledAgain:
      "Statement reopened. Its entries can be changed and reconciled again.",
    confirmReopen: "Confirm reopen",
    reopen: "Reopen",
    statementReconciledItsTransactionsAreClearedAndProtected:
      "Statement reconciled. Its transactions are cleared and protected.",
    openingBalanceAllSignedTransactionsClosingBalanceTransfersAreIncluded:
      "Opening balance + all signed transactions = closing balance. Transfers are included. Reconcile each currency separately.",
    finishReconciliation: "Finish reconciliation",
    statementStart: "Statement start",
    statementEnd: "Statement end",
    statementCurrency: "Statement currency",
    openingBalance: "Opening balance",
    useTheBalanceBeforeTheFirstDayAndAfterThe:
      "Use the balance before the first day and after the last day. Amounts owed on a credit card are negative. This check does not update your portfolio balance snapshot.",
    reviewTransactions: "Review transactions",
    thisPeriodOverlapsAReconciledStatementReopenItBeforeContinuing:
      "This period overlaps a reconciled statement. Reopen it before continuing.",
    expectedClosingBalance: "Expected closing balance",
    difference: "Difference",
    uncheckAll: "Uncheck all",
    verifyAllEntries: "Verify all entries",
    verified: "Verified",
    dateDescription: "Date / description",
    noEntriesInThisPeriodAndCurrencyOnlyFinishIf:
      "No entries in this period and currency. Only finish if the unchanged balance matches your statement.",
    mismatch: message<[difference: string, currency: string]>(
      "Balances do not match. Check for missing or duplicate transactions, incorrect amounts, and the statement dates. Correct the entries in Spending, then review again. Exact difference: {0} {1}.",
    ),
    verifiedCount: message<[verified: number, total: number]>(
      "{0} of {1} entries verified against the statement.",
    ),
    verify: message<[description: string, date: string]>("Verify {0} on {1}"),
  },
  transactions: {
    transactions: "Transactions",
    whatCameInAndWentOutTransfersBetweenYourOwn:
      "What came in and went out. Transfers between your own accounts are shown but not counted.",
    addTransaction: "Add transaction",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    in: "In",
    out: "Out",
    transfer: "Transfer",
    notCategorised: "Not categorised",
    openInSpending: "Open in Spending",
    empty: message<[month: string]>("Nothing recorded for {0}."),
  },
  view: {
    investments: "Investments",
    brokerageRetirementAndCryptoAccountsValuedFromTheirHoldings:
      "Brokerage, retirement and crypto accounts, valued from their holdings.",
    addABrokerageRoboAdviserOrCryptoAccountAndList:
      "Add a brokerage, robo-adviser or crypto account and list what it holds.",
    addInvestmentAccount: "Add investment account",
    broker: "Broker",
    value: "Value",
    bankCards: "Bank & cards",
    savingsCurrentAndCreditCardAccountsTheirTransactionsFeedSpending:
      "Savings, current and credit card accounts. Their transactions feed Spending.",
    addABankAccountOrCreditCardRecordItsBalance:
      "Add a bank account or credit card, record its balance, then add transactions.",
    addBankOrCard: "Add bank or card",
    bank: "Bank",
    balance: "Balance",
    cPFSRS: "CPF & SRS",
    retirementMoneyYouCanTSpendYetShownApartOn:
      "Retirement money you can't spend yet. Shown apart on the overview.",
    addYourCPFBalancesOrAnSRSAccountWithYour:
      "Add your CPF balances, or an SRS account with your bank or platform.",
    addCPFOrSRS: "Add CPF or SRS",
    heldWith: "Held with",
    filterAccounts: "Filter accounts",
    open: "Open",
    archived: "Archived",
    addAccount: "Add account",
    consolidatedView: "Consolidated view",
    accountsYouRemoveThatStillHaveHistoryEndUpHere:
      "Accounts you remove that still have history end up here.",
    account: "Account",
    asOf: "As of",
    actions: "Actions",
    notRecorded: "Not recorded",
    restore: "Restore",
    unpriced: message<[n: number]>("{0} unpriced"),
  },
  history: {
    entryDeletedTheAccountNowUsesItsLatestRemainingDated:
      "Entry deleted. The account now uses its latest remaining dated entry.",
    entryHistory: "Entry history",
    manageHoldingsAndCashEnteredManuallyOrImportedFromStatements:
      "Manage holdings and cash entered manually or imported from statements.",
    addEntry: "Add entry",
    dismiss: "Dismiss",
    loadingEntry: "Loading entry…",
    loadingHistory: "Loading history…",
    noEntriesYetAddHoldingsManuallyOrImportAStatement:
      "No entries yet. Add holdings manually or import a statement image.",
    current: "Current",
    blankEntry: "Blank entry",
    loadOlderEntries: "Load older entries",
    ifThisIsTheCurrentEntryTheMostRecentRemaining:
      "If this is the current entry, the most recent remaining dated entry becomes the account value. The original upload, spending transactions and imported trades stay saved.",
    manual: "Manual",
    imported: "Imported",
    synced: "Synced",
    summary: message<
      [source: string, adjusted: boolean, positions: number, cash: number]
    >([
      "text",
      0,
      ["if", 1, " · Adjusted", ""],
      " · ",
      2,
      " holding",
      ["if", ["===", 2, ["number", 1]], "", "s"],
      " · ",
      3,
      " cash balance",
      ["if", ["===", 3, ["number", 1]], "", "s"],
    ]),
    viewImport: message<[date: string]>("View import for {0}"),
    editEntry: message<[date: string]>("Edit entry for {0}"),
    deleteEntry: message<[date: string]>("Delete entry for {0}"),
    deleteEntryTitle: "Delete entry",
    removeConfirm: message<[date: string]>(
      "Remove the holdings and cash recorded for {0}?",
    ),
    removeCount: message<[positions: number, cash: number]>([
      "text",
      "This removes ",
      0,
      " holding",
      ["if", ["===", 0, ["number", 1]], "", "s"],
      " and ",
      1,
      " cash balance",
      ["if", ["===", 1, ["number", 1]], "", "s"],
      " from this dated entry.",
    ]),
  },
  snapshot: {
    entryUpdated: "Entry updated.",
    replacedTheEntryForThatDate: "Replaced the entry for that date.",
    holdingsRecorded: "Holdings recorded.",
    balanceRecorded: "Balance recorded.",
    editEntry: "Edit entry",
    addEntry: "Add entry",
    updateHoldings: "Update holdings",
    updateBalance: "Update balance",
    whatTheAccountHeldOnADatePricesAreUsed:
      "What the account held on a date. Prices are used until live quotes are available.",
    copyEachBalanceFromTheCPFAppOrYourLatest:
      "Copy each balance from the CPF app or your latest statement. Leave out any you don't have.",
    enterWhatYouOweAsANegativeAmount:
      "Enter what you owe as a negative amount.",
    theBalanceShownByYourBankOnADate:
      "The balance shown by your bank on a date.",
    editingTheseHoldingsKeepsTheOriginalStatementImageOrFile:
      "Editing these holdings keeps the original statement image or file and any imported trades. Changes apply to this saved entry.",
    asOf: "As of",
    theNewestDatedEntryDeterminesTheAccountValueAnExisting:
      "The newest dated entry determines the account value. An existing entry will not be overwritten.",
    savingTheSameDateAgainReplacesThatEntry:
      "Saving the same date again replaces that entry.",
    holdings: "Holdings",
    symbol: "Symbol",
    exchange: "Exchange",
    quantity: "Quantity",
    price: "Price",
    averageCost: "Average cost",
    optionalPerUnit: "Optional, per unit",
    marketValue: "Market value",
    optionalTotalOtherwiseQuantityPrice:
      "Optional total; otherwise quantity × price.",
    addHolding: "Add holding",
    balances: "Balances",
    retirementOpensAt55WhenSpecialCloses:
      "Retirement opens at 55, when Special closes.",
    removeIt: "Remove it",
    cash: "Cash",
    balance: "Balance",
    addCurrency: "Add currency",
    emptyHint: message<[investments: boolean]>([
      "text",
      "Add a holding or cash balance before saving. To record an empty account, enter 0 under ",
      ["if", 0, "Cash", "Balance"],
      ".",
    ]),
    holdingNumber: message<[n: number]>("Holding {0}"),
    removeHolding: message<[n: number]>("Remove holding {0}"),
    bucketCurrency: message<[bucket: string]>("{0} (SGD)"),
    removeBalance: message<[currency: string]>("Remove {0} balance"),
    unsplit: message<[balances: string]>(
      "An earlier entry recorded {0} without a split.",
    ),
    unsplitAfter: "once you've entered the balances above.",
  },
  meta: {
    title: "Accounts",
    detailTitle: "Account",
    description:
      "Investments are valued from what they hold; bank and card accounts from their balance and transactions. Each keeps its own currency.",
  },
};

export default accounts;
