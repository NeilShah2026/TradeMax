import "server-only";
import { MIN_QUOTE_INTERVAL, QUOTE_CALLS_PER_MIN } from "./quote-budget";
import type { Profile, Quote } from "./types";

const BASE = "https://finnhub.io/api/v1";
export const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? "";
export const isFinnhubConfigured = FINNHUB_KEY.length > 8;

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,11}$/;
export const cleanSymbol = (s: string | null) => {
  const v = (s ?? "").trim().toUpperCase();
  return SYMBOL_RE.test(v) ? v : null;
};

async function get<T>(path: string, params: Record<string, string>, init?: RequestInit): Promise<T> {
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { ...init, headers: { "X-Finnhub-Token": FINNHUB_KEY } });
  if (res.status === 429) throw new Error("rate_limited");
  if (!res.ok) throw new Error(`finnhub_${res.status}`);
  return res.json() as Promise<T>;
}

// Small in-process caches so several tabs/components don't burn through the 60 req/min free tier.
// Clients poll at the fastest rate their symbol count allows (lib/quote-budget); this side enforces it:
// a short cache dedupes tabs polling the same symbols, and a sliding one-minute window caps upstream quote
// calls at QUOTE_CALLS_PER_MIN — past that, the last known quote is served instead.
const QUOTE_TTL = MIN_QUOTE_INTERVAL - 500;
const quoteCache = new Map<string, { at: number; quote: Quote | null }>();
const quoteInflight = new Map<string, Promise<Quote | null>>();
const quoteCalls: number[] = [];
const profileCache = new Map<string, Profile>();

function takeQuoteCall() {
  const now = Date.now();
  while (quoteCalls.length && now - quoteCalls[0] >= 60_000) quoteCalls.shift();
  if (quoteCalls.length >= QUOTE_CALLS_PER_MIN) return false;
  quoteCalls.push(now);
  return true;
}

export async function fetchQuote(symbol: string): Promise<Quote | null> {
  const hit = quoteCache.get(symbol);
  if (hit && Date.now() - hit.at < QUOTE_TTL) return hit.quote;
  // Concurrent requests for the same symbol share one upstream call
  const pending = quoteInflight.get(symbol);
  if (pending) return pending;
  if (!takeQuoteCall()) {
    if (hit) return hit.quote;
    throw new Error("rate_limited");
  }
  const req = (async () => {
    const q = await get<{ c: number; d: number | null; dp: number | null; pc: number; t: number }>("/quote", { symbol }, { cache: "no-store" });
    const quote: Quote | null = q && q.c > 0 ? { symbol, price: q.c, change: q.d ?? 0, changePct: q.dp ?? 0, prevClose: q.pc, time: q.t } : null;
    quoteCache.set(symbol, { at: Date.now(), quote });
    return quote;
  })().finally(() => quoteInflight.delete(symbol));
  quoteInflight.set(symbol, req);
  return req;
}

export async function fetchProfile(symbol: string): Promise<Profile> {
  const hit = profileCache.get(symbol);
  if (hit) return hit;
  const p = await get<{ name?: string; logo?: string }>("/stock/profile2", { symbol }, { next: { revalidate: 86_400 } });
  const profile: Profile = { symbol, name: p?.name || null, logo: p?.logo || null };
  profileCache.set(symbol, profile);
  return profile;
}

export async function searchSymbols(q: string): Promise<{ symbol: string; name: string }[]> {
  const r = await get<{ result?: { symbol: string; description: string; type: string }[] }>(
    "/search",
    { q, exchange: "US" },
    { next: { revalidate: 3600 } },
  );
  return (r.result ?? [])
    .filter((x) => !x.symbol.includes(".") && (x.type === "Common Stock" || x.type === "ETP" || x.type === "ADR" || x.type === ""))
    .slice(0, 8)
    .map((x) => ({ symbol: x.symbol, name: x.description }));
}
