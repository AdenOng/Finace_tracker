import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import type { StatementExtraction } from "../../src/server/modules/extraction/schemas";

/** Synthetic evidence shared by the emulator flow and isolated import tests. */
export function mobileStatement(): StatementExtraction {
  const date = new Date().toISOString().slice(0, 10);
  return {
    documentType: "bank_statement",
    institutionName: "Synthetic Test Bank",
    accountName: "Everyday savings",
    accountLast4: "1234",
    currency: "SGD",
    periodStart: date,
    periodEnd: date,
    openingBalance: 100,
    openingBalanceDirection: null,
    closingBalance: 87.66,
    closingBalanceDirection: null,
    transactions: [
      {
        date,
        postedDate: date,
        description: "Synthetic import lunch",
        reference: "MOBILE-IMPORT-001",
        merchant: "Test Cafe",
        amount: -12.34,
        printedDirection: "debit",
        printedAmount: 12.34,
        currency: "SGD",
        originalAmount: null,
        originalCurrency: null,
        categoryKey: null,
        isTransfer: false,
      },
    ],
    positions: [],
    cashBalances: [{ currency: "SGD", amount: 87.66, bucket: null }],
    investmentTransactions: [],
    warnings: [],
  };
}

export function mobileStatementImage() {
  // Explicit font keeps evidence legible on headless CI and Snap installations.
  if (
    !GlobalFonts.registerFromPath(
      new URL(
        "../../node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf",
        import.meta.url,
      ).pathname,
      "FinfolioFixture",
    )
  )
    throw new Error("Cannot load the synthetic statement font");
  const c = createCanvas(1100, 650);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "black";
  ctx.font = "26px FinfolioFixture";
  [
    "SYNTHETIC TEST BANK - TEST DATA ONLY",
    "Bank statement - Everyday savings - account ending 1234",
    `Period: ${mobileStatement().periodEnd} to ${mobileStatement().periodEnd}`,
    "Currency: SGD",
    "Opening balance: SGD 100.00",
    `${mobileStatement().periodEnd}  Synthetic import lunch  Debit SGD 12.34`,
    "Reference: MOBILE-IMPORT-001     Merchant: Test Cafe",
    "Closing balance: SGD 87.66",
    "Complete statement. There is exactly one transaction. No investments.",
  ].forEach((line, i) => ctx.fillText(line, 30, 60 + i * 58));
  return new Uint8Array(c.toBuffer("image/png"));
}
