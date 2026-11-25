import { message } from "../../template";
import type { Translation } from "../../types";
import type en from "../en/imports";
const imports: Translation<typeof en> = {
  importReview: {
    bankStatement: "银行对账单",
    cardStatement: "信用卡对账单",
    brokerageStatement: "证券账户对账单",
    tradeConfirmation: "买卖交易确认单",
    screenshot: "截图",
    document: "文档",
    buy: "买入",
    sell: "卖出",
    dividend: "股息",
    interest: "利息",
    fee: "手续费",
    tax: "税费",
    deposit: "存入",
    withdrawal: "提取",
    transferIn: "转入",
    transferOut: "转出",
    split: "拆股",
    fx: "换汇",
    other: "其他",
    originalAccountRestoredItsImports:
      "原账户已恢复。导入任务和已保存记录仍归属于该账户。",
    imports: "导入",
    theAccountWasRemoved: "账户已移除",
    thisImportBelongsToThe: "此导入任务属于已归档账户",
    itsSavedRecordsAreStill:
      "。已保存记录仍在该账户中。再次添加此券商会创建独立账户，不会转移先前的导入任务。",
    restoreTheOriginalAccountTo:
      "恢复原账户后，即可管理这些明细，并将其持仓重新计入总额。",
    restoreOriginalAccount: "恢复原账户",
    viewOriginalAccount: "查看原账户",
    theOriginalAccountWasDeleted:
      "原账户已删除。此上传文件保留供参考。再次添加券商会创建独立账户，不会转移此导入任务或恢复已删除记录。",
    useTheTrashButtonBeside:
      "点击已保存明细旁的垃圾桶按钮，核对后移除。原始上传文件和提取的明细会保留。",
    seeThemInSpending: "前往支出查看",
    openTheAccount: "打开账户",
    readingYourStatement: "正在提取对账单数据",
    everyLineIsBeingRead:
      "正在逐条读取并整理明细。数页内容通常不到一分钟即可完成；你可以离开此页面，稍后回来查看。",
    thisOneCouldntBeRead: "无法读取此文件",
    readingNeverStartedProbablyBecause: "读取尚未开始，可能是服务器重启所致。",
    readingStoppedPartwayProbablyBecause:
      "读取中途停止，可能是服务器重启所致。",
    somethingWentWrongReadingThe: "读取文件时出错。",
    tryAgain: "重试",
    removeUpload: "移除上传文件",
    compareTheRowsWithYour: "请将明细与对账单核对。修正差额，或确认你已核对。",
    iveCheckedThisSaveAnyway: "我已核对，仍然保存",
    theHoldingsFromThisImport:
      "此导入任务的持仓已在账户中调整。下方明细显示原始提取结果。",
    viewAdjustedHoldings: "查看调整后的持仓",
    theHoldingsOrBalanceEntry:
      "此导入任务的持仓或余额记录已被移除或替换。上传文件和已导入的买卖交易仍会保留。",
    viewAccount: "查看账户",
    chooseTheStatementDateBefore:
      "保存前请选择对账单日期。在下方“截至日期”中输入这些持仓、余额或买卖交易所属的日期。",
    asOf: "截至日期",
    discard: "放弃",
    rowRemovedFromTheAccount: "明细已从账户中移除。原始提取结果仍保留在下方。",
    period: "周期",
    notShown: "未提供",
    opening: "期初",
    closing: "期末",
    provisionalDecidePossibleDuplicates: "暂定结果：请处理可能的重复记录",
    extractionBalances: "提取结果对账",
    savedRecordsWillBalance: "保存后的记录对账",
    skippedRowsExplainTheDifference: "差额由跳过的明细造成",
    skippedRowsNotBeingSaved: "跳过的明细不会保存",
    savedWithAnAcknowledgedBalance: "余额不一致，已确认并保存",
    removed: "已移除",
    excluded: "未纳入",
    reviewRemoval: "核对移除操作",
    restoreTheOriginalAccountToText: "恢复原账户后即可管理此明细",
    all: "全部",
    none: "无",
    alreadyRecorded: "已记录",
    similarOneRecorded: "已有相似记录",
    needsDecision: "待决定",
    keep: "保留",
    skip: "跳过",
    noTransactionsWereFound: "未找到交易。",
    transfer: "转账",
    checkAmountdirection: "核对金额与方向",
    confirmCurrentAmount: "确认当前金额",
    editAmount: "编辑金额",
    negativeDebtoverdraftPositiveCashcredit:
      "负数表示欠款或透支；正数表示现金或结余",
    negativeMoneyOutPositiveMoney: "负数表示支出；正数表示收入",
    flipDirection: "反转方向",
    cancel: "取消",
    applyAmount: "应用金额",
    category: "分类",
    uncategorised: "未分类",
    closingBalance: "期末余额",
    savedAsTheAccountsBalance: "保存为账户余额，使净资产与对账单一致。",
    saveTheClosingBalance: "保存期末余额",
    savedTogetherAsWhatThe:
      "一并保存为下方日期的账户持仓。较新的对账单会替换此记录。",
    noHoldingsOrCashWere: "未找到持仓或现金。",
    noPrice: "暂无价格",
    buysSellsDividendsFeesAnd: "对账单中的买入、卖出、股息、手续费和存入记录。",
    saved: message<
      [
        counts: {
          transactions: number;
          holdings: number;
          activity: number;
          balances: number;
          duplicates: number;
        },
      ]
    >([
      "text",
      "已保存",
      [
        "||",
        [
          "joinPresent",
          "、",
          [
            "&&",
            ["field", 0, "transactions"],
            ["text", ["field", 0, "transactions"], " 笔交易"],
          ],
          [
            "&&",
            ["field", 0, "holdings"],
            ["text", ["field", 0, "holdings"], " 项持仓"],
          ],
          [
            "&&",
            ["field", 0, "activity"],
            ["text", ["field", 0, "activity"], " 笔买卖交易与收付款"],
          ],
          ["&&", ["field", 0, "balances"], "余额"],
        ],
        " 0 条记录",
      ],
      "。",
      [
        "if",
        ["field", 0, "duplicates"],
        ["text", "已排除 ", ["field", 0, "duplicates"], " 条已有记录。"],
        "",
      ],
    ]),
    duplicates: message<[n: number]>(
      "有 {0} 条可能的重复记录待处理。保存前，请为每条高亮明细选择保留或跳过。",
    ),
    historical: message<
      [completed: boolean, date: string, banking: boolean, latest: string]
    >([
      "text",
      ["if", 0, "已保存", "此对账单将保存为"],
      " ",
      1,
      " 的记录。账户已有 ",
      3,
      " 的较新",
      ["if", 2, "余额", "持仓记录"],
      "。当前账户价值仍采用较新记录。",
    ]),
    replaceDate: message<[date: string]>(
      "保存将替换 {0} 已有的对账单持仓或余额。选中的明细将成为该日期的完整记录；现有交易和买卖交易仍会保留。",
    ),
    selected: message<[accepted: number, total: number, undecided: number]>([
      "text",
      "已选 ",
      0,
      " / ",
      1,
      " 条",
      ["if", [">", 2, ["number", 0]], ["text", " · ", 2, " 条待决定"], ""],
    ]),
    warnings: message<[n: number]>(" · {0} 条金额或方向提示（仍可保存）"),
    saveTo: message<[n: number, name: string | null]>("保存 {0} 条至 {1}"),
    remove: message<[label: string]>([
      "text",
      "移除",
      ["stripPrefix", 0, "保存"],
    ]),
    transactions: message<[n: number]>("交易 · {0}"),
    totals: message<[incoming: string, outgoing: string]>(
      "已选：收入 {0}，支出 {1}。取消勾选无需保存的明细。",
    ),
    saveRow: message<[label: string]>("保存{0}"),
    reference: message<[value: string]>(" · 参考编号 {0}"),
    editAmountFor: message<[label: string]>("编辑{0}的金额"),
    amountFor: message<[label: string]>("{0}的金额"),
    balanceLabel: message<[currency: string, bucket: string | null]>([
      "text",
      0,
      " ",
      ["??", 1, "期末／现金"],
      "余额",
    ]),
    activityLabel: message<[type: string, symbol: string | null]>([
      "text",
      0,
      " ",
      ["??", 1, "投资活动"],
    ]),
    saveBucket: message<[bucket: string]>("保存{0}余额"),
    holdings: message<[n: number]>("持仓 · {0}"),
    saveSymbol: message<[symbol: string]>("保存 {0}"),
    saveCash: message<[currency: string]>("保存 {0} 现金"),
    activity: message<[n: number]>("买卖交易与收付款 · {0}"),
    saveActivity: message<[type: string, symbol: string | null]>([
      "trim",
      ["text", "保存", 0, " ", ["??", 1, ""]],
    ]),
    ref: message<[value: string]>("参考编号 {0}"),
    cash: message<[currency: string]>("现金 · {0}"),
    printed:
      message<[direction: string, amount: string]>("对账单显示 {0}{1}。"),
    useAmount: message<[amount: string]>("使用 {0}"),
    recordBefore: "记录",
    recordAfter: message<[bucket: string | null, date: string]>([
      "text",
      "为 ",
      1,
      " 的",
      ["??", 0, ""],
      "余额",
    ]),
    statementDate: "对账单日期",
  },
  importStatus: {
    waiting: "排队中",
    reading: "提取中…",
    readyToReview: "待审核",
    imported: "已导入",
    couldntRead: "失败",
    cancelled: "已取消",
    interrupted: "已中断",
  },
  importsView: {
    thatFileIsLargerThan: "文件超过 20 MB。",
    useAPdfPngJpeg: "请使用 PDF、PNG、JPEG 或 WebP 文件。",
    theUploadFailedTryAgain: "上传失败，请重试。",
    theUploadFailedCheckYour: "上传失败，请检查网络连接。",
    whichAccountIsIt: "1 · 选择所属账户",
    addAnAccountFirstSo: "请先添加账户，以便导入对账单。",
    addOne: "添加账户",
    dropTheStatement: "2 · 拖入对账单",
    uploading: "上传中…",
    pickAnAccountFirst: "请先选择账户",
    thenDropAPdfOr: "然后将 PDF 或截图拖到此处。",
    chooseFile: "选择文件",
    pdfPngJpegWebpUp: "PDF · PNG · JPEG · WEBP — 最大 20 MB",
    uploadingSendsStatementTextOr:
      "上传会将对账单文本或图片发送给此实例配置的 AI 服务商，必要时也会发送给备用服务商。请仅上传你同意与这些服务商共享的文档。",
    openIt: "打开查看",
    recentImports: "最近导入",
    loadOlderImports: "加载更早导入",
    openOneToCheckWhat: "打开导入任务，审核提取结果后再保存。",
    nothingUploadedYet: "暂无上传文件。",
    removedAccount: "已移除账户",
    reads: {
      investments: "从证券账户对账单或应用截图中提取持仓、现金和买卖交易。",
      banking: "从银行或信用卡对账单中提取所有交易和期末余额。",
      cpf_srs:
        "提取 SRS 持仓、现金和充值记录，或中央公积金（CPF）余额。之后需手动将公积金分配至各子账户。",
    },
    statementFor: message<[name: string]>("{0} 的对账单"),
    selected: message<[accepted: number, total: number]>("已选 {0} / {1} 条"),
  },
  lineRemoval: {
    removeImportedRow: "移除已导入明细",
    reviewTheSavedRecordBefore: "移除前请核对已保存记录。",
    cancel: "取消",
    removeRow: "移除明细",
    checkingTheSavedRow: "正在检查已保存明细…",
    theOriginalUploadAndExtraction:
      "原始上传文件和提取结果会保留，此明细将标记为已移除。其他已导入明细不受影响。此处无法撤销移除操作；你可以手动添加修正后的记录。",
    openAccountAndEntryHistory: "打开账户和记录历史",
  },
  page: {
    imports: "导入",
    uploadABankCardOr:
      "上传银行、信用卡或证券账户对账单，也可上传截图。系统会提取数据，经你审核后才会保存。",
  },
  reviewPage: {
    reviewImport: "导入审核",
  },
  summary: {
    unverified: message<[complete: boolean]>([
      "text",
      "未核实：缺少",
      ["if", 0, "完整对账单的", ""],
      "期初或期末余额，无法核对。",
    ]),
    excluded: message<[n: number, currency: string]>(
      "{1} 的 {0} 条明细未纳入核对：缺少期初或期末余额。",
    ),
    balanceCheck: message<[currency: string]>("余额核对 · {0}"),
    result: message<
      [label: string, matches: boolean | null, amount: string, over: boolean]
    >([
      "text",
      0,
      "：",
      ["if", 1, "一致", ["text", ["if", 3, "高于", "低于"], "期末余额 ", 2]],
      "。",
    ]),
    skipped: message<[explains: boolean, amount: string]>([
      "text",
      ["if", 0, "差额由跳过的明细造成", "跳过的明细不会保存"],
      "：",
      1,
      "。已记录明细已计入。",
    ]),
    readBy: message<[model: string]>("提取模型：{0}"),
  },
};
export default imports;
