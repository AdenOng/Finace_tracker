/** Friendly names for exchange MICs and the short codes statements tend to use. */
const names: Record<string, string> = {
  XNAS: "Nasdaq",
  NASDAQ: "Nasdaq",
  XNYS: "NYSE",
  NYSE: "NYSE",
  ARCX: "NYSE Arca",
  XASE: "NYSE American",
  BATS: "Cboe",
  XSES: "SGX",
  SGX: "SGX",
  SES: "SGX",
  XHKG: "HKEX",
  HKEX: "HKEX",
  SEHK: "HKEX",
  XLON: "London",
  LSE: "London",
  XETR: "Xetra",
  XAMS: "Amsterdam",
  XPAR: "Paris",
  XSWX: "SIX Swiss",
  XTKS: "Tokyo",
  XASX: "ASX",
  ASX: "ASX",
  XTSE: "Toronto",
  XSHG: "Shanghai",
  XSHE: "Shenzhen",
  XKRX: "Korea",
  XBOM: "BSE India",
  XNSE: "NSE India",
};

export function exchangeName(code: string) {
  return names[code] ?? code;
}
