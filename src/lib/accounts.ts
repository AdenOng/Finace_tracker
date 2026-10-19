/** Account and holding labels shared by server routers and client components. */

export const accountTypes = [
  "brokerage",
  "retirement",
  "crypto_wallet",
  "checking",
  "savings",
  "credit_card",
  "cash",
  "other",
] as const;
export type AccountType = (typeof accountTypes)[number];

export const accountTypeLabels: Record<AccountType, string> = {
  brokerage: "Brokerage",
  retirement: "Retirement",
  crypto_wallet: "Crypto wallet",
  checking: "Current / checking",
  savings: "Savings",
  credit_card: "Credit card",
  cash: "Cash",
  other: "Other",
};

/** Accounts that hold securities; the rest only carry cash balances and spending. */
export function holdsSecurities(type: AccountType) {
  return (
    type === "brokerage" || type === "retirement" || type === "crypto_wallet"
  );
}

export const assetClasses = [
  "stock",
  "etf",
  "fund",
  "bond",
  "option",
  "crypto",
  "other",
] as const;
export type AssetClass = (typeof assetClasses)[number];

export const assetClassLabels: Record<AssetClass | "cash", string> = {
  stock: "Stock",
  etf: "ETF",
  fund: "Fund",
  bond: "Bond",
  option: "Option",
  crypto: "Crypto",
  other: "Other",
  cash: "Cash",
};

/**
 * Accounts fall on one side of the app or the other: investments are valued from their holdings,
 * bank and card accounts from a balance plus their spending transactions.
 */
export const accountGroups = {
  investments: {
    label: "Investments",
    types: ["brokerage", "retirement", "crypto_wallet"],
    institutionKinds: ["broker", "crypto_exchange", "depository"],
  },
  banking: {
    label: "Bank & cards",
    types: ["savings", "checking", "credit_card", "cash", "other"],
    institutionKinds: ["bank", "card_issuer"],
  },
} as const satisfies Record<
  string,
  {
    label: string;
    types: readonly AccountType[];
    institutionKinds: readonly string[];
  }
>;
export type AccountGroup = keyof typeof accountGroups;

export function accountGroupOf(type: AccountType): AccountGroup {
  return holdsSecurities(type) ? "investments" : "banking";
}
