import "server-only";

// Daily closes from Yahoo Finance's public chart endpoint (Finnhub's free tier has no historical candles).
const cache = new Map<string, { at: number; closes: Record<string, number> }>();
const TTL = 30 * 60_000;

function exchangeDay(ts: number, tz: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts * 1000));
}

export async function fetchDailyCloses(symbol: string, from: string): Promise<Record<string, number>> {
  const key = `${symbol}|${from}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.closes;

  // a few days of slack before the first needed day
  const period1 = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000) - 6 * 86_400;
  const period2 = Math.floor(Date.now() / 1000) + 86_400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (TradeMax journal)" }, cache: "no-store" });
  if (!res.ok) throw new Error(`history_${res.status}`);
  const json = await res.json();
  const r = json?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const close: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
  const tz: string = r?.meta?.exchangeTimezoneName ?? "America/New_York";

  const closes: Record<string, number> = {};
  ts.forEach((t, i) => {
    const c = close[i];
    if (typeof c === "number" && c > 0) closes[exchangeDay(t, tz)] = Math.round(c * 10_000) / 10_000;
  });
  cache.set(key, { at: Date.now(), closes });
  return closes;
}
