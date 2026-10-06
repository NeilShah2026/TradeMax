"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { dailyRealized, dayKey, historyNeeds, livePosition, markToMarketSeries, summarize, type CloseHistory, type DailyPnl, type LivePosition, type SeriesPoint, type TradeSummary } from "@/lib/calc";
import { simulateHistory, simulateQuotes } from "@/lib/demo-data";
import { CLOSED_QUOTE_INTERVAL, quoteInterval } from "@/lib/quote-budget";
import { isDemo, repo } from "@/lib/repo";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { FillInput, NewTradeInput, Quote, Trade, TradePatch } from "@/lib/types";

export type QuoteStatus = "loading" | "live" | "closed" | "off" | "demo" | "error";

interface Journal {
  loading: boolean;
  error: Error | null;
  trades: Trade[];
  summaries: TradeSummary[];
  byId: Map<string, TradeSummary>;
  open: LivePosition[];
  closed: TradeSummary[];
  quotes: Record<string, Quote>;
  quoteStatus: QuoteStatus;
  /** How often quotes refresh right now (ms) */
  quoteInterval: number;
  /** When the last quote fetch landed (epoch ms), even if prices were unchanged */
  quotesUpdatedAt: number | null;
  realized: number;
  unrealized: number;
  dayPnl: number;
  /** "Today", or the weekday of the last session when the market hasn't opened yet */
  dayLabel: string;
  marketValue: number;
  daily: DailyPnl[];
  series: SeriesPoint[];
  /** true while daily closes for the P&L curve are still loading */
  seriesLoading: boolean;
  allSetups: string[];
  allMistakes: string[];
  actions: {
    createTrade(input: NewTradeInput): Promise<string>;
    updateTrade(id: string, patch: TradePatch, opts?: { silent?: boolean }): Promise<void>;
    deleteTrade(id: string): Promise<void>;
    addFill(tradeId: string, fill: FillInput): Promise<void>;
    updateFill(id: string, fill: FillInput): Promise<void>;
    deleteFill(id: string): Promise<void>;
    refresh(): Promise<void>;
  };
  newTrade: { open: boolean; setOpen(open: boolean): void; preset: Partial<NewTradeInput> | null; start(preset?: Partial<NewTradeInput>): void };
}

const JournalContext = createContext<Journal | null>(null);

export function useJournal() {
  const ctx = useContext(JournalContext);
  if (!ctx) throw new Error("useJournal must be used inside <JournalProvider>");
  return ctx;
}

/** US equities regular session, Mon–Fri 9:30–16:00 America/New_York (holidays not modeled). */
export function isMarketOpen(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = get("weekday");
  if (wd === "Sat" || wd === "Sun") return false;
  const mins = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  return mins >= 570 && mins < 960;
}

const subscribeMarket = (cb: () => void) => {
  const id = setInterval(cb, 30_000);
  return () => clearInterval(id);
};

/** Hydration-safe: the server (and first client render) assume closed, then the real value is used. */
function useMarketOpen() {
  return useSyncExternalStore(subscribeMarket, () => isMarketOpen(), () => false);
}

interface QuotesResponse {
  configured: boolean;
  quotes: Record<string, Quote>;
  rateLimited?: boolean;
}

async function fetchQuotes(symbols: string[]): Promise<QuotesResponse> {
  const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Quotes failed (${res.status})`);
  return res.json();
}

/** Live quotes for an arbitrary list of symbols (dialogs, trade page). */
export function useQuotes(symbols: string[], anchors: Record<string, number> = {}) {
  const marketOpen = useMarketOpen();
  const key = symbols.length ? ["quotes", [...symbols].sort().join(",")] : null;
  // As fast as Finnhub's per-minute budget allows for this many symbols (one call per symbol per refresh)
  const interval = marketOpen ? quoteInterval(symbols.length) : CLOSED_QUOTE_INTERVAL;
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const { data, error, isLoading } = useSWR(
    key,
    async ([, list]: [string, string]) => {
      const syms = list.split(",");
      if (isDemo) return { configured: true, quotes: simulateQuotes(syms, anchors), rateLimited: false } as QuotesResponse;
      return fetchQuotes(syms);
    },
    // Focus/remount revalidations are deduped against the last fetch so they never add calls inside the window
    {
      refreshInterval: interval,
      revalidateOnFocus: true,
      keepPreviousData: true,
      dedupingInterval: Math.min(interval, 15_000),
      focusThrottleInterval: Math.min(interval, 15_000),
      // SWR keeps the old object when prices are unchanged, so this is the reliable "a fetch landed" signal
      onSuccess: () => setUpdatedAt(Date.now()),
    },
  );
  let status: QuoteStatus = "loading";
  if (isDemo) status = "demo";
  else if (error) status = "error";
  else if (data && !data.configured) status = "off";
  else if (data) status = marketOpen ? "live" : "closed";
  else if (!isLoading && !key) status = marketOpen ? "live" : "closed";
  return { quotes: data?.quotes ?? {}, status, marketOpen, interval, updatedAt };
}

/** Sends the browser to /login whenever there's no Supabase session (expired, signed out in another tab, …). */
function useAuthGuard() {
  const router = useRouter();
  useEffect(() => {
    if (isDemo) return;
    const sb = getBrowserSupabase();
    const toLogin = () => {
      router.replace("/login");
      router.refresh();
    };
    sb.auth.getSession().then(({ data }) => {
      if (!data.session) toLogin();
    });
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (event !== "INITIAL_SESSION" && !session)) toLogin();
    });
    return () => data.subscription.unsubscribe();
  }, [router]);
}

export function JournalProvider({ children }: { children: React.ReactNode }) {
  useAuthGuard();
  const { mutate } = useSWRConfig();
  const { data: trades, error, isLoading } = useSWR<Trade[]>("journal", () => repo.list(), { revalidateOnFocus: true });
  const [newTradeOpen, setNewTradeOpen] = useState(false);
  const [preset, setPreset] = useState<Partial<NewTradeInput> | null>(null);

  const summaries = useMemo(() => (trades ?? []).map(summarize), [trades]);
  const openSummaries = useMemo(() => summaries.filter((s) => s.status === "open" && s.openQty > 0), [summaries]);
  const openSymbols = useMemo(() => [...new Set(openSummaries.map((s) => s.trade.symbol))], [openSummaries]);
  const anchors = useMemo(() => Object.fromEntries(openSummaries.map((s) => [s.trade.symbol, s.avgCost])), [openSummaries]);
  const { quotes, status: quoteStatus, interval: quoteInt, updatedAt: quotesUpdatedAt } = useQuotes(openSymbols, anchors);

  // Daily closes for every symbol held overnight, so the P&L curve is marked to market each day
  const needs = useMemo(() => historyNeeds(summaries), [summaries]);
  const needKey = useMemo(
    () =>
      Object.entries(needs)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sym, from]) => `${sym}:${from}`)
        .join(","),
    [needs],
  );
  const { data: fetchedHistory, error: historyError } = useSWR<CloseHistory>(
    !isDemo && needKey ? ["history", needKey] : null,
    async ([, k]: [string, string]) => {
      const res = await fetch(`/api/history?s=${encodeURIComponent(k)}`);
      if (!res.ok) throw new Error(`History failed (${res.status})`);
      return (await res.json()).history as CloseHistory;
    },
    { revalidateOnFocus: false, refreshInterval: 30 * 60_000, keepPreviousData: true },
  );
  const demoQuotesReady = Object.keys(quotes).length > 0 || openSymbols.length === 0;
  const history = useMemo<CloseHistory | undefined>(
    () => (isDemo ? (demoQuotesReady ? simulateHistory(needs, trades ?? [], quotes) : undefined) : fetchedHistory),
    // demo history only needs to be built once quotes exist; re-simulating on every tick would make the curve jitter
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDemo ? needKey : fetchedHistory, isDemo ? demoQuotesReady : null, trades],
  );
  const seriesLoading = !!needKey && !history && !historyError;

  const value = useMemo<Omit<Journal, "actions" | "newTrade">>(() => {
    const open = openSummaries
      .map((s) => livePosition(s, quotes[s.trade.symbol] ?? null))
      .sort((a, b) => (b.marketValue ?? b.costBasis) - (a.marketValue ?? a.costBasis));
    const closed = summaries.filter((s) => s.status === "closed").sort((a, b) => b.closedAt!.getTime() - a.closedAt!.getTime());
    const realized = summaries.reduce((a, s) => a + s.realized, 0);
    const unrealized = open.reduce((a, p) => a + (p.unrealized ?? 0), 0);
    const marketValue = open.reduce((a, p) => a + (p.marketValue ?? p.costBasis), 0);
    const daily = dailyRealized(summaries);
    const todayKey = new Date().toDateString();
    const realizedToday = summaries.flatMap((s) => s.events).filter((e) => e.date.toDateString() === todayKey).reduce((a, e) => a + e.pnl, 0);
    const dayPnl = realizedToday + open.reduce((a, p) => a + (p.dayPnl ?? 0), 0);
    // The session the live quotes belong to (Friday's over a weekend, yesterday's before the open)
    const quoteTimes = Object.values(quotes).map((q) => q.time).filter((t) => t > 0);
    const todayKey2 = dayKey(new Date());
    const liveDay = quoteTimes.length ? dayKey(new Date(Math.max(...quoteTimes) * 1000)) : todayKey2;
    const sessionDay = liveDay > todayKey2 ? todayKey2 : liveDay;
    const series = markToMarketSeries(summaries, history ?? {}, quotes, new Date(), sessionDay);
    const lastPoint = series[series.length - 1];
    // Once price history is in, the day's P&L is exactly the curve's last step, so the chip and chart agree
    const sessionPnl = !seriesLoading && lastPoint && series.length > 1 ? lastPoint.daily : dayPnl;
    const dayLabel = !lastPoint || lastPoint.key === todayKey2 ? "Today" : lastPoint.date.toLocaleDateString(undefined, { weekday: "short" });
    const tally = (pick: (t: Trade) => string[]) => {
      const counts = new Map<string, number>();
      (trades ?? []).forEach((t) => pick(t).forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1)));
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    };
    return {
      loading: isLoading && !trades,
      error: (error as Error) ?? null,
      trades: trades ?? [],
      summaries,
      byId: new Map(summaries.map((s) => [s.trade.id, s])),
      open,
      closed,
      quotes,
      quoteStatus,
      quoteInterval: quoteInt,
      quotesUpdatedAt,
      realized,
      unrealized,
      dayPnl: sessionPnl,
      dayLabel,
      marketValue,
      daily,
      series,
      seriesLoading,
      allSetups: tally((t) => t.setups),
      allMistakes: tally((t) => t.mistakes),
    };
  }, [trades, error, isLoading, summaries, openSummaries, quotes, quoteStatus, quoteInt, quotesUpdatedAt, history, seriesLoading]);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T> => {
      try {
        const out = await fn();
        await mutate("journal");
        if (success) toast.success(success);
        return out;
      } catch (e) {
        toast.error((e as Error).message || "Something went wrong");
        throw e;
      }
    },
    [mutate],
  );

  const actions = useMemo<Journal["actions"]>(
    () => ({
      createTrade: (input) => run(() => repo.createTrade(input)),
      updateTrade: (id, patch, opts) => run(() => repo.updateTrade(id, patch), opts?.silent ? undefined : "Trade updated"),
      deleteTrade: (id) => run(() => repo.deleteTrade(id), "Trade deleted"),
      addFill: (tradeId, fill) => run(() => repo.addFill(tradeId, fill), "Fill added"),
      updateFill: (id, fill) => run(() => repo.updateFill(id, fill), "Fill updated"),
      deleteFill: (id) => run(() => repo.deleteFill(id), "Fill deleted"),
      refresh: async () => {
        await mutate("journal");
      },
    }),
    [run, mutate],
  );

  const newTrade = useMemo<Journal["newTrade"]>(
    () => ({
      open: newTradeOpen,
      setOpen: setNewTradeOpen,
      preset,
      start: (p) => {
        setPreset(p ?? null);
        setNewTradeOpen(true);
      },
    }),
    [newTradeOpen, preset],
  );

  const ctx = useMemo<Journal>(() => ({ ...value, actions, newTrade }), [value, actions, newTrade]);

  return <JournalContext.Provider value={ctx}>{children}</JournalContext.Provider>;
}
