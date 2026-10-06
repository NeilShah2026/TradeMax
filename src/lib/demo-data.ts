import type { Fill, Quote, Side, Trade } from "./types";

// Deterministic PRNG so the demo looks the same on every load.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE: Record<string, number> = {
  AAPL: 228, NVDA: 168, MSFT: 505, TSLA: 312, AMD: 158, META: 742, AMZN: 221, GOOGL: 238,
  SPY: 655, QQQ: 588, PLTR: 172, COIN: 318, NFLX: 1215, AVGO: 335, SHOP: 148, UBER: 94,
};
const SYMBOLS = Object.keys(BASE);
const SETUPS = ["Breakout", "Pullback", "Earnings", "Trend follow", "Reversal", "Gap & go", "Swing"];
const MISTAKES = ["FOMO entry", "Moved stop", "Sized too big", "Exited early", "No plan", "Chased"];
const NOTES_WIN = [
  "Clean break of the range on volume. Held through the first pullback and scaled out into strength.",
  "Waited for the retest of the 20 EMA — entry was patient for once. Plan worked as written.",
  "Strong sector day. Took partials at 1R and let the rest run to the prior high.",
];
const NOTES_LOSS = [
  "Entered before confirmation. Should have waited for the close above resistance.",
  "Market rolled over after the open; stop was fine, size wasn't.",
  "Thesis was right, timing wasn't. Got shaken out right before the move.",
];

function marketTime(day: Date, rand: () => number): Date {
  const d = new Date(day);
  const minutes = 9 * 60 + 35 + Math.floor(rand() * 380); // 9:35 – 15:55
  d.setHours(Math.floor(minutes / 60), minutes % 60, Math.floor(rand() * 60), 0);
  return d;
}

function addTradingDays(d: Date, n: number): Date {
  const out = new Date(d);
  let left = n;
  while (left > 0) {
    out.setDate(out.getDate() + 1);
    if (out.getDay() !== 0 && out.getDay() !== 6) left--;
  }
  return out;
}

function priceAt(symbol: string, d: Date, rand: () => number): number {
  // gentle drift back in time + noise so old trades show older prices
  const daysAgo = (Date.now() - d.getTime()) / 86_400_000;
  return BASE[symbol] * (1 - daysAgo * 0.0006) * (1 + (rand() - 0.5) * 0.06);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildDemoTrades(now = new Date()): Trade[] {
  const rand = mulberry32(20261005);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const trades: Trade[] = [];
  let n = 0;
  const id = () => `demo-${(++n).toString().padStart(4, "0")}`;

  const startDay = new Date(now);
  startDay.setDate(startDay.getDate() - 230);

  const makeFill = (tradeId: string, action: "buy" | "sell", quantity: number, price: number, at: Date): Fill => ({
    id: id(), trade_id: tradeId, action, quantity, price: r2(price), executed_at: at.toISOString(), created_at: at.toISOString(),
  });

  // Closed trades
  let day = addTradingDays(startDay, 1);
  while (true) {
    day = addTradingDays(day, 1 + Math.floor(rand() * 4));
    const holdDays = rand() < 0.35 ? 0 : 1 + Math.floor(rand() * 14);
    const exitDay = addTradingDays(day, holdDays);
    if (exitDay.getTime() > now.getTime() - 86_400_000 * 3) break;

    const symbol = pick(SYMBOLS);
    const side: Side = rand() < 0.82 ? "long" : "short";
    const tradeId = id();
    const entryAt = marketTime(day, rand);
    let exitAt = marketTime(exitDay, rand);
    if (exitAt <= entryAt) exitAt = new Date(entryAt.getTime() + (20 + rand() * 200) * 60_000);

    const entry = priceAt(symbol, day, rand);
    const qty = Math.max(1, Math.round((3000 + rand() * 9000) / entry));
    const win = rand() < 0.57;
    const move = win ? 0.012 + rand() * 0.075 : -(0.006 + rand() * 0.042);
    const dir = side === "long" ? 1 : -1;
    const exit = entry * (1 + move * dir);

    const open = side === "long" ? "buy" : "sell";
    const close = side === "long" ? "sell" : "buy";
    const fills: Fill[] = [];

    if (rand() < 0.3 && qty >= 4) {
      const first = Math.ceil(qty / 2);
      fills.push(makeFill(tradeId, open, first, entry * (1 - 0.004 * dir), entryAt));
      fills.push(makeFill(tradeId, open, qty - first, entry * (1 + 0.004 * dir), new Date(entryAt.getTime() + 25 * 60_000)));
    } else {
      fills.push(makeFill(tradeId, open, qty, entry, entryAt));
    }
    if (win && rand() < 0.45 && qty >= 4) {
      const part = Math.floor(qty / 2);
      const mid = new Date((entryAt.getTime() + exitAt.getTime()) / 2);
      fills.push(makeFill(tradeId, close, part, entry * (1 + move * 0.6 * dir), mid));
      fills.push(makeFill(tradeId, close, qty - part, exit, exitAt));
    } else {
      fills.push(makeFill(tradeId, close, qty, exit, exitAt));
    }

    const mistakes = !win && rand() < 0.65 ? [pick(MISTAKES)] : win && rand() < 0.1 ? ["Exited early"] : [];
    trades.push({
      id: tradeId,
      symbol,
      side,
      setups: [pick(SETUPS)],
      mistakes,
      notes: rand() < 0.6 ? pick(win ? NOTES_WIN : NOTES_LOSS) : "",
      rating: rand() < 0.7 ? (win ? 3 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 3)) : null,
      created_at: entryAt.toISOString(),
      updated_at: exitAt.toISOString(),
      fills,
    });
  }

  // Open positions
  const openSet: [string, Side, number][] = [
    ["NVDA", "long", 60], ["AAPL", "long", 40], ["META", "long", 12], ["PLTR", "long", 50], ["AMD", "long", 35], ["TSLA", "short", 15],
  ];
  openSet.forEach(([symbol, side, qty], i) => {
    const tradeId = id();
    const d = new Date(now);
    d.setDate(d.getDate() - (2 + i * 4));
    const at = marketTime(d, rand);
    const entry = priceAt(symbol, d, rand);
    const fills = [makeFill(tradeId, side === "long" ? "buy" : "sell", qty, entry, at)];
    if (i === 0) fills.push(makeFill(tradeId, "sell", 20, entry * 1.05, new Date(at.getTime() + 86_400_000 * 2)));
    if (i === 2) fills.push(makeFill(tradeId, "buy", 6, entry * 1.02, new Date(at.getTime() + 86_400_000)));
    trades.push({
      id: tradeId, symbol, side, setups: [pick(SETUPS)], mistakes: [], rating: null,
      notes: i === 0 ? "Scaled out 1/3 into the earnings run-up. Holding the rest with a stop under the breakout level." : "",
      created_at: at.toISOString(), updated_at: at.toISOString(), fills,
    });
  });

  return trades;
}

/** Simulated quotes for demo mode, anchored to each position's cost so P&L looks plausible. */
export function simulateQuotes(symbols: string[], anchors: Record<string, number>): Record<string, Quote> {
  const t = Date.now() / 1000;
  const out: Record<string, Quote> = {};
  for (const s of symbols) {
    const h = [...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
    const rand = mulberry32(h);
    const base = anchors[s] ?? BASE[s] ?? 100;
    const drift = -0.05 + rand() * 0.16;
    const dayPct = -0.022 + rand() * 0.045;
    const wiggle = Math.sin(t / 20 + h) * 0.0015 + Math.sin(t / 7 + h * 3) * 0.0006;
    const price = base * (1 + drift) * (1 + wiggle);
    const prevClose = price / (1 + dayPct);
    out[s] = { symbol: s, price: r2(price), change: r2(price - prevClose), changePct: dayPct * 100, prevClose: r2(prevClose), time: Math.floor(t) };
  }
  return out;
}

export const DEMO_SYMBOL_NAMES: Record<string, string> = {
  AAPL: "Apple Inc", NVDA: "NVIDIA Corp", MSFT: "Microsoft Corp", TSLA: "Tesla Inc", AMD: "Advanced Micro Devices",
  META: "Meta Platforms", AMZN: "Amazon.com Inc", GOOGL: "Alphabet Inc", SPY: "SPDR S&P 500 ETF", QQQ: "Invesco QQQ Trust",
  PLTR: "Palantir Technologies", COIN: "Coinbase Global", NFLX: "Netflix Inc", AVGO: "Broadcom Inc", SHOP: "Shopify Inc", UBER: "Uber Technologies",
};
