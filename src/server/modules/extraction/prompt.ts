export type PromptCategory = {
  key: string;
  name: string;
  kind: string;
  aiHint: string | null;
};

export type PromptInstitution = {
  name: string;
  extractionHints: string | null;
};

export const EXTRACTION_SYSTEM_PROMPT = `You extract financial data from bank, credit card and brokerage documents into JSON.

Rules:
- Copy numbers exactly as printed. Never estimate, round or invent values. If a value is not shown, use null.
- Amounts are signed: money leaving the account is negative, money arriving is positive. On credit card statements, purchases are negative and payments/refunds are positive.
- For each bank/card transaction, preserve the printed evidence separately: printedDirection is debit for DR, Debit/Withdrawal/Charges columns, a minus sign or brackets; credit for CR or Credit/Deposit/Payments/Refunds columns. Use null when no direction is printed; do not infer it from the merchant or category. printedAmount is the unsigned magnitude as printed (null if unreadable).
- For card opening/closing balances, set openingBalanceDirection/closingBalanceDirection to owed for an amount owed, debt or DR, and credit for an overpayment, credit balance or CR. Use null without evidence. Preserve the printed balance number and its sign; staging will convert card debt to a negative balance and overpayments to positive. Preserve negative bank overdrafts and broker margin cash balances.
- Skip subtotal, total, balance-brought-forward and page-header rows; they are not transactions.
- Copy each bank transaction reference or broker trade/execution ID into "reference" exactly as printed. Use null when absent; do not use account numbers or invent references.
- Dates are ISO (YYYY-MM-DD). Infer the year from the statement period when rows omit it.
- Only use category keys from the list provided. Use null when unsure rather than guessing.
- Record anything unclear in "warnings".`;

export function buildExtractionPrompt(options: {
  categories: PromptCategory[];
  institution?: PromptInstitution | null;
  documentText?: string | null;
  /** Whether the preset tracks CPF and SRS accounts. */
  cpfSrs?: boolean;
}): string {
  const categoryLines = options.categories
    .map(
      (c) =>
        `- ${c.key} (${c.kind}): ${c.name}${c.aiHint ? ` — ${c.aiHint}` : ""}`,
    )
    .join("\n");

  const sections = [
    "Extract every transaction, holding, cash balance and investment activity in the attached document.",
    `Spending categories (use the key):\n${categoryLines}`,
  ];
  if (options.cpfSrs) {
    sections.push(
      'On CPF statements, list each sub-account balance (Ordinary, Special, MediSave, Retirement) in "cashBalances" with its bucket.',
    );
  }
  if (options.institution) {
    sections.push(
      `The document is from ${options.institution.name}.${
        options.institution.extractionHints
          ? `\nNotes for this institution: ${options.institution.extractionHints}`
          : ""
      }`,
    );
  }
  if (options.documentText) {
    sections.push(
      `Text layer of the document:\n<document>\n${options.documentText}\n</document>`,
    );
  }
  return sections.join("\n\n");
}
