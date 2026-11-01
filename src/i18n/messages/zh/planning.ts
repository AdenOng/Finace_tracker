import type en from "../en/planning";
import type { Translation } from "../../types";
const planning: Translation<typeof en> = {
  meta: { title: "现金流" },
  cardBills: {
    paidOff: "已还清",
    unpaid: "未还款",
    partiallyPaid: "部分还款",
    overdue: "已逾期",
    creditcardBills: "信用卡账单",
    trackStatementBillsSeparatelyFromYourCurrentCard:
      "单独跟踪账单，与当前信用卡余额分开。关联银行账户仅记录还款来源，不会启用自动扣款。",
    addACreditcardAccountUnderAccountsToTrack:
      "在“账户”中添加信用卡账户，即可跟踪账单。",
    archived: " · 已归档",
    addStatementBill: "添加账单",
    notLinked: "未关联",
    noStatementBillRecordedPaymentStatusIsUnknown:
      "尚未记录账单。输入账单日、应还金额及到期还款日后，才能确定还款状态。",
    paidLate: " · 逾期还款",
    unavailableBank: "银行账户不可用",
    bill: "账单",
    payments: "已还金额",
    remaining: "待还金额",
    latestStatementArchivedAccountsAreExcludedFromForecasts:
      "最新账单：已归档账户不计入预测。",
    latestStatementPaidOffWithNoRemainingAmount:
      "最新账单：已还清，无需预留还款金额。",
    latestStatementDueBeyondTheSelectedForecastPeriod:
      "最新账单：到期还款日在所选预测时段之外。",
    latestStatementItsRemainingBalanceIsIncludedIn:
      "最新账单：待还金额已计入还款银行账户的预测。",
    earlierStatementExcludedFromTheForecastBecauseA:
      "往期账单：后续账单已包含未还金额，因此不再计入预测。",
    confirmedPaymentsAfterThisStatement: "本账单之后已确认的还款",
    noConfirmedBanktocardPaymentsFound: "未找到已确认的银行账户至信用卡还款。",
    confirmRemoveBill: "确认移除账单",
    removeBill: "移除账单",
    transactionsAndTransfersStay: "交易和转账记录会保留。",
    importOrRecordBothTheBankDebitAnd:
      "导入或记录银行扣款及信用卡还款入账，将两笔记录标记为转账，然后在此确认配对：",
    transfers: "转账",
    onlyConfirmedTransfersFromTheBillsPaymentBank:
      "。仅计入来自账单所关联还款银行账户的已确认转账，退款不计入。移除转账配对后，账单状态也会更新。",
    enterTheFullStatementBalanceIncludingAnyCarried:
      "输入完整账单余额，包括上期未还金额。跟踪账单不会更改交易明细或已保存的账户余额。",
    statementClosingDate: "账单日",
    paymentDueDate: "到期还款日",
    saveStatementBill: "保存账单",
    loadingCardBills: "加载信用卡账单中…",
    paymentBank: (name: string) => `还款银行账户：${name}`,
    archivedSuffix: "（已归档）",
    bankFor: (name: string) => `${name} 的还款银行账户`,
    chooseBank: (currency: string) =>
      `选择 ${currency} 账户。现有账单保留原还款银行账户。`,
    billTitle: (name: string) => `账单 · ${name}`,
    fullAmount: (currency: string) => `全部应还金额（${currency}）`,
    closed: (date: string) => `账单日 ${date}`,
    dueFrom: (date: string, bank: string) =>
      `到期还款日 ${date} · 还款账户 ${bank}`,
    paidOn: (date: string) => `已于 ${date} 还清。`,
  },
  cashFlowView: {
    dailyProjectedAccountBalanceExactDailyBalancesAre:
      "每日预计账户余额。下方列有每日的具体余额。",
    loadingCashFlow: "加载现金流中…",
    cashFlow: "现金流",
    planRecurringIncomeBillsAndCreditcardPaymentsWithout:
      "规划周期性收入、账单及信用卡还款，无需创建交易。",
    addRecurringItem: "添加周期性收支",
    cashflowForecast: "现金流预测",
    recordedClosingBalancePlusLaterPostedTransactionsThen:
      "从已记录的期末余额出发，计入之后的已入账交易及待执行计划。各账户保留原币种。",
    account: "账户",
    noBankOrCashAccounts: "暂无银行或现金账户",
    forecastPeriod: "预测时段",
    "30Days": "30 天",
    "60Days": "60 天",
    "90Days": "90 天",
    estimatedToday: "今日估算",
    endOfForecast: "预测期末",
    lowestProjectedBalance: "最低预计余额",
    thisAccountIsProjectedToGoBelowZero:
      "预计此账户余额将低于零。请检查即将到期的账单和转账。",
    dailyProjectedBalances: "每日预计余额",
    thisBalanceIsStaleUpdateItForA: "余额待更新，请更新后获取更可靠的预测。",
    outstandingPlannedCashFlows: "待执行的计划收支",
    overdueReservedToday: " · 已逾期，今日预留",
    noOutstandingPlannedCashFlowsInThisPeriod: "此时段内没有待执行的计划收支。",
    addABankOrCashAccountUnderAccounts:
      "在“账户”中添加银行或现金账户，即可开始预测。",
    estimatesIncludeOnlyEnteredPlansAndStatementsOverdue:
      "估算仅包含已输入的计划和账单。过去 90 天内逾期的周期性收支会在今日预留；更早的收支不在核对范围内。在下方确认已导入的付款后，对应计划金额将移除。信用卡账单仅采用最新一期，包含上期未还金额。",
    recurringItems: "周期性收支",
    positiveAmountsAreIncomeNegativeAmountsAreBills:
      "正数为收入，负数为账单支出。暂停后不再计入预测。如需更改金额或频率，请暂停原计划并添加新计划。",
    addSalaryRentSubscriptionsOrAnotherRegularCash:
      "添加工资、租金、订阅或其他固定收支。",
    paused: "已暂停",
    pause: "暂停",
    resume: "恢复",
    confirmRemovePlan: "确认移除计划",
    matchRecordedPayments: "配对已记录的付款",
    suggestionsMatchTheAccountCurrencyAndSignedAmount:
      "建议配对到期日前后七天内账户、币种及正负金额一致的交易。确认前请核对摘要，此操作不会创建交易。",
    hideReviewed: "隐藏已核对",
    showReviewed: "显示已核对",
    noOccurrencesToReviewInThisPeriod: "此时段内没有待核对的本期收支。",
    skipped: " · 已跳过",
    overdue: " · 已逾期",
    expected: " · 预计发生",
    theMatchedTransactionChangedThisAmountIsForecast:
      "已配对的交易发生变化，此金额已重新计入预测。请核对或清除原配对。",
    clearDecision: "清除核对结果",
    skipThisOccurrence: "跳过本期收支",
    useABankOrCashAccountCardBills:
      "请选择银行或现金账户。信用卡账单单独跟踪，避免消费及之后的还款被重复计入预测。",
    salaryRentSubscriptions: "工资、租金、订阅…",
    direction: "资金方向",
    moneyOut: "资金转出",
    moneyIn: "资金转入",
    amountInAccountCurrency: "账户币种金额",
    aPositiveAmountUpToFourDecimals:
      "填写正数，最多四位小数。资金方向决定这是账单还是收入。",
    repeat: "重复频率",
    weekly: "每周",
    monthly: "每月",
    yearly: "每年",
    firstDueDate: "首次到期日",
    chooseTheFirstOccurrenceYouWantToTrack:
      "选择开始跟踪的首次到期日。每月按此日期重复，天数不足的月份使用月末日期。",
    lastDueDateOptional: "最后到期日（选填）",
    recordBalance: (currency: string, name: string) =>
      `请在“账户”中为 ${name} 记录 ${currency} 余额，以计算预计余额。计划付款仍列于下方。`,
    startingBalance: (date: string) => `起始对账单余额：${date}。`,
    frequencies: { weekly: "每周", monthly: "每月", yearly: "每年" },
    scheduleDates: (frequency: string, start: string, end: string | null) =>
      `${frequency}，从 ${start} 起${end ? `，至 ${end}` : ""}`,
    matched: (description: string, date: string) =>
      ` · 已配对 ${description}（${date}）`,
    matchPayment: (description: string, date: string) =>
      `配对 ${description} · ${date}`,
  },
};
export default planning;
