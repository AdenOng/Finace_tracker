import type { createCaller } from "../../src/server/api/root";

/** Synthetic records for the disposable emulator backend only. */
export async function seedMobileFinance(
  caller: ReturnType<typeof createCaller>,
) {
  const today = new Date().toISOString().slice(0, 10);
  const common = {
    institutionId: null,
    currency: "SGD",
    last4: null,
    notes: "Synthetic emulator test account",
  };
  const bank = await caller.accounts.create({
    ...common,
    name: "Everyday savings",
    type: "savings",
  });
  const broker = await caller.accounts.create({
    ...common,
    name: "Long-term investments",
    type: "brokerage",
  });
  await caller.portfolio.addSnapshot({
    accountId: bank.id,
    asOf: today,
    positions: [],
    cash: [{ currency: "SGD", amount: "12450.75" }],
  });
  await caller.portfolio.addSnapshot({
    accountId: broker.id,
    asOf: today,
    cash: [{ currency: "SGD", amount: "2000" }],
    positions: [
      {
        symbol: "TESTETF",
        exchange: "",
        name: "Synthetic index fund",
        assetClass: "etf",
        currency: "SGD",
        quantity: "100",
        averageCost: "95.50",
        price: "105.25",
      },
    ],
  });
  for (const [description, amount] of [
    ["Monthly salary", "4500.00"],
    ["Weekly groceries", "-84.60"],
    ["Coffee with friends", "-12.80"],
  ] as const) {
    await caller.spending.create({
      accountId: bank.id,
      postedDate: today,
      description,
      merchant: null,
      amount,
      currency: "SGD",
      categoryId: null,
      isTransfer: false,
      notes: null,
    });
  }
  return { bankId: bank.id, brokerId: broker.id };
}
