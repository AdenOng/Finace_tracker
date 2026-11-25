import { message } from "../../template";
import type en from "../en/landing";
import type { Translation } from "../../types";

const landing: Translation<typeof en> = {
  meta: {
    title: "登录",
  },
  home: {
    how: "三步，理清财务",
    signIn: "登录",
    invite: "凭邀请加入。请向此 Finfolio 的管理员索取链接。",
    headlineFirst: "账户再多，",
    headlineSecond: "一眼看清。",
    intro:
      "证券、银行、信用卡，全部放在一起。Finfolio 按你选择的币种换算并汇总余额，净资产有多少，这个月钱花在哪，一眼就明白。",
    add: "账户，归到一起",
    record: "变化，逐笔记下",
    keep: "数据，自己掌握",
    recordBody:
      "上传对账单或截图，让你选择的 AI 模型提取数据；逐笔审核后才会保存。余额、持仓和支出也能手动记录。",
    keepBody:
      "部署在你自己的服务器上。新用户凭邀请加入。支持邮箱和密码或通行密钥登录，并可通过两步验证加强保护。AI 服务商密钥加密保存。",
    sample: "海报中的数字均为虚构，不涉及任何人的真实数据。",
    addBody: message<[count: number, currencies: number]>(
      "从 {0} 家券商和银行（IBKR、moomoo、Tiger、DBS 等）中选择，也可自行添加。每个账户保留原币种，共支持 {1} 种货币。",
    ),
  },
  book: {
    accounts: "账户",
    samplePortfolio: "示例投资组合",
    monthEnd: "月末余额，S$",
    lastDecember: "去年 12 月",
    change: "变动",
    netWorth: "净资产",
    role: "账本",
    previous: "上个月",
    next: "下个月",
    pause: "暂停",
    play: "播放",
    caption: "Nº 01 — 一本账，一整年",
    captionLeft: "左侧账户余额相加，就是右侧的净资产。",
    captionBody:
      "曲线记录净资产的变化，下方色条展示资产配置。拖动页角、点击书页或选择月份，即可翻页。数字均为示例。",
    from: message<[month: string]>("{0}余额"),
    monthAccounts: message<[month: string]>("{0} · 账户"),
    aria: message<[month: string]>("示例账本，{0}。使用方向键翻页。"),
  },
  chart: {
    overTime: "净资产走势",
    allocation: "资产配置",
    lastDecember: "去年 12 月",
    up: "上涨",
    down: "下跌",
    aria: message<
      [
        start: string,
        end: string,
        worth: string,
        direction: string,
        change: string,
      ]
    >("示例投资组合，{0}至{1}：净资产 {2}，本月{3} {4}。"),
    page: message<[page: string]>("第 {0} 页，共 12 页"),
    worthMonth: message<[month: string]>("净资产 · {0}"),
    onMonth: message<[month: string]>("较{0}"),
  },
  sample: {
    classes: {
      stocks: "股票",
      bonds: "债券",
      cash: "现金",
      crypto: "加密货币",
    },
    spending: {
      housing: "住房",
      food: "餐饮",
      shopping: "购物",
      family: "家庭",
      insurance: "保险",
      bills: "账单",
      transport: "交通",
      travel: "旅行",
      other: "其他支出",
    },
    income: {
      Salary: "工资",
      Bonus: "奖金",
      Dividends: "股息",
    },
  },
  cashFlow: {
    accountList: message<[names: string[]]>(["join", 0, " 和 "]),
    title: "现金流",
    moneyIn: "收入",
    moneyOut: "支出",
    saved: "结余",
    inOut: "收支明细",
    year: "今年至今",
    in: "收入",
    out: "支出",
    sinceJanuary: "1 月以来结余",
    averageRate: "平均结余率",
    aria: message<[month: string]>("{0}示例现金流"),
    statement: message<[month: string, page: string]>(
      "{0} · 第 {1} 期，共 12 期",
    ),
    savedTo:
      message<[percent: string, accounts: string]>("占收入 {0} · 存入 {1}"),
    spentShare: message<[percent: string]>("支出 · {0}"),
    savedShare: message<[percent: string]>("结余 · {0}"),
    split:
      message<[spent: string, saved: string]>("收入分配：支出 {0}，结余 {1}"),
    vs: message<[month: string]>("较 {0}"),
  },
  glyphs: {
    netWorth: "净资产",
    signIn: "登录",
    seal: "登录 · FINFOLIO · 凭邀请加入 ·",
  },
};

export default landing;
