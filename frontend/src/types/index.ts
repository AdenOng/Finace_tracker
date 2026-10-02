export interface User {
  id: number;
  username: string;
}

export interface AuthResponse {
  success: boolean;
  user_id?: number;
  token?: string;
  error?: string;
}

export interface Transaction {
  id: number;
  description: string;
  amount: number;
  date: string;
  category: string | null;
  is_duplicate: boolean;
  llm_suggested_category?: string;
}

export interface PortfolioSummary {
  total_value: number;
  by_symbol: {
    symbol: string;
    quantity: number;
    value: number;
  }[];
}

export interface NetWorth {
  assets: number;
  liabilities: number;
  net_worth: number;
  portfolio_value: number;
}
