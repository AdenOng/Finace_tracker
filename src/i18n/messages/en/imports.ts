const imports = {
  importReview: {
    bankStatement: "Bank statement",
    cardStatement: "Card statement",
    brokerageStatement: "Brokerage statement",
    tradeConfirmation: "Trade confirmation",
    screenshot: "Screenshot",
    document: "Document",
    buy: "Buy",
    sell: "Sell",
    dividend: "Dividend",
    interest: "Interest",
    fee: "Fee",
    tax: "Tax",
    deposit: "Deposit",
    withdrawal: "Withdrawal",
    transferIn: "Transfer in",
    transferOut: "Transfer out",
    split: "Split",
    fx: "FX",
    other: "Other",
    originalAccountRestoredItsImports:
      "Original account restored. Its imports and saved records remain attached.",
    imports: "Imports",
    theAccountWasRemoved: "The account was removed",
    thisImportBelongsToThe: "This import belongs to the archived account",
    itsSavedRecordsAreStill:
      ". Its saved records are still there. Adding this broker again creates a separate account; it does not move older imports.",
    restoreTheOriginalAccountTo:
      "Restore the original account to manage these rows and include its holdings in your totals again.",
    restoreOriginalAccount: "Restore original account",
    viewOriginalAccount: "View original account",
    theOriginalAccountWasDeleted:
      "The original account was deleted. This upload is kept for reference. Adding the broker again creates a separate account and does not transfer this import or restore deleted records.",
    useTheTrashButtonBeside:
      "Use the trash button beside a saved row to review its removal. The original upload and extracted rows stay available.",
    seeThemInSpending: "See them in Spending",
    openTheAccount: "Open the account",
    readingYourStatement: "Reading your statement",
    everyLineIsBeingRead:
      "Every line is being read and sorted. A few pages usually take under a minute; you can leave this page and come back.",
    thisOneCouldntBeRead: "This one couldn't be read",
    readingNeverStartedProbablyBecause:
      "Reading never started, probably because the server restarted.",
    readingStoppedPartwayProbablyBecause:
      "Reading stopped part-way, probably because the server restarted.",
    somethingWentWrongReadingThe: "Something went wrong reading the file.",
    tryAgain: "Try again",
    removeUpload: "Remove upload",
    compareTheRowsWithYour:
      "Compare the rows with your statement. Correct the difference or confirm you have checked it.",
    iveCheckedThisSaveAnyway: "I've checked this — save anyway",
    theHoldingsFromThisImport:
      "The holdings from this import have been adjusted in the account. The rows below show the original extraction.",
    viewAdjustedHoldings: "View adjusted holdings",
    theHoldingsOrBalanceEntry:
      "The holdings or balance entry from this import has been removed or replaced. The upload and any imported trades remain saved.",
    viewAccount: "View account",
    chooseTheStatementDateBefore:
      "Choose the statement date before saving. Enter the date these holdings, balances or trades belong to in “As of” below.",
    asOf: "As of",
    discard: "Discard",
    rowRemovedFromTheAccount:
      "Row removed from the account. The original extraction is retained below.",
    period: "Period",
    notShown: "Not shown",
    opening: "Opening",
    closing: "Closing",
    provisionalDecidePossibleDuplicates:
      "Provisional — decide possible duplicates",
    extractionBalances: "Extraction balances",
    savedRecordsWillBalance: "Saved records will balance",
    skippedRowsExplainTheDifference: "Skipped rows explain the difference",
    skippedRowsNotBeingSaved: "Skipped rows not being saved",
    savedWithAnAcknowledgedBalance:
      "Saved with an acknowledged balance mismatch",
    removed: "Removed",
    excluded: "Excluded",
    reviewRemoval: "Review removal",
    restoreTheOriginalAccountToText:
      "Restore the original account to manage this row",
    all: "All",
    none: "None",
    alreadyRecorded: "Already recorded",
    similarOneRecorded: "Similar one recorded",
    needsDecision: "Needs decision",
    keep: "Keep",
    skip: "Skip",
    noTransactionsWereFound: "No transactions were found.",
    transfer: "Transfer",
    checkAmountdirection: "Check amount/direction",
    confirmCurrentAmount: "Confirm current amount",
    editAmount: "Edit amount",
    negativeDebtoverdraftPositiveCashcredit:
      "Negative = debt/overdraft; positive = cash/credit",
    negativeMoneyOutPositiveMoney: "Negative = money out; positive = money in",
    flipDirection: "Flip direction",
    cancel: "Cancel",
    applyAmount: "Apply amount",
    category: "Category",
    uncategorised: "Uncategorised",
    closingBalance: "Closing balance",
    savedAsTheAccountsBalance:
      "Saved as the account's balance, so your net worth matches the statement.",
    saveTheClosingBalance: "Save the closing balance",
    savedTogetherAsWhatThe:
      "Saved together as what the account held on the date below. A later statement replaces it.",
    noHoldingsOrCashWere: "No holdings or cash were found.",
    noPrice: "No price",
    buysSellsDividendsFeesAnd:
      "Buys, sells, dividends, fees and deposits listed on the statement.",
    saved: (counts: {
      transactions: number;
      holdings: number;
      activity: number;
      balances: number;
      duplicates: number;
    }) =>
      `Saved ${[counts.transactions && `${counts.transactions} transactions`, counts.holdings && `${counts.holdings} holdings`, counts.activity && `${counts.activity} trades and payments`, counts.balances && "the balance"].filter(Boolean).join(", ") || "nothing"}.${counts.duplicates ? ` ${counts.duplicates} already recorded were left out.` : ""}`,
    duplicates: (n: number) =>
      `${n} possible ${n === 1 ? "duplicate needs" : "duplicates need"} a decision. Choose Keep or Skip on each highlighted row before saving.`,
    historical: (
      completed: boolean,
      date: string,
      banking: boolean,
      latest: string,
    ) =>
      `${completed ? "Saved" : "This statement will be saved"} for ${date}. Your account has a newer ${banking ? "balance" : "holdings entry"} dated ${latest}. The newer entry remains the current account value.`,
    replaceDate: (date: string) =>
      `Saving replaces the statement holdings or balance already saved for ${date}. The selected rows become the complete entry for that date; existing transactions and trades stay saved.`,
    selected: (accepted: number, total: number, undecided: number) =>
      `${accepted} of ${total} selected${undecided > 0 ? ` · ${undecided} undecided` : ""}`,
    warnings: (n: number) =>
      ` · ${n} amount/direction warnings (saving allowed)`,
    saveTo: (n: number, name: string | null) => `Save ${n} to ${name}`,
    remove: (label: string) => `Remove ${label.replace(/^Save /, "")}`,
    transactions: (n: number) => `Transactions · ${n}`,
    totals: (incoming: string, outgoing: string) =>
      `Selected: ${incoming} in, ${outgoing} out. Uncheck anything you don't want saved.`,
    saveRow: (label: string) => `Save ${label}`,
    reference: (value: string) => ` · Ref ${value}`,
    editAmountFor: (label: string) => `Edit amount for ${label}`,
    amountFor: (label: string) => `Amount for ${label}`,
    balanceLabel: (currency: string, bucket: string | null) =>
      `${currency} ${bucket ?? "closing/cash"} balance`,
    activityLabel: (type: string, symbol: string | null) =>
      `${type.toLowerCase()} ${symbol ?? "activity"}`,
    saveBucket: (bucket: string) => `Save the ${bucket} balance`,
    holdings: (n: number) => `Holdings · ${n}`,
    saveSymbol: (symbol: string) => `Save ${symbol}`,
    saveCash: (currency: string) => `Save ${currency} cash`,
    activity: (n: number) => `Trades and payments · ${n}`,
    saveActivity: (type: string, symbol: string | null) =>
      `Save ${type.toLowerCase()} ${symbol ?? ""}`,
    ref: (value: string) => `Ref ${value}`,
    cash: (currency: string) => `Cash · ${currency}`,
    printed: (direction: string, amount: string) =>
      `Statement shows ${direction}${amount}.`,
    useAmount: (amount: string) => `Use ${amount}`,
    recordBefore: "Record",
    recordAfter: (bucket: string | null, date: string) =>
      `as the ${bucket ? `${bucket} ` : ""}balance on ${date}`,
    statementDate: "the statement date",
  },
  importStatus: {
    waiting: "Waiting",
    reading: "Reading",
    readyToReview: "Ready to review",
    imported: "Imported",
    couldntRead: "Couldn't read",
    cancelled: "Cancelled",
    interrupted: "Interrupted",
  },
  importsView: {
    thatFileIsLargerThan: "That file is larger than 20 MB.",
    useAPdfPngJpeg: "Use a PDF, PNG, JPEG or WebP file.",
    theUploadFailedTryAgain: "The upload failed. Try again.",
    theUploadFailedCheckYour: "The upload failed. Check your connection.",
    whichAccountIsIt: "1 · Which account is it for?",
    addAnAccountFirstSo:
      "Add an account first, so the statement has somewhere to go.",
    addOne: "Add one",
    dropTheStatement: "2 · Drop the statement",
    uploading: "Uploading…",
    pickAnAccountFirst: "Pick an account first",
    thenDropAPdfOr: "Then drop a PDF or screenshot here.",
    chooseFile: "Choose file",
    pdfPngJpegWebpUp: "PDF · PNG · JPEG · WEBP — UP TO 20 MB",
    uploadingSendsStatementTextOr:
      "Uploading sends statement text or images to this instance's configured AI provider, including its fallback if needed. Only upload documents you agree to share with those providers.",
    openIt: "Open it",
    recentImports: "Recent imports",
    openOneToCheckWhat: "Open one to check what was read before it's saved.",
    nothingUploadedYet: "Nothing uploaded yet.",
    removedAccount: "Removed account",
    reads: {
      investments:
        "Holdings, cash and trades from a brokerage statement or app screenshot.",
      banking:
        "Every transaction and the closing balance from a bank or card statement.",
      cpf_srs:
        "SRS holdings, cash and top-ups, or your CPF balance. Split CPF into its accounts by hand afterwards.",
    },
    statementFor: (name: string) => `Statement for ${name}`,
    selected: (accepted: number, total: number) =>
      `${accepted} of ${total} selected`,
  },
  lineRemoval: {
    removeImportedRow: "Remove imported row",
    reviewTheSavedRecordBefore: "Review the saved record before removing it.",
    cancel: "Cancel",
    removeRow: "Remove row",
    checkingTheSavedRow: "Checking the saved row…",
    theOriginalUploadAndExtraction:
      "The original upload and extraction stay available, with this row marked Removed. Other imported rows stay saved. This removal cannot be undone here; you can add a corrected entry manually.",
    openAccountAndEntryHistory: "Open account and Entry history",
  },
  page: {
    imports: "Imports",
    uploadABankCardOr:
      "Upload a bank, card or brokerage statement, or a screenshot. It's read for you, and nothing is saved until you've checked it.",
  },
  reviewPage: {
    reviewImport: "Review import",
  },
  summary: {
    unverified: (complete: boolean) =>
      `Unverified — no opening/closing balance to check against${complete ? " for a complete statement" : ""}.`,
    excluded: (n: number, currency: string) =>
      `${n} ${n === 1 ? "line" : "lines"} in ${currency} not included — no opening/closing balances.`,
    balanceCheck: (currency: string) => `Balance check · ${currency}`,
    result: (
      label: string,
      matches: boolean | null,
      amount: string,
      over: boolean,
    ) =>
      `${label}: ${matches ? "matches" : `${amount} ${over ? "over" : "short of"} closing`}.`,
    skipped: (explains: boolean, amount: string) =>
      `${explains ? "Skipped rows explain the difference" : "Skipped rows not being saved"}: ${amount}. Already recorded rows are included.`,
    readBy: (model: string) => `READ BY ${model}`,
  },
};
export default imports;
