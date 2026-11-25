import { message } from "../../template";
import type en from "../en/accounts";
import type { Translation } from "../../types";

const accounts: Translation<typeof en> = {
  detail: {
    accounts: "账户",
    readOnly: "只读",
    restore: "恢复",
    importStatement: "导入对账单",
    updateHoldings: "更新持仓",
    updateBalance: "更新余额",
    thisAccountIsArchivedItIsLeftOutOfYour:
      "此账户已归档，不计入净资产。恢复后才能添加记录。",
    value: "市值",
    balance: "余额",
    enteredByTheOwner: "，由所有者录入",
    enteredByYou: "，由你录入",
    nothingHeld: "暂无持仓",
    nothingRecordedYet: "暂无记录",
    recordHoldings: "记录持仓",
    recordBalance: "记录余额",
    enterWhatThisAccountHoldsAndItsCashToInclude:
      "录入此账户的持仓和现金，将其计入净资产。",
    enterTheCurrentBalanceToIncludeThisAccountInYour:
      "录入当前余额，将此账户计入净资产。",
    byAccount: "按子账户",
    notSplit: "未拆分",
    holdings: "持仓",
    onlyCashIsHeld: "仅持有现金。",
    holding: "持仓",
    quantity: "数量",
    price: "价格",
    averageCost: "平均成本",
    weight: "占比",
    noPrice: "暂无价格",
    cash: "现金",
    sharedBy: message<[name: string]>(
      "由 {0} 共享。所有者可在个人视图中编辑财务数据。",
    ),
    unpriced: message<[n: number]>("{0} 项持仓暂无价格，未计入总额。"),
    period: "。",
  },
  drawer: {
    removeExplanation:
      "有财务记录的账户将被归档，可从“账户 → 已归档”中恢复。空账户将被永久删除。",
    confirmRemove: "确认移除",
    brokersAndRoboAdvisers: "券商与智能投顾",
    cryptoExchanges: "加密货币交易所",
    depository: "证券存管机构",
    banks: "银行",
    cardIssuers: "发卡机构",
    government: "政府机构",
    sharesETFsFundsAndTheCashWaitingToBeInvested:
      "股票、ETF、基金及待投资现金。",
    cPFInvestmentSchemeOrAnOverseasRetirementAccountThatInvests:
      "公积金投资计划或可投资的海外退休账户。",
    coinsOnAnExchangeOrInYourOwnWallet: "交易所或个人钱包中的加密货币。",
    savingsAndMultiplierAccountsThatPayInterest: "可赚取利息的储蓄及高息账户。",
    theAccountYourSalaryLandsInAndBillsLeaveFrom:
      "用于收取工资和支付账单的账户。",
    recordWhatYouOweAsANegativeBalance: "将欠款记录为负余额。",
    physicalCashYouWantCounted: "你希望计入的实物现金。",
    anythingElseWithABalance: "其他有余额的账户。",
    yourOrdinarySpecialMediSaveAndRetirementBalances:
      "普通、特别、保健储蓄和退休账户的余额。",
    yourSRSCashAndWhateverItHasBought: "SRS 现金及其投资持仓。",
    addAnInvestmentAccount: "添加投资账户",
    valuedFromWhatItHoldsYouLlListTheShares:
      "根据持仓估值。接下来录入股票、基金份额、加密货币及现金。",
    iBKRMoomooEndowusSyfeCoinhako: "IBKR, moomoo, Endowus, Syfe, Coinhako",
    brokerOrPlatform: "券商或平台",
    nextYouLlEnterItsHoldings: "接下来录入持仓。",
    addAndEnterHoldings: "添加并录入持仓",
    addABankAccountOrCard: "添加银行账户或信用卡",
    carriesABalanceAndYourSpendingYouLlRecordThe:
      "用于记录余额和支出。先录入余额，再添加交易。",
    dBSOCBCUOBTrustAmex: "DBS, OCBC, UOB, Trust, Amex",
    bankOrCardIssuer: "银行或发卡机构",
    nextYouLlRecordItsBalance: "接下来录入余额。",
    addAndRecordBalance: "添加并记录余额",
    addCPFOrSRS: "添加 CPF 或 SRS",
    moneySetAsideForRetirementKeptApartFromYourOther:
      "为退休预留的资金，暂不可支用，与其他账户分开显示。",
    cPFDBSSRSOCBCSRSEndowusSRS: "CPF, DBS SRS, OCBC SRS, Endowus SRS",
    heldWith: "托管机构",
    nextYouLlRecordItsBalances: "接下来录入各项余额。",
    addAndRecordBalances: "添加并记录余额",
    addAccount: "添加账户",
    whatKindOfAccountIsItEachIsTrackedDifferently:
      "这是什么类型的账户？不同类型的记账方式各有不同。",
    typeCanOnlyChangeBeforeBalancesTransactionsOrReconciliationsAre:
      "录入余额、交易或对账记录后，无法更改类型。",
    notListed: "未列出",
    howItShowsInYourLists: "在列表中显示的名称。",
    eGIBKRPro: "例如 IBKR Pro",
    eGDBSMultiplier: "例如 DBS Multiplier",
    lastFourDigits: "尾号",
    optional: "选填",
    saved: message<[name: string]>("已保存 {0}。"),
    added: message<[name: string]>("已添加 {0}。"),
    removed: message<[name: string]>("已移除 {0}。"),
    archived: message<[name: string]>(
      "{0} 有余额或交易，已归档。可从已归档列表恢复。",
    ),
  },
  reconciliation: {
    reconciliation: "对账",
    verifyStatementBalancesAndProtectTheEntriesYouHaveChecked:
      "核对对账单余额，保护已核对的记录。",
    reconcileStatement: "对账单对账",
    loadingStatementPeriods: "正在加载对账单周期…",
    noReconciledStatementsYetEnterAStatementSOpeningAnd:
      "暂无已对账的对账单。输入期初和期末余额，再逐笔核对交易。",
    period: "周期",
    closingBalance: "期末余额",
    actions: "操作",
    statementReopenedItsEntriesCanBeChangedAndReconciledAgain:
      "已重新开放对账单，可修改记录并重新对账。",
    confirmReopen: "确认重新开放",
    reopen: "重新开放",
    statementReconciledItsTransactionsAreClearedAndProtected:
      "对账完成，交易已核实并受保护。",
    openingBalanceAllSignedTransactionsClosingBalanceTransfersAreIncluded:
      "期初余额 + 全部带正负号的交易金额 = 期末余额，包含转账。请按币种分别对账。",
    finishReconciliation: "完成对账",
    statementStart: "周期开始日期",
    statementEnd: "周期结束日期",
    statementCurrency: "对账单币种",
    openingBalance: "期初余额",
    useTheBalanceBeforeTheFirstDayAndAfterThe:
      "使用首日之前和末日之后的余额。信用卡欠款为负数。此核对不会更新投资组合的余额快照。",
    reviewTransactions: "核对交易",
    thisPeriodOverlapsAReconciledStatementReopenItBeforeContinuing:
      "此周期与已对账的对账单重叠。请先重新开放该对账单。",
    expectedClosingBalance: "预期期末余额",
    difference: "差额",
    uncheckAll: "取消全选",
    verifyAllEntries: "核对全部记录",
    verified: "已核对",
    dateDescription: "日期／摘要",
    noEntriesInThisPeriodAndCurrencyOnlyFinishIf:
      "此周期和币种下暂无记录。请确认余额未变且与对账单一致后再完成对账。",
    mismatch: message<[difference: string, currency: string]>(
      "余额不符。请检查遗漏或重复的交易、金额及对账单日期。在支出中更正记录后重新核对。准确差额：{0} {1}。",
    ),
    verifiedCount: message<[verified: number, total: number]>(
      "已对照对账单核对 {0} 条，共 {1} 条。",
    ),
    verify: message<[description: string, date: string]>("核对 {1} 的{0}"),
  },
  transactions: {
    transactions: "交易",
    whatCameInAndWentOutTransfersBetweenYourOwn:
      "查看收支明细。本人账户互转会显示，但不计入收支。",
    addTransaction: "添加交易",
    previousMonth: "上个月",
    nextMonth: "下个月",
    in: "收入",
    out: "支出",
    transfer: "转账",
    notCategorised: "未分类",
    openInSpending: "在支出中查看",
    empty: message<[month: string]>("{0} 暂无记录。"),
  },
  view: {
    investments: "投资",
    brokerageRetirementAndCryptoAccountsValuedFromTheirHoldings:
      "证券、退休及加密货币账户，根据持仓估值。",
    addABrokerageRoboAdviserOrCryptoAccountAndList:
      "添加证券、智能投顾或加密货币账户，并录入持仓。",
    addInvestmentAccount: "添加投资账户",
    broker: "券商",
    value: "市值",
    bankCards: "银行与信用卡",
    savingsCurrentAndCreditCardAccountsTheirTransactionsFeedSpending:
      "储蓄、往来及信用卡账户，交易会计入支出。",
    addABankAccountOrCreditCardRecordItsBalance:
      "添加银行账户或信用卡，录入余额后再添加交易。",
    addBankOrCard: "添加银行账户或信用卡",
    bank: "银行",
    balance: "余额",
    cPFSRS: "CPF 与 SRS",
    retirementMoneyYouCanTSpendYetShownApartOn:
      "暂不可支用的退休资金，在总览中单独显示。",
    addYourCPFBalancesOrAnSRSAccountWithYour:
      "添加公积金余额，或银行及平台的 SRS 账户。",
    addCPFOrSRS: "添加 CPF 或 SRS",
    heldWith: "托管机构",
    filterAccounts: "筛选账户",
    open: "使用中",
    archived: "已归档",
    addAccount: "添加账户",
    consolidatedView: "合并视图",
    accountsYouRemoveThatStillHaveHistoryEndUpHere:
      "移除后仍有历史记录的账户会归档到此处。",
    account: "账户",
    asOf: "截至日期",
    actions: "操作",
    notRecorded: "未记录",
    restore: "恢复",
    unpriced: message<[n: number]>("{0} 项暂无价格"),
  },
  history: {
    entryDeletedTheAccountNowUsesItsLatestRemainingDated:
      "记录已删除，账户现使用剩余记录中日期最新的一条。",
    entryHistory: "记录历史",
    manageHoldingsAndCashEnteredManuallyOrImportedFromStatements:
      "管理手动录入或从对账单导入的持仓和现金。",
    addEntry: "添加记录",
    dismiss: "关闭",
    loadingEntry: "正在加载记录…",
    loadingHistory: "正在加载历史…",
    noEntriesYetAddHoldingsManuallyOrImportAStatement:
      "暂无记录。可手动添加持仓或导入对账单图片。",
    current: "当前",
    blankEntry: "空白记录",
    loadOlderEntries: "加载更早记录",
    ifThisIsTheCurrentEntryTheMostRecentRemaining:
      "若删除当前记录，将使用剩余记录中日期最新的一条计算账户市值。原始上传文件、支出交易及导入的买卖交易仍会保留。",
    manual: "手动录入",
    imported: "已导入",
    synced: "已同步",
    summary: message<
      [source: string, adjusted: boolean, positions: number, cash: number]
    >([
      "text",
      0,
      ["if", 1, " · 已调整", ""],
      " · ",
      2,
      " 项持仓 · ",
      3,
      " 项现金余额",
    ]),
    viewImport: message<[date: string]>("查看 {0} 的导入记录"),
    editEntry: message<[date: string]>("编辑 {0} 的记录"),
    deleteEntry: message<[date: string]>("删除 {0} 的记录"),
    deleteEntryTitle: "删除记录",
    removeConfirm: message<[date: string]>("删除 {0} 记录的持仓和现金？"),
    removeCount: message<[positions: number, cash: number]>(
      "将从此日期的记录中删除 {0} 项持仓和 {1} 项现金余额。",
    ),
  },
  snapshot: {
    entryUpdated: "记录已更新。",
    replacedTheEntryForThatDate: "已替换该日期的记录。",
    holdingsRecorded: "持仓已记录。",
    balanceRecorded: "余额已记录。",
    editEntry: "编辑记录",
    addEntry: "添加记录",
    updateHoldings: "更新持仓",
    updateBalance: "更新余额",
    whatTheAccountHeldOnADatePricesAreUsed:
      "记录账户在指定日期的持仓。实时行情可用前将使用此处的价格。",
    copyEachBalanceFromTheCPFAppOrYourLatest:
      "从 CPF 应用或最新对账单抄录各项余额，没有的子账户可留空。",
    enterWhatYouOweAsANegativeAmount: "请将欠款输入为负数。",
    theBalanceShownByYourBankOnADate: "银行在指定日期显示的余额。",
    editingTheseHoldingsKeepsTheOriginalStatementImageOrFile:
      "编辑持仓会保留原始对账单图片或文件及导入的买卖交易。更改仅应用于此条记录。",
    asOf: "截至日期",
    theNewestDatedEntryDeterminesTheAccountValueAnExisting:
      "账户市值由日期最新的记录决定，不会覆盖已有记录。",
    savingTheSameDateAgainReplacesThatEntry: "再次保存同一日期会替换该条记录。",
    holdings: "持仓",
    symbol: "证券代码",
    exchange: "交易所",
    quantity: "数量",
    price: "价格",
    averageCost: "平均成本",
    optionalPerUnit: "选填，每单位成本",
    marketValue: "市值",
    optionalTotalOtherwiseQuantityPrice: "选填总市值，否则按数量 × 价格计算。",
    addHolding: "添加持仓",
    balances: "余额",
    retirementOpensAt55WhenSpecialCloses:
      "年满 55 岁时开设退休账户，特别账户同时关闭。",
    removeIt: "移除",
    cash: "现金",
    balance: "余额",
    addCurrency: "添加币种",
    emptyHint: message<[investments: boolean]>([
      "text",
      "请先添加持仓或现金余额再保存。如需记录空账户，请在“",
      ["if", 0, "现金", "余额"],
      "”中输入 0。",
    ]),
    holdingNumber: message<[n: number]>("持仓 {0}"),
    removeHolding: message<[n: number]>("移除持仓 {0}"),
    bucketCurrency: message<[bucket: string]>("{0}（SGD）"),
    removeBalance: message<[currency: string]>("移除 {0} 余额"),
    unsplit: message<[balances: string]>("此前的记录中有 {0} 未拆分。"),
    unsplitAfter: "，请先录入以上各项余额。",
  },
  meta: {
    title: "账户",
    detailTitle: "账户",
    description:
      "投资账户根据持仓估值；银行与信用卡账户根据余额和交易记账。各账户保留自己的币种。",
  },
};

export default accounts;
