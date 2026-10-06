export type Side = "long" | "short";
export type Action = "buy" | "sell";

export interface Fill {
  id: string;
  trade_id: string;
  action: Action;
  quantity: number;
  price: number;
  executed_at: string; // ISO
  created_at: string;
}

export interface Trade {
  id: string;
  symbol: string;
  side: Side;
  setups: string[];
  mistakes: string[];
  notes: string;
  rating: number | null;
  created_at: string;
  updated_at: string;
  fills: Fill[];
}

export interface FillInput {
  action: Action;
  quantity: number;
  price: number;
  executed_at: string;
}

export interface NewTradeInput {
  symbol: string;
  side: Side;
  setups: string[];
  mistakes: string[];
  notes: string;
  fill: FillInput;
}

export type TradePatch = Partial<Pick<Trade, "symbol" | "side" | "setups" | "mistakes" | "notes" | "rating">>;

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
  time: number; // unix seconds
}

export interface Profile {
  symbol: string;
  name: string | null;
  logo: string | null;
}
