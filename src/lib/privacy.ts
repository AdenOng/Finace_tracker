/**
 * Cards whose amounts can be shown or hidden on their own, apart from the "Hide amounts" setting.
 * A fixed list keeps the saved preferences small and the keys stable across releases.
 */
export const amountScopes = [
  "overview-net-worth",
  "overview-investments",
  "overview-spending",
  "overview-cpf-srs",
  "portfolio-summary",
  "portfolio-holdings",
  "portfolio-cash",
  "portfolio-brokers",
  "accounts-investments",
  "accounts-banking",
  "accounts-cpf_srs",
  "account-value",
  "account-split",
  "account-holdings",
  "account-cash",
  "account-transactions",
  "account-reconciliation",
  "spending-summary",
  "spending-transactions",
  "workspace-value",
  "workspace-allocation",
  "workspace-accounts",
  "workspace-spending",
  "workspace-transactions",
] as const;

export type AmountScope = (typeof amountScopes)[number];
