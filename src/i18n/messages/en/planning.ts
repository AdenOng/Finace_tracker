import { message } from "../../template";
const planning = {
  meta: { title: "Cash flow" },
  cardBills: {
    paidOff: "Paid off",
    unpaid: "Unpaid",
    partiallyPaid: "Partially paid",
    overdue: "Overdue",
    creditcardBills: "Credit-card bills",
    trackStatementBillsSeparatelyFromYourCurrentCard:
      "Track statement bills separately from your current card balance. Linking a bank records your payment source; it does not set up a direct debit.",
    addACreditcardAccountUnderAccountsToTrack:
      "Add a credit-card account under Accounts to track its bills.",
    archived: " · Archived",
    addStatementBill: "Add statement bill",
    notLinked: "Not linked",
    noStatementBillRecordedPaymentStatusIsUnknown:
      "No statement bill recorded. Payment status is unknown until you enter the closing date, amount due and due date.",
    paidLate: " · Paid late",
    unavailableBank: "Unavailable bank",
    bill: "Bill",
    payments: "Payments",
    remaining: "Remaining",
    latestStatementArchivedAccountsAreExcludedFromForecasts:
      "Latest statement: archived accounts are excluded from forecasts.",
    latestStatementPaidOffWithNoRemainingAmount:
      "Latest statement: paid off, with no remaining amount to reserve.",
    latestStatementDueBeyondTheSelectedForecastPeriod:
      "Latest statement: due beyond the selected forecast period.",
    latestStatementItsRemainingBalanceIsIncludedIn:
      "Latest statement: its remaining balance is included in the payment bank's forecast.",
    earlierStatementExcludedFromTheForecastBecauseA:
      "Earlier statement: excluded from the forecast because a later statement includes carried debt.",
    confirmedPaymentsAfterThisStatement:
      "Confirmed payments after this statement",
    noConfirmedBanktocardPaymentsFound:
      "No confirmed bank-to-card payments found.",
    confirmRemoveBill: "Confirm remove bill",
    removeBill: "Remove bill",
    transactionsAndTransfersStay: "Transactions and transfers stay.",
    importOrRecordBothTheBankDebitAnd:
      "Import or record both the bank debit and card payment credit, mark them as transfers, then confirm their match in",
    transfers: "Transfers",
    onlyConfirmedTransfersFromTheBillsPaymentBank:
      ". Only confirmed transfers from the bill's payment bank count; refunds do not. Removing a transfer match updates the bill's status.",
    enterTheFullStatementBalanceIncludingAnyCarried:
      "Enter the full statement balance, including any carried balance. This tracks a bill without changing your ledger or saved account balance.",
    statementClosingDate: "Statement closing date",
    paymentDueDate: "Payment due date",
    saveStatementBill: "Save statement bill",
    loadingCardBills: "Loading card bills…",
    paymentBank: message<[name: string]>("Payment bank: {0}"),
    archivedSuffix: " (archived)",
    bankFor: message<[name: string]>("Payment bank for {0}"),
    chooseBank: message<[currency: string]>(
      "Choose an account in {0}. Existing bills keep their original payment bank.",
    ),
    billTitle: message<[name: string]>("Statement bill · {0}"),
    fullAmount: message<[currency: string]>("Full amount due ({0})"),
    closed: message<[date: string]>("Statement closed {0}"),
    dueFrom: message<[date: string, bank: string]>("Due {0} · Pay from {1}"),
    paidOn: message<[date: string]>("Paid off on {0}."),
  },
  cashFlowView: {
    dailyProjectedAccountBalanceExactDailyBalancesAre:
      "Daily projected account balance. Exact daily balances are listed below.",
    zeroLine: "Zero",
    chartDescription: message<
      [from: string, to: string, start: string, end: string]
    >(
      "Projected balance from {0} ({2}) to {1} ({3}). Use Left and Right arrow keys to inspect daily points.",
    ),
    loadingCashFlow: "Loading cash flow…",
    cashFlow: "Cash flow",
    planRecurringIncomeBillsAndCreditcardPaymentsWithout:
      "Plan recurring income, bills and credit-card payments without creating transactions.",
    addRecurringItem: "Add recurring item",
    cashflowForecast: "Cash-flow forecast",
    recordedClosingBalancePlusLaterPostedTransactionsThen:
      "Recorded closing balance plus later posted transactions, then outstanding plans. Each account stays in its own currency.",
    account: "Account",
    noBankOrCashAccounts: "No bank or cash accounts",
    forecastPeriod: "Forecast period",
    "30Days": "30 days",
    "60Days": "60 days",
    "90Days": "90 days",
    estimatedToday: "Estimated today",
    endOfForecast: "End of forecast",
    lowestProjectedBalance: "Lowest projected balance",
    thisAccountIsProjectedToGoBelowZero:
      "This account is projected to go below zero. Check your upcoming bills and transfers.",
    dailyProjectedBalances: "Daily projected balances",
    thisBalanceIsStaleUpdateItForA:
      "This balance is stale; update it for a more reliable forecast.",
    outstandingPlannedCashFlows: "Outstanding planned cash flows",
    overdueReservedToday: " · Overdue, reserved today",
    noOutstandingPlannedCashFlowsInThisPeriod:
      "No outstanding planned cash flows in this period.",
    addABankOrCashAccountUnderAccounts:
      "Add a bank or cash account under Accounts to start forecasting.",
    estimatesIncludeOnlyEnteredPlansAndStatementsOverdue:
      "Estimates include only entered plans and statements. Overdue recurring items from the past 90 days are reserved today; older occurrences are outside this review window. Confirm imported payments below to remove their planned amounts. Card bills use only the latest statement, including carried debt.",
    recurringItems: "Recurring items",
    positiveAmountsAreIncomeNegativeAmountsAreBills:
      "Positive amounts are income; negative amounts are bills. Pause an item to stop forecasting it. To change its amount or cadence, pause it and add a replacement.",
    addSalaryRentSubscriptionsOrAnotherRegularCash:
      "Add salary, rent, subscriptions or another regular cash flow.",
    paused: "Paused",
    pause: "Pause",
    resume: "Resume",
    confirmRemovePlan: "Confirm remove plan",
    matchRecordedPayments: "Match recorded payments",
    suggestionsMatchTheAccountCurrencyAndSignedAmount:
      "Suggestions match the account, currency and signed amount within seven days of the due date. Review the description before confirming; no transaction is created.",
    hideReviewed: "Hide reviewed",
    showReviewed: "Show reviewed",
    noOccurrencesToReviewInThisPeriod:
      "No occurrences to review in this period.",
    skipped: " · Skipped",
    overdue: " · Overdue",
    expected: " · Expected",
    theMatchedTransactionChangedThisAmountIsForecast:
      "The matched transaction changed. This amount is forecast again; review or clear the old match.",
    clearDecision: "Clear decision",
    skipThisOccurrence: "Skip this occurrence",
    useABankOrCashAccountCardBills:
      "Use a bank or cash account. Card bills are tracked separately so purchases and their later payment are not forecast twice.",
    salaryRentSubscriptions: "Salary, rent, subscriptions…",
    direction: "Direction",
    moneyOut: "Money out",
    moneyIn: "Money in",
    amountInAccountCurrency: "Amount in account currency",
    aPositiveAmountUpToFourDecimals:
      "A positive amount, up to four decimals. The direction sets whether it is a bill or income.",
    repeat: "Repeat",
    weekly: "Weekly",
    monthly: "Monthly",
    yearly: "Yearly",
    firstDueDate: "First due date",
    chooseTheFirstOccurrenceYouWantToTrack:
      "Choose the first occurrence you want to track. Monthly dates stay anchored to this day, with shorter months using their last day.",
    lastDueDateOptional: "Last due date (optional)",
    recordBalance: message<[currency: string, name: string]>(
      "Record a balance in {0} for {1} under Accounts to calculate projected balances. Planned payments are still listed below.",
    ),
    startingBalance: message<[date: string]>(
      "Starting statement balance: {0}.",
    ),
    frequencies: { weekly: "weekly", monthly: "monthly", yearly: "yearly" },
    scheduleDates: message<
      [frequency: string, start: string, end: string | null]
    >(["text", 0, " from ", 1, ["if", 2, ["text", " until ", 2], ""]]),
    matched: message<[description: string, date: string]>(
      " · Matched to {0} ({1})",
    ),
    matchPayment:
      message<[description: string, date: string]>("Match {0} · {1}"),
  },
};
export default planning;
