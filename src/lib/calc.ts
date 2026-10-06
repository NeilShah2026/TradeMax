import type { Fill, Quote, Side, Trade } from "./types";

const EPS = 1e-9;

export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function sortFills(fills: Fill[]): Fill[] {
  return [...fills].sort((a, b) => {
    const t = new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime();
    return t !== 0 ? t : a.created_at.localeCompare(b.created_at);
  });
}

export const openingAction = (side: Side) => (side === "long" ? "buy" : "sell");
export const closingAction = (side: Side) => (side === "long" ? "sell" : "buy");

/** Local calendar day key, e.g. 2026-10-05 */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export interface RealizedEvent {
  tradeId: string;
  symbol: string;
  date: Date;
  pnl: number;
  quantity: number;
}

export interface TradeSummary {
  trade: Trade;
  fills: Fill[];
  status: "open" | "closed";
  openQty: number;
  avgCost: number;
  realized: number;
  /** Cost basis of the shares that have been closed — the denominator for return % */
  closedCost: number;
  returnPct: number | null;
  entryAvg: number;
  entryQty: number;
  exitAvg: number | null;
  exitQty: number;
  openedAt: Date;
  closedAt: Date | null;
  lastActivity: Date;
  holdMs: number | null;
  events: RealizedEvent[];
}

/**
 * Walks a trade's fills in time order using average-cost accounting.
 * Opening fills (buys for longs, sells for shorts) raise the average cost; closing fills realize P&L.
 */
export function summarize(trade: Trade): TradeSummary {
  const fills = sortFills(trade.fills);
  const dir = trade.side === "long" ? 1 : -1;
  const open = openingAction(trade.side);

  let qty = 0;
  let avg = 0;
  let realized = 0;
  let closedCost = 0;
  let entryQty = 0;
  let entryCost = 0;
  let exitQty = 0;
  let exitValue = 0;
  let closedAt: Date | null = null;
  const events: RealizedEvent[] = [];

  for (const f of fills) {
    const date = new Date(f.executed_at);
    if (f.action === open) {
      avg = (avg * qty + f.price * f.quantity) / (qty + f.quantity);
      qty = round6(qty + f.quantity);
      entryQty += f.quantity;
      entryCost += f.price * f.quantity;
      closedAt = null;
    } else {
      const q = Math.min(f.quantity, qty);
      if (q <= EPS) continue;
      const pnl = (f.price - avg) * q * dir;
      realized += pnl;
      closedCost += avg * q;
      exitQty += q;
      exitValue += f.price * q;
      qty = round6(qty - q);
      events.push({ tradeId: trade.id, symbol: trade.symbol, date, pnl, quantity: q });
      if (qty <= EPS) {
        qty = 0;
        closedAt = date;
      }
    }
  }

  const openedAt = fills.length ? new Date(fills[0].executed_at) : new Date(trade.created_at);
  const lastActivity = fills.length ? new Date(fills[fills.length - 1].executed_at) : openedAt;
  const status = qty > EPS || fills.length === 0 ? "open" : "closed";

  return {
    trade,
    fills,
    status,
    openQty: qty,
    avgCost: qty > EPS ? avg : 0,
    realized,
    closedCost,
    returnPct: closedCost > EPS ? realized / closedCost : null,
    entryAvg: entryQty > 0 ? entryCost / entryQty : 0,
    entryQty,
    exitAvg: exitQty > 0 ? exitValue / exitQty : null,
    exitQty,
    openedAt,
    closedAt: status === "closed" ? closedAt : null,
    lastActivity,
    holdMs: status === "closed" && closedAt ? closedAt.getTime() - openedAt.getTime() : null,
    events,
  };
}

/** Returns an error message if the fills don't form a valid position, otherwise null. */
export function validateFills(side: Side, fills: Pick<Fill, "action" | "quantity" | "executed_at" | "created_at">[]): string | null {
  if (!fills.length) return "A trade needs at least one fill.";
  const sorted = [...fills].sort((a, b) => {
    const t = new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime();
    return t !== 0 ? t : a.created_at.localeCompare(b.created_at);
  });
  const open = openingAction(side);
  if (sorted[0].action !== open) {
    return side === "long"
      ? "A long trade must start with a buy."
      : "A short trade must start with a sell.";
  }
  let qty = 0;
  for (const f of sorted) {
    qty = round6(qty + (f.action === open ? f.quantity : -f.quantity));
    if (qty < -EPS) {
      return side === "long"
        ? "You can't sell more shares than you hold at that point in time."
        : "You can't buy back more shares than you're short at that point in time.";
    }
  }
  return null;
}

export interface LivePosition {
  summary: TradeSummary;
  quote: Quote | null;
  price: number | null;
  marketValue: number | null;
  costBasis: number;
  unrealized: number | null;
  unrealizedPct: number | null;
  dayPnl: number | null;
}

export function livePosition(summary: TradeSummary, quote: Quote | null, now = new Date()): LivePosition {
  const dir = summary.trade.side === "long" ? 1 : -1;
  const qty = summary.openQty;
  const costBasis = summary.avgCost * qty;
  if (!quote || !(quote.price > 0)) {
    return { summary, quote: null, price: null, marketValue: null, costBasis, unrealized: null, unrealizedPct: null, dayPnl: null };
  }
  const price = quote.price;
  const unrealized = (price - summary.avgCost) * qty * dir;
  // Day P&L: positions opened today are measured from cost, older ones from the previous close.
  const openedToday = dayKey(summary.openedAt) === dayKey(now);
  const ref = openedToday || !(quote.prevClose > 0) ? summary.avgCost : quote.prevClose;
  return {
    summary,
    quote,
    price,
    marketValue: price * qty,
    costBasis,
    unrealized,
    unrealizedPct: costBasis > EPS ? unrealized / costBasis : null,
    dayPnl: (price - ref) * qty * dir,
  };
}

// ---------- Aggregates ----------

export interface DailyPnl {
  key: string;
  date: Date;
  pnl: number;
  tradeIds: string[];
}

export function dailyRealized(summaries: TradeSummary[]): DailyPnl[] {
  const map = new Map<string, { pnl: number; ids: Set<string> }>();
  for (const s of summaries) {
    for (const e of s.events) {
      const k = dayKey(e.date);
      const cur = map.get(k) ?? { pnl: 0, ids: new Set<string>() };
      cur.pnl += e.pnl;
      cur.ids.add(e.tradeId);
      map.set(k, cur);
    }
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, date: parseDayKey(key), pnl: v.pnl, tradeIds: [...v.ids] }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export interface SeriesPoint {
  key: string;
  date: Date;
  value: number; // cumulative P&L
  daily: number; // realized that day
  live?: boolean;
}

/** One point per calendar day from the first realized day through today; last point includes open P&L. */
export function cumulativeSeries(daily: DailyPnl[], unrealized: number, now = new Date()): SeriesPoint[] {
  const todayKey = dayKey(now);
  const byKey = new Map(daily.map((d) => [d.key, d.pnl]));
  const startDate = daily.length ? daily[0].date : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // start one day before the first event so the curve begins at 0
  const cursor = new Date(startDate);
  cursor.setDate(cursor.getDate() - 1);
  const points: SeriesPoint[] = [];
  let cum = 0;
  while (dayKey(cursor) <= todayKey) {
    const k = dayKey(cursor);
    const d = byKey.get(k) ?? 0;
    cum += d;
    points.push({ key: k, date: new Date(cursor), value: cum, daily: d });
    cursor.setDate(cursor.getDate() + 1);
  }
  const last = points[points.length - 1];
  if (last && unrealized !== 0) {
    points[points.length - 1] = { ...last, value: last.value + unrealized, live: true };
  } else if (last) {
    last.live = true;
  }
  return points;
}

export interface Stats {
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  net: number;
  grossWin: number;
  grossLoss: number; // positive number
  profitFactor: number | null;
  expectancy: number | null;
  avgWin: number | null;
  avgLoss: number | null; // negative number
  payoff: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  avgHoldWin: number | null;
  avgHoldLoss: number | null;
  maxDrawdown: number; // positive number
  bestStreak: number;
  worstStreak: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Stats over closed trades, ordered by close time. */
export function computeStats(closed: TradeSummary[]): Stats {
  const ordered = [...closed].sort((a, b) => (a.closedAt!.getTime() - b.closedAt!.getTime()));
  const winsArr = ordered.filter((s) => s.realized > 0.005);
  const lossArr = ordered.filter((s) => s.realized < -0.005);
  const grossWin = winsArr.reduce((a, s) => a + s.realized, 0);
  const grossLoss = -lossArr.reduce((a, s) => a + s.realized, 0);
  const net = ordered.reduce((a, s) => a + s.realized, 0);
  const decided = winsArr.length + lossArr.length;

  let peak = 0;
  let cum = 0;
  let maxDrawdown = 0;
  let streak = 0;
  let bestStreak = 0;
  let worstStreak = 0;
  for (const s of ordered) {
    cum += s.realized;
    peak = Math.max(peak, cum);
    maxDrawdown = Math.max(maxDrawdown, peak - cum);
    if (s.realized > 0.005) streak = streak > 0 ? streak + 1 : 1;
    else if (s.realized < -0.005) streak = streak < 0 ? streak - 1 : -1;
    else streak = 0;
    bestStreak = Math.max(bestStreak, streak);
    worstStreak = Math.min(worstStreak, streak);
  }

  const avgWin = mean(winsArr.map((s) => s.realized));
  const avgLoss = mean(lossArr.map((s) => s.realized));

  return {
    count: ordered.length,
    wins: winsArr.length,
    losses: lossArr.length,
    breakeven: ordered.length - decided,
    winRate: decided ? winsArr.length / decided : null,
    net,
    grossWin,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    expectancy: ordered.length ? net / ordered.length : null,
    avgWin,
    avgLoss,
    payoff: avgWin !== null && avgLoss !== null && avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : null,
    largestWin: winsArr.length ? Math.max(...winsArr.map((s) => s.realized)) : null,
    largestLoss: lossArr.length ? Math.min(...lossArr.map((s) => s.realized)) : null,
    avgHoldWin: mean(winsArr.map((s) => s.holdMs ?? 0)),
    avgHoldLoss: mean(lossArr.map((s) => s.holdMs ?? 0)),
    maxDrawdown,
    bestStreak,
    worstStreak: Math.abs(worstStreak),
  };
}

export interface Group {
  key: string;
  pnl: number;
  count: number;
  wins: number;
  winRate: number | null;
}

export function groupBy(closed: TradeSummary[], keys: (s: TradeSummary) => string[]): Group[] {
  const map = new Map<string, { pnl: number; count: number; wins: number; losses: number }>();
  for (const s of closed) {
    for (const k of keys(s)) {
      const g = map.get(k) ?? { pnl: 0, count: 0, wins: 0, losses: 0 };
      g.pnl += s.realized;
      g.count += 1;
      if (s.realized > 0.005) g.wins += 1;
      else if (s.realized < -0.005) g.losses += 1;
      map.set(k, g);
    }
  }
  return [...map.entries()].map(([key, g]) => ({
    key,
    pnl: g.pnl,
    count: g.count,
    wins: g.wins,
    winRate: g.wins + g.losses ? g.wins / (g.wins + g.losses) : null,
  }));
}

export function holdBucket(ms: number | null): string {
  if (ms === null) return "—";
  const h = ms / 3_600_000;
  if (h < 24) return "< 1 day";
  const d = h / 24;
  if (d <= 7) return "1–7 days";
  if (d <= 30) return "1–4 weeks";
  return "1 month +";
}

export const HOLD_BUCKETS = ["< 1 day", "1–7 days", "1–4 weeks", "1 month +"];
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
