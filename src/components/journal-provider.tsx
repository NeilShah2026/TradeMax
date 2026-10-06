"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { cumulativeSeries, dailyRealized, livePosition, summarize, type DailyPnl, type LivePosition, type SeriesPoint, type TradeSummary } from "@/lib/calc";
import { simulateQuotes } from "@/lib/demo-data";
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
  realized: number;
  unrealized: number;
  dayPnl: number;
  marketValue: number;
  daily: DailyPnl[];
  series: SeriesPoint[];
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
  const interval = !marketOpen ? 120_000 : symbols.length > 10 ? 30_000 : isDemo ? 5_000 : 15_000;
  const { data, error, isLoading } = useSWR(
    key,
    async ([, list]: [string, string]) => {
      const syms = list.split(",");
      if (isDemo) return { configured: true, quotes: simulateQuotes(syms, anchors), rateLimited: false } as QuotesResponse;
      return fetchQuotes(syms);
    },
    { refreshInterval: interval, revalidateOnFocus: true, keepPreviousData: true, dedupingInterval: 4_000 },
  );
  let status: QuoteStatus = "loading";
  if (isDemo) status = "demo";
  else if (error) status = "error";
  else if (data && !data.configured) status = "off";
  else if (data) status = marketOpen ? "live" : "closed";
  else if (!isLoading && !key) status = marketOpen ? "live" : "closed";
  return { quotes: data?.quotes ?? {}, status, marketOpen };
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
  const { quotes, status: quoteStatus } = useQuotes(openSymbols, anchors);

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
    const series = cumulativeSeries(daily, unrealized);
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
      realized,
      unrealized,
      dayPnl,
      marketValue,
      daily,
      series,
      allSetups: tally((t) => t.setups),
      allMistakes: tally((t) => t.mistakes),
    };
  }, [trades, error, isLoading, summaries, openSummaries, quotes, quoteStatus]);

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
