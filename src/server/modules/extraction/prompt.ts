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
- Skip subtotal, total, balance-brought-forward and page-header rows; they are not transactions.
- Dates are ISO (YYYY-MM-DD). Infer the year from the statement period when rows omit it.
- Only use category keys from the list provided. Use null when unsure rather than guessing.
- Record anything unclear in "warnings".`;

export function buildExtractionPrompt(options: {
  categories: PromptCategory[];
  institution?: PromptInstitution | null;
  documentText?: string | null;
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
