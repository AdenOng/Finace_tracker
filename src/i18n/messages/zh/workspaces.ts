import type en from "../en/workspaces";
import type { Translation } from "../../types";
const workspaces: Translation<typeof en> = {
  page: {
    description: "与家人、基金成员及其他群体共享财务视图。",
  },
  meta: {
    workspaces: "共享空间",
    sharedWorkspace: "共享空间",
    sharedAccount: "共享账户",
  },
  kinds: {
    family: "家庭",
    fund: "基金",
    custom: "其他",
  },
  roles: {
    owner: "所有者",
    member: "成员",
    viewer: "查看者",
  },
  acceptInvitation: {
    joinWorkspace: "加入共享空间",
  },
  workspaceDetail: {
    balances: (currency: string) => `最新记录的余额，以 ${currency} 显示。`,
    unpricedExcluded: (n: number) => `${n} 项缺少价格的持仓未计入。`,
    unpriced: (n: number) => `${n} 项缺少价格`,
    snapshot: (date: string) =>
      `最新快照：${date}。各账户的快照日期可能不同。超过 45 天的余额会标记为待更新。`,
    archived: " · 已归档",

    backToWorkspaces: "返回共享空间",
    allWorkspaces: "全部共享空间",
    switchWorkspace: "切换共享空间",
    personal: "个人",
    sharedPortfolioVisibilityValuesShowWholeShared:
      "查看共享投资组合。金额按共享账户整体显示，暂不记录出资和个人投资者份额。",
    balancesAndActivityFromAccountsExplicitlyShared:
      "查看明确共享至此空间的账户余额和活动。",
    workspaceSections: "共享空间栏目",
    dashboard: "总览",
    sharingMembers: "共享与成员",
    loadingSharedAccounts: "加载共享账户中…",
    loadingPortfolio: "加载投资组合中…",
    sharedAccountValue: "共享账户价值",
    excludedBecauseAnExchangeRateIsMissing: "因缺少汇率而未计入：",
    assetAllocation: "资产配置",
    sharedAccounts: "共享账户",
    readonlyHereAccountOwnersEditTheirRecords:
      "此处为只读视图。账户所有者可在个人视图中编辑记录。",
    noSharedAccounts: "暂无共享账户",
    useSharingAndMembersToShareAn: "在“共享与成员”中向此空间共享账户。",
    account: "账户",
    owner: "所有者",
    value: "价值",
    asOf: "截至日期",
    notRecorded: "未记录",
  },
  workspaceManagement: {
    archived: "（已归档）",
    you: "（你）",
    invitation: (email: string, role: string, date: string) =>
      `${email} · ${role} · ${date} 到期`,

    theActionCouldNotBeCompleted: "无法完成此操作",
    accountSharing: "账户共享",
    sharingIncludesBalancesHoldingsAndTransactionHistory:
      "共享后，此空间中的所有人均可查看余额、持仓和交易历史。上传的对账单和凭据仍为私密信息。",
    accountToShare: "要共享的账户",
    chooseOneOfYourPrivateAccounts: "选择你的一个私人账户",
    shareAccount: "共享账户",
    viewersCanReadSharedAccountsAccountSharing:
      "查看者可查看共享账户。成员可共享自己的账户。",
    noAccountsSharedYet: "暂无共享账户。",
    account: "账户",
    owner: "所有者",
    sharingActions: "共享操作",
    stopSharing: "停止共享",
    readonly: "只读",
    members: "成员",
    ownerManagesMembershipMembersCanShareTheir:
      "所有者管理成员。成员可共享自己的账户，查看者仅有只读权限。财务记录始终由账户所有者编辑。",
    makeViewerUnshareAccounts: "设为查看者并停止共享账户",
    makeMember: "设为成员",
    transferOwnership: "转移所有权",
    removeMember: "移除成员",
    leaveWorkspace: "退出共享空间",
    inviteSomeone: "邀请他人",
    linksWorkOnceAndExpireInSeven:
      "链接仅可使用一次，7 天后失效。请直接将链接分享给受邀人。",
    access: "权限",
    viewer: "查看者",
    memberCanShareOwnAccounts: "成员（可共享自己的账户）",
    createInvitationLink: "创建邀请链接",
    invitationLink: "邀请链接",
    copyTheInvitationLinkFromTheField: "请从上方字段复制邀请链接。",
    revokeInvitation: "撤销邀请",
    workspaceSettings: "共享空间设置",
    workspaceName: "共享空间名称",
    purpose: "用途",
    family: "家庭",
    fund: "基金",
    other: "其他",
    displayCurrency: "显示币种",
    saveWorkspace: "保存共享空间",
    deletingThisWorkspaceRevokesSharingAndInvitations:
      "删除此共享空间会撤销共享和邀请。个人账户和财务记录将保留。",
    deleteWorkspace: "删除共享空间",
  },
  workspaceSpending: {
    previousMonth: "上个月",
    nextMonth: "下个月",
    filterSharedTransactionsByAccount: "按账户筛选共享交易",
    allSharedAccounts: "全部共享账户",
    spendingSummary: "支出汇总",
    markedTransfersAreExcludedAmountsAreGrouped:
      "不含标记为转账的交易。金额按原始币种分组。",
    loadingSummary: "加载汇总中…",
    noSpendingRecordedThisMonth: "本月暂无支出记录。",
    category: "分类",
    spent: "支出",
    received: "收入",
    uncategorised: "未分类",
    sharedTransactions: "共享交易",
    readonlyAccountOwnersManageEntriesInPersonal:
      "只读。账户所有者可在个人视图中管理记录。",
    loadingTransactions: "加载交易中…",
    noTransactionsMatch: "没有符合条件的交易。",
    description: "摘要",
    accountOwner: "账户／所有者",
    transfer: "转账",
  },
  workspacesView: {
    yourWorkspaces: "你的共享空间",
    eachWorkspaceIsASeparateAudienceOnly:
      "每个共享空间都有独立的成员。仅显示明确共享的账户。",
    loadingWorkspaces: "加载共享空间中…",
    noWorkspacesYet: "暂无共享空间",
    createAFamilyWorkspaceOrAShared:
      "创建家庭共享空间，或为基金查看者创建共享投资组合。",
    createWorkspace: "创建共享空间",
    accountsStayPrivateUntilYouShareThem:
      "账户在共享前保持私密。空间中的所有人均可查看其全部共享账户。",
    workspaceName: "共享空间名称",
    purpose: "用途",
    family: "家庭",
    fund: "基金",
    other: "其他",
    displayCurrency: "显示币种",
  },
};
export default workspaces;
