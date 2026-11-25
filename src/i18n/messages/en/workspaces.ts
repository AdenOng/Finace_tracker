import { message } from "../../template";
const workspaces = {
  page: {
    description: "Shared views for family finances, funds, and other groups.",
  },
  meta: {
    workspaces: "Workspaces",
    sharedWorkspace: "Shared workspace",
    sharedAccount: "Shared account",
  },
  kinds: {
    family: "family",
    fund: "fund",
    custom: "custom",
  },
  roles: {
    owner: "owner",
    member: "member",
    viewer: "viewer",
  },
  acceptInvitation: {
    joinWorkspace: "Join workspace",
  },
  workspaceDetail: {
    balances: message<[currency: string]>(
      "Latest recorded balances, shown in {0}.",
    ),
    unpricedExcluded: message<[n: number]>(
      "{0} holdings without a price are excluded.",
    ),
    unpriced: message<[n: number]>("{0} unpriced"),
    snapshot: message<[date: string]>(
      "Latest snapshot: {0}. Accounts may have different snapshot dates. Balances more than 45 days old are marked stale.",
    ),
    archived: " \u00b7 archived",

    backToWorkspaces: "Back to workspaces",
    allWorkspaces: "All workspaces",
    switchWorkspace: "Switch workspace",
    personal: "Personal",
    sharedPortfolioVisibilityValuesShowWholeShared:
      "Shared portfolio visibility. Values show whole shared accounts; contributions and individual investor stakes are not tracked yet.",
    balancesAndActivityFromAccountsExplicitlyShared:
      "Balances and activity from accounts explicitly shared with this workspace.",
    workspaceSections: "Workspace sections",
    dashboard: "Dashboard",
    sharingMembers: "Sharing & members",
    loadingSharedAccounts: "Loading shared accounts…",
    loadingPortfolio: "Loading portfolio…",
    sharedAccountValue: "Shared account value",
    excludedBecauseAnExchangeRateIsMissing:
      "Excluded because an exchange rate is missing:",
    assetAllocation: "Asset allocation",
    sharedAccounts: "Shared accounts",
    readonlyHereAccountOwnersEditTheirRecords:
      "Read-only here. Account owners edit their records in Personal view.",
    noSharedAccounts: "No shared accounts",
    useSharingAndMembersToShareAn:
      "Use Sharing & members to share an account with this audience.",
    account: "Account",
    owner: "Owner",
    value: "Value",
    asOf: "As of",
    notRecorded: "Not recorded",
  },
  workspaceManagement: {
    archived: " (archived)",
    you: " (you)",
    invitation: message<[email: string, role: string, date: string]>(
      "{0} · {1} · expires {2}",
    ),

    theActionCouldNotBeCompleted: "The action could not be completed",
    accountSharing: "Account sharing",
    sharingIncludesBalancesHoldingsAndTransactionHistory:
      "Sharing includes balances, holdings, and transaction history for everyone in this workspace. Uploaded statements and credentials stay private.",
    accountToShare: "Account to share",
    chooseOneOfYourPrivateAccounts: "Choose one of your private accounts",
    shareAccount: "Share account",
    viewersCanReadSharedAccountsAccountSharing:
      "Viewers can read shared accounts. Account sharing is available to members.",
    noAccountsSharedYet: "No accounts shared yet.",
    account: "Account",
    owner: "Owner",
    sharingActions: "Sharing actions",
    stopSharing: "Stop sharing",
    readonly: "Read-only",
    members: "Members",
    ownerManagesMembershipMembersCanShareTheir:
      "Owner manages membership. Members can share their own accounts. Viewers have read-only access. Financial edits always stay with account owners.",
    makeViewerUnshareAccounts: "Make viewer & unshare accounts",
    makeMember: "Make member",
    transferOwnership: "Transfer ownership",
    removeMember: "Remove member",
    leaveWorkspace: "Leave workspace",
    inviteSomeone: "Invite someone",
    linksWorkOnceAndExpireInSeven:
      "Links work once and expire in seven days. Share the link directly with the invited person.",
    access: "Access",
    viewer: "Viewer",
    memberCanShareOwnAccounts: "Member (can share own accounts)",
    createInvitationLink: "Create invitation link",
    invitationLink: "Invitation link",
    copyTheInvitationLinkFromTheField:
      "Copy the invitation link from the field above.",
    revokeInvitation: "Revoke invitation",
    workspaceSettings: "Workspace settings",
    workspaceName: "Workspace name",
    purpose: "Purpose",
    family: "Family",
    fund: "Fund",
    other: "Other",
    displayCurrency: "Display currency",
    saveWorkspace: "Save workspace",
    deletingThisWorkspaceRevokesSharingAndInvitations:
      "Deleting this workspace revokes sharing and invitations. Personal accounts and financial records are retained.",
    deleteWorkspace: "Delete workspace",
  },
  workspaceSpending: {
    previousMonth: "Previous month",
    nextMonth: "Next month",
    filterSharedTransactionsByAccount: "Filter shared transactions by account",
    allSharedAccounts: "All shared accounts",
    spendingSummary: "Spending summary",
    markedTransfersAreExcludedAmountsAreGrouped:
      "Marked transfers are excluded. Amounts are grouped by their original currency.",
    loadingSummary: "Loading summary…",
    noSpendingRecordedThisMonth: "No spending recorded this month.",
    category: "Category",
    spent: "Spent",
    received: "Received",
    uncategorised: "Uncategorised",
    sharedTransactions: "Shared transactions",
    readonlyAccountOwnersManageEntriesInPersonal:
      "Read-only. Account owners manage entries in Personal view.",
    loadingTransactions: "Loading transactions…",
    noTransactionsMatch: "No transactions match.",
    description: "Description",
    accountOwner: "Account / owner",
    transfer: "Transfer",
  },
  workspacesView: {
    yourWorkspaces: "Your workspaces",
    eachWorkspaceIsASeparateAudienceOnly:
      "Each workspace is a separate audience. Only explicitly shared accounts appear there.",
    loadingWorkspaces: "Loading workspaces…",
    noWorkspacesYet: "No workspaces yet",
    createAFamilyWorkspaceOrAShared:
      "Create a family workspace or a shared portfolio for your fund viewers.",
    createWorkspace: "Create workspace",
    accountsStayPrivateUntilYouShareThem:
      "Accounts stay private until you share them. Everyone in a workspace can view all its shared accounts.",
    workspaceName: "Workspace name",
    purpose: "Purpose",
    family: "Family",
    fund: "Fund",
    other: "Other",
    displayCurrency: "Display currency",
  },
};
export default workspaces;
