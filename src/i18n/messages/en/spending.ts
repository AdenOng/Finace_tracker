const spending = {
  meta: {
    spending: "Spending",
    transfers: "Transfers",
  },
  bulkEditDrawer: {
    updated: (n: number) => `${n} transactions updated.`,
    categorised: (n: number) => `${n} transactions categorised.`,
    deleted: (n: number) => `${n} transactions deleted.`,
    selected: (n: number) => `${n} selected transactions.`,
    applyChanges: (n: number) => `Apply ${n} changes`,
    deleteTransactions: (n: number) => `Delete ${n} transactions`,
    previewSummary: (changes: number, skipped: number) =>
      `${changes} changes; ${skipped} entries unchanged.`,
    ruleMatch: (name: string, pattern: string) =>
      `${name} · matches “${pattern}”`,

    editSelectedTransactions: "Edit selected transactions",
    applyMerchantRules: "Apply merchant rules",
    deleteSelectedTransactions: "Delete selected transactions",
    saveChanges: "Save changes",
    onlyTheFieldsYouChooseWillChange:
      "Only the fields you choose will change. A blank value clears that field.",
    category: "Category",
    keepExistingCategories: "Keep existing categories",
    clearCategory: "Clear category",
    transactionType: "Transaction type",
    expenseIsMoneyOutIncomeIsMoney:
      "Expense is money out; income is money in. Amounts stay unchanged. For mixed directions, select each direction separately to remove transfer status.",
    cleared: "Cleared",
    reopenReconciledPeriodsBeforeChangingClearedStatus:
      "Reopen reconciled periods before changing cleared status.",
    clearedMeansCheckedAgainstYourBankRecords:
      "Cleared means checked against your bank records.",
    keepExistingClearedStatus: "Keep existing cleared status",
    markCleared: "Mark cleared",
    markUncleared: "Mark uncleared",
    changeMerchant: "Change merchant",
    merchantForAllSelectedEntries: "Merchant for all selected entries",
    changeNotes: "Change notes",
    notesForAllSelectedEntries: "Notes for all selected entries",
    reviewTheProposedCategoriesManualChoicesAnd:
      "Review the proposed categories. Manual choices and transfers are preserved.",
    checkingRules: "Checking rules…",
    refreshPreview: "Refresh preview",
    yourSelectionIncludesReconciledTransactionsReopenThose:
      "Your selection includes reconciled transactions. Reopen those statement periods before deleting.",
    deletingTheseEntriesRemovesThemFromYour:
      "Deleting these entries removes them from your spending history and cannot be undone.",
  },
  merchantRulesDrawer: {
    ruleSavedNewUncategorisedTransactionsWillUse:
      "Rule saved. New uncategorised transactions will use your rules.",
    merchantRules: "Merchant rules",
    matchTextInTheMerchantOrDescription:
      "Match text in the merchant or description, ignoring case. Longer patterns win; ties use the oldest rule.",
    textContains: "Text contains",
    forExampleFairpriceGrabOrNetflix:
      "For example: fairprice, grab, or netflix.",
    assignCategory: "Assign category",
    chooseACategory: "Choose a category",
    saveRule: "Save rule",
    addRule: "Add rule",
    cancelEdit: "Cancel edit",
    manualCategoriesAndTransfersArePreservedTo:
      "Manual categories and transfers are preserved. To apply rules to existing entries, select transactions in Spending and choose Apply rules.",
    confirmDelete: "Confirm delete",
    noRulesYet: "No rules yet.",
  },
  mobileTransactionRow: {
    selectTransaction: (description: string, date: string) =>
      `Select ${description} on ${date}`,
    editTransaction: (description: string) => `Edit ${description}`,

    transferLinked: "Transfer · Linked",
    transfer: "Transfer",
    uncategorised: "Uncategorised",
    reconciled: "Reconciled",
    cleared: "Cleared",
    uncleared: "Uncleared",
  },
  spendingView: {
    selectTransaction: (description: string, date: string) =>
      `Select ${description} on ${date}`,
    freshStart: (month: string) => `A fresh start for ${month}.`,
    filters: (n: number) => `Filters${n ? ` · ${n}` : ""}`,
    selected: (n: number) => `${n} selected`,
    matches: (query: string) =>
      `Matches for “${query}” from every month, newest first.`,
    nothingMatches: (query: string) => `Nothing matches “${query}”`,

    description: "Description",
    merchant: "Merchant",
    account: "Account",
    category: "Category",
    transfer: "Transfer",
    yes: "Yes",
    no: "No",
    reconciled: "Reconciled",
    cleared: "Cleared",
    uncleared: "Uncleared",
    spending: "Spending",
    yourMoneyMonthByMonth: "Your money, month by month.",
    addTransaction: "Add transaction",
    reviewTransfers: "Review transfers",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    merchantRules: "Merchant rules",
    rules: "Rules",
    addAnAccountFirst: "Add an account first",
    goToAccounts: "Go to accounts",
    transactionsBelongToABankCardOr:
      "Transactions belong to a bank, card or cash account.",
    monthlySummary: "Monthly summary",
    monthlyOverview: "Monthly overview",
    excludesTransfers: "Excludes transfers",
    yourIncomeAndSpendingWillAppearHere:
      "Your income and spending will appear here.",
    moneyOut: "Money out",
    moneyIn: "Money in",
    whereItWent: "Where it went",
    transactions: "Transactions",
    exportTheseTransactionsAsCSV: "Export these transactions as CSV",
    exportCSV: "Export CSV",
    clearFilters: "Clear filters",
    searchEveryMonth: "Search every month",
    searchTransactions: "Search transactions",
    descriptionMerchantOrNote: "Description, merchant or note",
    filterByAccount: "Filter by account",
    allAccounts: "All accounts",
    filterByCategory: "Filter by category",
    allCategories: "All categories",
    selectedTransactionActions: "Selected transaction actions",
    bulkEdit: "Bulk edit",
    applyRules: "Apply rules",
    deleteSelected: "Delete selected",
    clearSelection: "Clear selection",
    selectUpTo500EntriesAtA:
      "Select up to 500 entries at a time. Select all chooses the first 500 visible entries.",
    noMatchingTransactions: "No matching transactions",
    nothingHereYet: "Nothing here yet",
    theSearchCoversEveryMonthTryA:
      "The search covers every month. Try a shorter word.",
    tryAnotherAccountOrCategory: "Try another account or category.",
    addATransactionToStartYourMonthly:
      "Add a transaction to start your monthly record.",
    selectAllVisibleTransactions: "Select all visible transactions",
    selectAll: "Select all",
    transferLinked: "Transfer · Linked",
    uncategorised: "Uncategorised",
  },
  transactionDrawer: {
    accountCurrencyLabel: (currency: string) => `${currency} (account)`,
    inactiveCurrency: (currency: string) => `${currency} (inactive)`,
    archivedCategory: (name: string) => `${name} (archived)`,

    transactionSaved: "Transaction saved.",
    transactionAdded: "Transaction added.",
    transactionDeleted: "Transaction deleted.",
    editTransaction: "Edit transaction",
    addTransaction: "Add transaction",
    thisEntryIsReconciledYouCanEdit:
      "This entry is reconciled. You can edit its category, merchant, transfer label and notes. Reopen the statement period from its account to change the amount, date or description.",
    transactionType: "Transaction type",
    transfersAreLeftOutOfSpendingTotals:
      "Transfers are left out of spending totals.",
    direction: "Direction",
    moneyOut: "Money out",
    moneyIn: "Money in",
    aPositiveAmountUpToFourDecimals: "A positive amount, up to four decimals",
    accountCurrency: "Account currency",
    account: "Account",
    description: "Description",
    merchant: "Merchant",
    optionalACleanNameShownInsteadOf:
      "Optional. A clean name shown instead of the description.",
    category: "Category",
    uncategorised: "Uncategorised",
    cleared: "Cleared",
    checkedAgainstYourBankRecords: "Checked against your bank records.",
  },
  transactionTypeSelect: {
    transactionType: "Transaction type",
    keepExistingTypes: "Keep existing types",
    expense: "Expense",
    income: "Income",
    transfer: "Transfer",
  },
  transferReview: {
    toLabel: "To",
    suggested: (n: number) =>
      `Suggested matches (${n} ${n === 1 ? "pair" : "pairs"})`,
    unmatched: (n: number) => `Without a match (${n})`,
    linked: (n: number) => `Linked transfers (${n})`,
    excluded: (n: number) => `No counterpart in Finfolio (${n})`,
    fx: (out: string, rate: string, incoming: string) =>
      `Approximate FX: 1 ${out} = ${rate} ${incoming}`,
    suggestionPolicy: (date: string | null) =>
      `Suggestions allow −1 to +5 days, fees up to 1% (capped at 10), and 3% FX variance. FX uses approximate latest rates${date ? ` as of ${date}` : ""}; any FX difference is not an inferred fee.`,

    outgoing: "Outgoing",
    incoming: "Incoming",
    counterpart: "Counterpart",
    chooseAnEntry: "Choose an entry",
    feeAmountOptional: "Fee amount (optional)",
    feeCurrency: "Fee currency",
    useAFeePrintedSeparatelyOrAn:
      "Use a fee printed separately or an implied difference. This records metadata only.",
    linkSelectedEntries: "Link selected entries",
    backToSpending: "Back to spending",
    transfers: "Transfers",
    matchExistingEntriesAcrossYourAccountsFees:
      "Match existing entries across your accounts. Fees here are notes on the link; no transactions are created.",
    noSuggestedMatches: "No suggested matches.",
    from: "From",
    to: "to",
    impliedFee: "Implied fee:",
    chooseAnotherFee: "Choose another / fee",
    notAPair: "Not a pair",
    noTransfersWithoutAMatch: "No transfers without a match.",
    noSuggestedCounterpartYetImportTheOther:
      "No suggested counterpart yet. Import the other statement or choose an existing entry.",
    noCounterpartInFinfolio: "No counterpart in Finfolio",
    fee: "Fee:",
    unlink: "Unlink",
    reviewAgain: "Review again",
  },
};
export default spending;
