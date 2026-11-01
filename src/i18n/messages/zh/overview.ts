import type en from "../en/overview";
import type { Translation } from "../../types";
const overview: Translation<typeof en> = {
  sentenceEnd: "。",
  meta: { title: "总览" },
  accountRow: {
    notRecorded: "未记录",
    awaitingPrices: "等待价格",
    rateUnavailable: "暂无汇率",
    partialFXUnavailable: "部分金额 · 暂无汇率",
    owed: "欠款",
    unpriced: (n: number) => `${n} 项持仓暂无价格`,
  },
  cpfSrsSheet: {
    cPFSRSForLater: "CPF 与 SRS · 未来储备",
    accounts: "账户",
    partialTotalSomeHoldingsAreMissingAPrice:
      "部分合计。部分持仓缺少价格或汇率。",
    copyYourOrdinarySpecialAndMediSaveBalancesFrom:
      "从 CPF 应用复制普通、特别和保健储蓄账户的余额。",
    addCPF: "添加 CPF",
    notSplit: "未拆分",
    notSplitByAccount: "未按账户拆分",
    addAnSRSAccount: "添加 SRS 账户",
    noTopupsRecordedYetAnythingInBy31:
      "尚未记录存入金额。12 月 31 日前存入的金额可抵扣下一年的应税收入。导入 SRS 对账单后，存入记录会显示在这里。",
    countedInNetWorth: "已计入净资产。",
    notCountedInNetWorth: "未计入净资产。",
    cPFOpensUpFrom55SRSCanBe:
      "公积金从 55 岁起可提取；达到法定退休年龄后，提取 SRS 无需支付罚金。",
    changeThisUnderTheGearIcon: "点击齿轮图标可更改。",
    interestBefore: "按当前利率，每年利息约为",
    interestAfter: "，于 1 月发放。",
    srsRelief: (cap: string) =>
      `存入退休辅助计划（SRS）的金额可抵扣应税收入，每年上限为 ${cap}。`,
    putIn: (year: number | string) => `${year} 年存入`,
    capReached: (cap: string, year: number | string) =>
      `已达到 ${year} 年的 ${cap} 上限。`,
    roomAfter: "在 12 月 31 日前存入，即可享有全额税务减免。",
    roomBefore: "再存入 ",
  },
  netWorthChart: {
    netWorthChartData: "净资产图表数据",
    overTime: "历史走势",
    noChange: "无变化",
    netWorthChartRange: "净资产图表时段",
    backfilled: "回填数据*",
    backfilledLabel: "回填数据",
    backfilledSuffix: " · 回填数据*",
    estimatedFromYourEntries: "根据记录估算",
    partialTotal: "部分合计",
    dataIsBackfilledBeforeEachAccountsFirstEntry:
      "* 各账户首条记录之前的数据为回填数据。由于无法确定成本价或买入日期，按历史市价估算首条记录中的持仓价值。此数据反映市场走势，并非你的实际收益。",
    showAsTable: "以表格显示",
    estimated: " · 估算",
    partial: "· 部分合计",
    ranges: { "3m": "3 个月", "1y": "1 年", all: "全部" },
    since: (date: string) => `自 ${date} 起`,
    chartDescription: (
      label: string,
      first: string,
      last: string,
      start: string,
      end: string,
    ) =>
      `${label}，从 ${first} 至 ${last}：${start} 至 ${end}。使用左右方向键查看各日期。`,
    estimateNotice: (date: string | null) =>
      `根据账户记录和历史市价估算${date ? `，每日数据自 ${date} 起记录。` : "，每日数据从今天起记录。"}`,
  },
  portfolioSettings: {
    investmentDisplaySettings: "投资显示设置",
    netWorthDisplaySettings: "净资产显示设置",
    portfolioDisplay: "投资组合显示",
    chooseOneCurrencyForYourNetWorthInvestments:
      "选择用于净资产、投资和账户合计的显示币种。",
    displayCurrency: "显示币种",
    loadingCurrencies: "加载币种中…",
    eachAccountTotalIncludesItsInvestmentsAndCash:
      "账户合计包含投资与现金，按最新可用的每日汇率换算。切换币种会同步更新所有合计。",
    exchangeRatesRefreshAutomaticallyIfARateIs:
      "汇率会自动更新。若暂无汇率，合计会标记为部分金额，直至可以换算。",
  },
  priceRefresh: {
    refreshPrices: "更新价格",
    unavailable: (symbols: string) => `${symbols} 暂无市价，已使用对账单价格。`,
  },
  page: {
    notCategorised: "未分类",
    other: "其他",
    partialTotal: "部分合计",
    nothingToTotalYetAddAnAccountBelow:
      "暂无可合计的资产。请在下方添加账户并记录资产。",
    holdingsAreValuedAtTheirStatementPrices: "持仓按对账单价格估值。",
    sinceThePreviousClose: "较上一收盘价",
    notCountedInNetWorth: "未计入净资产",
    twostepSignin: "两步验证",
    defaultAIProvider: "默认 AI 服务商",
    anInvestmentAccount: "投资账户",
    aBankAccountOrCard: "银行账户或信用卡",
    portfolio: "投资组合",
    partialInvestmentTotalAllocationWillAppearWhenEvery:
      "投资合计不完整。所有持仓都有价格和汇率后，将显示资产配置。",
    brokerageRetirementAndCryptoAccountsAreValuedFrom:
      "证券、退休及加密货币账户按持有资产估值。",
    addOne: "添加账户",
    transactions: "交易",
    moneyIn: "收入",
    moneyOut: "支出",
    leftOver: "结余",
    whereItWent: "支出去向",
    everythingElse: "其他支出",
    savingsCurrentAndCreditCardAccountsCarryA:
      "储蓄、往来及信用卡账户记录余额和交易。",
    netWorthName: (name: string | undefined) => `净资产 · ${name ?? ""}`,
    recordedBalances: (oldest: string | null, latest: string) =>
      `最新记录余额${oldest && oldest !== latest ? `，从 ${oldest} 至 ${latest}` : `，截至 ${latest}`}。超过 45 天的余额会标记为待更新。`,
    marketPrices: (quoted: number, holdings: number, date: string) =>
      `${quoted === holdings ? `全部 ${holdings}` : `${holdings} 项中的 ${quoted}`} 项持仓按市价估值，截至 ${date}。`,
    implausible: (symbols: string) =>
      `${symbols} 的市价与对账单价格相差较大，已使用对账单价格。请检查该账户记录中的证券代码、交易所和类型。`,
    availableToday: "为目前可动用资产。",
    inRetirement: "在 CPF 和 SRS 中。",
    leavesOut: "不包含",
    retirementAfter: "的 CPF 和 SRS 资产。",
    debtBefore: "已扣除",
    debtAfter: "信用卡欠款",
    converted: (currency: string, date: string) =>
      `已换算为 ${currency} · 汇率截至 ${date}。`,
    notConverted: (currency: string) => `尚无兑 ${currency} 汇率，未计入：`,
    unpriced: (n: number) => `${n} 项持仓暂无价格，未计入合计。`,
    accountsShare: (n: number, share: string) => `${n} 个账户 · ${share}`,
    locked: (share: string) => `未来储备 · ${share}`,
    setup: (done: number, total: number) => `初始设置 · ${done}/${total}`,
    spendingMonth: (month: string) => `支出 · ${month}`,
    comparison: (less: boolean, month: string) =>
      `，较 ${month}${less ? "减少" : "增加"}。本人账户互转不计入。`,
    noSpending: (month: string) => `${month} 尚无支出记录。`,
    excludedSpending: (currencies: string) =>
      `${currencies} 支出尚无汇率，未计入合计。`,
    netWorth: "净资产",
  },
  transferFreshnessNotices: {
    from: (name: string) => `从 ${name} 转出（`,
    to: (date: string, name: string) => `于 ${date}）至 ${name}（`,
    explanation: (
      date: string,
      missing: boolean,
      fresh: string,
      freshDate: string,
      stale: string,
      staleDate: string,
      outgoing: boolean,
    ) =>
      `于 ${date}）的转账暂时${missing ? "未计入净资产" : "在净资产中重复计入"}：${fresh} 在 ${freshDate} 的余额已包含此笔转账，但 ${stale} 的余额截至 ${staleDate}，早于转账${outgoing ? "转出" : "到账"}。`,
    update: (name: string, shared: boolean) =>
      `${shared ? "请所有者更新" : "更新"} ${name} 以修正`,
  },
};
export default overview;
