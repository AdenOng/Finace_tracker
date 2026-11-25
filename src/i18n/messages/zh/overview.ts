import { message } from "../../template";
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
    unpriced: message<[n: number]>("{0} 项持仓暂无价格"),
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
    srsRelief: message<[cap: string]>(
      "存入退休辅助计划（SRS）的金额可抵扣应税收入，每年上限为 {0}。",
    ),
    putIn: message<[year: number | string]>("{0} 年存入"),
    capReached:
      message<[cap: string, year: number | string]>(
        "已达到 {1} 年的 {0} 上限。",
      ),
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
    since: message<[date: string]>("自 {0} 起"),
    chartDescription: message<
      [label: string, first: string, last: string, start: string, end: string]
    >("{0}，从 {1} 至 {2}：{3} 至 {4}。使用左右方向键查看各日期。"),
    estimateNotice: message<[date: string | null]>([
      "text",
      "根据账户记录和历史市价估算",
      [
        "if",
        0,
        ["text", "，每日数据自 ", 0, " 起记录。"],
        "，每日数据从今天起记录。",
      ],
    ]),
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
    unavailable: message<[symbols: string]>("{0} 暂无市价，已使用对账单价格。"),
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
    netWorthName: message<[name: string | undefined]>([
      "text",
      "净资产 · ",
      ["??", 0, ""],
    ]),
    recordedBalances: message<[oldest: string | null, latest: string]>([
      "text",
      "最新记录余额",
      [
        "if",
        ["&&", 0, ["!==", 0, 1]],
        ["text", "，从 ", 0, " 至 ", 1],
        ["text", "，截至 ", 1],
      ],
      "。超过 45 天的余额会标记为待更新。",
    ]),
    marketPrices: message<[quoted: number, holdings: number, date: string]>([
      "text",
      ["if", ["===", 0, 1], ["text", "全部 ", 1], ["text", 1, " 项中的 ", 0]],
      " 项持仓按市价估值，截至 ",
      2,
      "。",
    ]),
    implausible: message<[symbols: string]>(
      "{0} 的市价与对账单价格相差较大，已使用对账单价格。请检查该账户记录中的证券代码、交易所和类型。",
    ),
    availableToday: "为目前可动用资产。",
    inRetirement: "在 CPF 和 SRS 中。",
    leavesOut: "不包含",
    retirementAfter: "的 CPF 和 SRS 资产。",
    debtBefore: "已扣除",
    debtAfter: "信用卡欠款",
    converted: message<[currency: string, date: string]>(
      "已换算为 {0} · 汇率截至 {1}。",
    ),
    notConverted: message<[currency: string]>("尚无兑 {0} 汇率，未计入："),
    unpriced: message<[n: number]>("{0} 项持仓暂无价格，未计入合计。"),
    accountsShare: message<[n: number, share: string]>("{0} 个账户 · {1}"),
    locked: message<[share: string]>("未来储备 · {0}"),
    setup: message<[done: number, total: number]>("初始设置 · {0}/{1}"),
    spendingMonth: message<[month: string]>("支出 · {0}"),
    comparison: message<[less: boolean, month: string]>([
      "text",
      "，较 ",
      1,
      ["if", 0, "减少", "增加"],
      "。本人账户互转不计入。",
    ]),
    noSpending: message<[month: string]>("{0} 尚无支出记录。"),
    excludedSpending:
      message<[currencies: string]>("{0} 支出尚无汇率，未计入合计。"),
    netWorth: "净资产",
  },
  transferFreshnessNotices: {
    from: message<[name: string]>("从 {0} 转出（"),
    to: message<[date: string, name: string]>("于 {0}）至 {1}（"),
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
      "于 ",
      0,
      "）的转账暂时",
      ["if", 1, "未计入净资产", "在净资产中重复计入"],
      "：",
      2,
      " 在 ",
      3,
      " 的余额已包含此笔转账，但 ",
      4,
      " 的余额截至 ",
      5,
      "，早于转账",
      ["if", 6, "转出", "到账"],
      "。",
    ]),
    update: message<[name: string, shared: boolean]>([
      "text",
      ["if", 1, "请所有者更新", "更新"],
      " ",
      0,
      " 以修正",
    ]),
  },
};
export default overview;
