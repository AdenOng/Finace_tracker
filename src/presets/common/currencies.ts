import type { PresetPack } from "../types";

export const currencies: PresetPack["currencies"] = [
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "USD", name: "US Dollar", symbol: "US$" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "CNY", name: "Chinese Yuan", symbol: "CN¥" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", minorUnits: 0 },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "KRW", name: "South Korean Won", symbol: "₩", minorUnits: 0 },
  { code: "TWD", name: "New Taiwan Dollar", symbol: "NT$" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", minorUnits: 0 },
  { code: "THB", name: "Thai Baht", symbol: "฿" },
  { code: "PHP", name: "Philippine Peso", symbol: "₱" },
];
