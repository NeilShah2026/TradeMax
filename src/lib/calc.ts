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
  /** Total P&L at that day's close: realized to date + open positions marked to the close */
  value: number;
  /** Change in total P&L vs the previous point */
  daily: number;
  realized: number;
  unrealized: number;
  live?: boolean;
}

/** symbol -> day key -> closing price */
export type CloseHistory = Record<string, Record<string, number>>;

/**
 * For each symbol, the first day we need a closing price from: any day a position was still open at the close.
 * Trades opened and closed the same day need no history.
 */
export function historyNeeds(summaries: TradeSummary[], now = new Date()): Record<string, string> {
  const today = dayKey(now);
  const out: Record<string, string> = {};
  for (const s of summaries) {
    if (!s.fills.length) continue;
    const start = dayKey(s.openedAt);
    const end = s.closedAt ? dayKey(s.closedAt) : today;
    if (end <= start && s.status === "closed") continue;
    const sym = s.trade.symbol;
    if (!out[sym] || start < out[sym]) out[sym] = start;
  }
  return out;
}

interface Snapshot {
  day: string;
  qty: number;
  avg: number;
  realized: number;
  lastPrice: number;
}

function snapshots(s: TradeSummary): Snapshot[] {
  const dir = s.trade.side === "long" ? 1 : -1;
  const open = openingAction(s.trade.side);
  let qty = 0;
  let avg = 0;
  let realized = 0;
  const out: Snapshot[] = [];
  for (const f of s.fills) {
    if (f.action === open) {
      avg = (avg * qty + f.price * f.quantity) / (qty + f.quantity);
      qty = round6(qty + f.quantity);
    } else {
      const q = Math.min(f.quantity, qty);
      realized += (f.price - avg) * q * dir;
      qty = round6(qty - q);
    }
    const day = dayKey(new Date(f.executed_at));
    // several fills on one day collapse into that day's end state
    if (out.length && out[out.length - 1].day === day) out[out.length - 1] = { day, qty, avg, realized, lastPrice: f.price };
    else out.push({ day, qty, avg, realized, lastPrice: f.price });
  }
  return out;
}

/** Latest close on or before `day` (binary search over sorted keys) */
function closeAsOf(keys: string[], closes: Record<string, number>, day: string): { day: string; close: number } | null {
  let lo = 0;
  let hi = keys.length - 1;
  let hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] <= day) {
      hit = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return hit >= 0 ? { day: keys[hit], close: closes[keys[hit]] } : null;
}

/**
 * Daily mark-to-market P&L curve: one point per trading day from the day before the first fill through the
 * live session. Each point = realized P&L to date + every open position valued at that day's close; the last
 * point uses live quotes. `liveDay` is the session the quotes belong to (e.g. Friday over a weekend), so the
 * curve doesn't grow a flat extra point before the market opens.
 */
export function markToMarketSeries(
  summaries: TradeSummary[],
  history: CloseHistory,
  quotes: Record<string, Quote>,
  now = new Date(),
  liveDay = dayKey(now),
): SeriesPoint[] {
  const withFills = summaries.filter((s) => s.fills.length);
  if (!withFills.length) return [];

  const trades = withFills.map((s) => ({ s, snaps: snapshots(s), i: -1, dir: s.trade.side === "long" ? 1 : -1 }));
  const histKeys: Record<string, string[]> = {};
  const allCloseDays = new Set<string>();
  for (const [sym, closes] of Object.entries(history)) {
    histKeys[sym] = Object.keys(closes).sort();
    histKeys[sym].forEach((k) => allCloseDays.add(k));
  }
  const closeDays = [...allCloseDays].sort();
  const histFrom = closeDays[0];
  const histTo = closeDays[closeDays.length - 1];
  const eventDays = new Set(trades.flatMap((t) => t.snaps.map((x) => x.day)));
  const lastEvent = [...eventDays].sort().pop() ?? liveDay;
  const today = lastEvent > liveDay ? lastEvent : liveDay;

  const first = trades.reduce((m, t) => (t.snaps[0].day < m ? t.snaps[0].day : m), today);
  const cursor = parseDayKey(first);
  cursor.setDate(cursor.getDate() - 1);
  while (cursor.getDay() === 0 || cursor.getDay() === 6) cursor.setDate(cursor.getDate() - 1);

  const points: SeriesPoint[] = [];
  for (; dayKey(cursor) <= today; cursor.setDate(cursor.getDate() + 1)) {
    const k = dayKey(cursor);
    const wd = cursor.getDay();
    const isToday = k === today;
    const useLive = k >= liveDay;
    if (!isToday && !eventDays.has(k)) {
      if (wd === 0 || wd === 6) continue;
      // inside the range we have prices for, a weekday with no closes is a market holiday
      if (histFrom && k >= histFrom && k <= histTo && !allCloseDays.has(k)) continue;
    }
    let realized = 0;
    let unrealized = 0;
    for (const t of trades) {
      while (t.i + 1 < t.snaps.length && t.snaps[t.i + 1].day <= k) t.i++;
      if (t.i < 0) continue;
      const snap = t.snaps[t.i];
      realized += snap.realized;
      if (snap.qty > 0) {
        const sym = t.s.trade.symbol;
        // Mark at: today's live quote, else that day's close, else (no usable close yet) the last fill price
        let price = snap.lastPrice;
        const live = useLive ? quotes[sym]?.price : undefined;
        if (live && live > 0) price = live;
        else if (histKeys[sym]) {
          const c = closeAsOf(histKeys[sym], history[sym], k);
          if (c && c.close > 0 && c.day >= snap.day) price = c.close;
        }
        unrealized += (price - snap.avg) * snap.qty * t.dir;
      }
    }
    const value = realized + unrealized;
    const prev = points[points.length - 1];
    points.push({ key: k, date: new Date(cursor), value, daily: prev ? value - prev.value : value, realized, unrealized, live: isToday });
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
