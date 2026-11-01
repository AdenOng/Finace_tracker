import type en from "../en/portfolio";
import type { Translation } from "../../types";

const portfolio: Translation<typeof en> = {
  consolidated: {
    notValued: "未估值",
    noAverageCostRecorded: "未记录平均成本",
    portfolio: "投资组合",
    everyHoldingAcrossYourBrokersAddedUp: "汇总所有券商账户的持仓。",
    manageAccounts: "管理账户 ",
    loadingPortfolio: "正在加载投资组合…",
    allBrokers: "全部券商",
    partial: "数据不全",
    notRecorded: "未记录",
    nothingRecordedYetFor: "以下账户暂无记录：",
    holdings: "持仓",
    brokerCash: "证券账户现金",
    unrealisedGain: "浮动盈亏",
    addAverageCostsToSeeThis: "添加平均成本后显示",
    waitingForExchangeRates: "等待汇率：",
    consolidatedHoldings: "合并持仓",
    searchHoldings: "搜索持仓",
    searchSymbolOrName: "搜索证券代码或名称",
    filterByBroker: "按券商筛选",
    noMatchingHoldings: "没有匹配的持仓",
    noHoldingsRecorded: "暂无持仓记录",
    tryAnotherSymbolOrCompanyName: "试试其他证券代码或公司名称。",
    recordHoldingsInAnInvestmentAccountOrImportAStatement:
      "在投资账户中记录持仓或导入对账单，即可在此查看。",
    holding: "持仓",
    units: "数量",
    value: "市值",
    gain: "盈亏",
    weight: "占比",
    brokerAccounts: "证券账户",
    byBroker: "按券商",
    nothingRecorded: "暂无记录",
    theSameSymbolOnTheSameExchangeIsCombinedAcross:
      "不同券商中同一交易所、同一证券代码的持仓会合并显示。",
    accountsArchived: "账户 → 已归档",
    imported: "已导入",
    manual: "手动录入",
    synced: "已同步",
    exchangeRateUnavailable: " · 暂无汇率",
    beforeConversion: "（换汇前）",
    summary: (positions: number, accounts: number, date: string | null) =>
      `${accounts} 个账户，共 ${positions} 项持仓${date ? `，截至 ${date}` : ""}。`,
    includesBefore: "其中 SRS 为",
    includesAfter: "。",
    costCount: (percent: string | null, count: number, total: number) =>
      `${percent !== null ? `${percent} · ` : ""}${total} 项持仓中有 ${count} 项已记录成本`,
    unpriced: (n: number) => `${n} 项持仓暂无价格，未计入市值。`,
    holdingsCount: (n: number) => `持仓 · ${n}`,
    fxDate: (date: string) => ` 汇率截至 ${date}。`,
    archivedBefore: (n: number) => `${n} 个已归档账户未计入（`,
    archivedAfter: "）。",
    brokerCount: (n: number) => ` · ${n} 家券商`,
    quoteDate: (date: string) => ` · 报价 ${date}`,
    unitsWeight: " 单位 · ",
    unitsDate: (date: string) => `单位 · ${date}`,
  },
  meta: {
    title: "合并投资组合",
  },
};

export default portfolio;
