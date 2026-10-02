import type { PresetPack } from "../types";

/**
 * Default spending taxonomy. `aiHint` is what the LLM sees when categorising a line item, so keep
 * it concrete (merchant examples beat abstract descriptions).
 */
export const categories: PresetPack["categories"] = [
  {
    key: "food",
    name: "Food & Dining",
    color: "#D9622B",
    aiHint: "Prepared food and drinks",
    children: [
      {
        key: "food.restaurants",
        name: "Restaurants",
        aiHint: "Sit-down restaurants, hawker centres, food courts",
      },
      {
        key: "food.cafes",
        name: "Cafes & Coffee",
        aiHint: "Starbucks, Ya Kun, Toast Box, bubble tea, bakeries",
      },
      {
        key: "food.delivery",
        name: "Food Delivery",
        aiHint: "GrabFood, foodpanda, Deliveroo",
      },
    ],
  },
  {
    key: "groceries",
    name: "Groceries",
    color: "#5E8C31",
    aiHint:
      "Supermarkets and wet markets: FairPrice, Cold Storage, Sheng Siong, Don Don Donki",
  },
  {
    key: "transport",
    name: "Transport",
    color: "#2F6FB0",
    aiHint: "Getting around",
    children: [
      {
        key: "transport.public",
        name: "Public Transport",
        aiHint: "MRT/bus fares, SimplyGo, EZ-Link, TransitLink",
      },
      {
        key: "transport.ride_hailing",
        name: "Taxi & Ride-hailing",
        aiHint: "Grab rides, Gojek, TADA, ComfortDelGro, CDG Zig",
      },
      {
        key: "transport.car",
        name: "Car",
        aiHint: "Petrol, parking, ERP, servicing, road tax, car loan",
      },
    ],
  },
  {
    key: "shopping",
    name: "Shopping",
    color: "#B03A7A",
    aiHint: "Retail purchases",
    children: [
      {
        key: "shopping.online",
        name: "Online Shopping",
        aiHint: "Shopee, Lazada, Amazon, Taobao, Qoo10",
      },
      {
        key: "shopping.clothing",
        name: "Clothing",
        aiHint: "Apparel, shoes, accessories: Uniqlo, Zara, H&M",
      },
      {
        key: "shopping.electronics",
        name: "Electronics",
        aiHint: "Gadgets and devices: Apple, Challenger, Best Denki, Courts",
      },
      {
        key: "shopping.home",
        name: "Home & Furniture",
        aiHint: "IKEA, Taobao furniture, hardware stores, household items",
      },
    ],
  },
  {
    key: "bills",
    name: "Bills & Utilities",
    color: "#6B5BB5",
    aiHint: "Recurring household bills",
    children: [
      {
        key: "bills.utilities",
        name: "Utilities",
        aiHint: "SP Group, electricity retailers, water, gas",
      },
      {
        key: "bills.telco",
        name: "Mobile & Internet",
        aiHint:
          "Singtel, StarHub, M1, SIMBA, GOMO, Circles.Life, fibre broadband",
      },
    ],
  },
  {
    key: "subscriptions",
    name: "Subscriptions",
    color: "#8A4FD8",
    aiHint:
      "Netflix, Spotify, Disney+, YouTube Premium, iCloud, software, apps",
  },
  {
    key: "housing",
    name: "Housing",
    color: "#7A5230",
    aiHint:
      "Rent, mortgage instalments, HDB/condo maintenance fees, conservancy, property tax",
  },
  {
    key: "health",
    name: "Health & Fitness",
    color: "#1F9C8A",
    aiHint:
      "Clinics, hospitals, dental, pharmacies (Guardian, Watsons), gyms, sports",
  },
  {
    key: "insurance",
    name: "Insurance",
    color: "#3D6E73",
    aiHint: "Life, health, car, travel and home insurance premiums",
  },
  {
    key: "entertainment",
    name: "Entertainment",
    color: "#C9406A",
    aiHint: "Movies, concerts, games, events, hobbies",
  },
  {
    key: "travel",
    name: "Travel",
    color: "#2591B8",
    aiHint: "Flights, hotels, Airbnb, Klook, overseas spending",
  },
  {
    key: "education",
    name: "Education",
    color: "#4C7A2A",
    aiHint: "School fees, courses, books, tuition",
  },
  {
    key: "personal_care",
    name: "Personal Care",
    color: "#B36A9E",
    aiHint: "Haircuts, beauty, spa, cosmetics",
  },
  {
    key: "family",
    name: "Family & Kids",
    color: "#D4A017",
    aiHint: "Childcare, allowances, gifts for family",
  },
  {
    key: "gifts_donations",
    name: "Gifts & Donations",
    color: "#C2553D",
    aiHint: "Presents, ang bao, charity donations",
  },
  {
    key: "fees",
    name: "Fees & Charges",
    color: "#7E7E7E",
    aiHint: "Bank fees, card annual fees, late fees, FX fees, interest charged",
  },
  {
    key: "taxes",
    name: "Taxes",
    color: "#5A5A5A",
    aiHint: "IRAS income tax payments, GST refunds paid back",
  },
  {
    key: "income",
    name: "Income",
    kind: "income",
    color: "#128A5A",
    aiHint: "Money received",
    children: [
      {
        key: "income.salary",
        name: "Salary",
        kind: "income",
        aiHint: "Payroll credits, GIRO salary",
      },
      {
        key: "income.interest",
        name: "Interest",
        kind: "income",
        aiHint: "Bank interest credited",
      },
      {
        key: "income.dividends",
        name: "Dividends",
        kind: "income",
        aiHint: "Dividends paid into a bank account",
      },
      {
        key: "income.refunds",
        name: "Refunds & Cashback",
        kind: "income",
        aiHint: "Merchant refunds, card cashback, rebates",
      },
      {
        key: "income.other",
        name: "Other Income",
        kind: "income",
        aiHint: "Any other incoming money that is not a transfer",
      },
    ],
  },
  {
    key: "transfers",
    name: "Transfers",
    kind: "transfer",
    color: "#4A5560",
    aiHint: "Money moving between the user's own accounts. Not spending.",
    children: [
      {
        key: "transfers.card_payment",
        name: "Credit Card Payment",
        kind: "transfer",
        aiHint: "Paying off a credit card bill from a bank account",
      },
      {
        key: "transfers.investment",
        name: "Investment Funding",
        kind: "transfer",
        aiHint:
          "Deposits to or withdrawals from brokerages (IBKR, moomoo, Longbridge, POEMS…)",
      },
      {
        key: "transfers.internal",
        name: "Between Own Accounts",
        kind: "transfer",
        aiHint: "PayNow/FAST/GIRO to the user's own accounts",
      },
    ],
  },
  {
    key: "other",
    name: "Other",
    color: "#9AA3A0",
    aiHint: "Use only when nothing else fits",
  },
];
