/**
 * Finnhub's free tier allows 60 calls/min, and every quote is one call per symbol. Quotes get 50 of those;
 * the rest is headroom for ticker search and logos.
 */
export const QUOTE_CALLS_PER_MIN = 50;
/** Never poll faster than this, even for a single symbol */
export const MIN_QUOTE_INTERVAL = 2_000;
/** Prices barely move outside the regular session */
export const CLOSED_QUOTE_INTERVAL = 120_000;

/** Fastest poll (ms) that keeps `symbols` quotes per refresh inside the per-minute budget. 1 → 2s, 5 → 6s, 10 → 12s, 25 → 30s. */
export function quoteInterval(symbols: number) {
  const ms = (Math.max(symbols, 1) * 60_000) / QUOTE_CALLS_PER_MIN;
  return Math.max(MIN_QUOTE_INTERVAL, Math.ceil(ms / 1000) * 1000);
}
