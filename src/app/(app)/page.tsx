"use client";

import { format, startOfWeek } from "date-fns";
import { BarChart3, ChevronDown, ChevronRight, LineChart, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PnlAreaChart, PnlColumns } from "@/components/charts";
import { useJournal } from "@/components/journal-provider";
import { BigMoney, Money, PctPill, Pnl, PnlPct } from "@/components/money";
import { PageBody, PageHeader } from "@/components/shell";
import { TickerLogo } from "@/components/ticker-logo";
import { Button, Card, EmptyState, SectionTitle, Segmented, SideBadge, Skeleton, StatusBadge } from "@/components/ui";
import { computeStats, type SeriesPoint, type TradeSummary } from "@/lib/calc";
import { cn } from "@/lib/cn";
import { fmtDuration, fmtMoney, fmtNumber, fmtPct, fmtPrice, fmtQty, signClass } from "@/lib/format";
import { RANGE_LABEL, RANGES, rangeStart, type RangeKey } from "@/lib/ranges";
import { usePersistentState } from "@/lib/use-persistent";

type Mode = "cumulative" | "daily";

export default function DashboardPage() {
  const j = useJournal();
  const [mode, setMode] = usePersistentState<Mode>("dash-mode", "cumulative", ["cumulative", "daily"]);
  const [range, setRange] = usePersistentState<RangeKey>("dash-range", "3M", RANGES);
  const [hover, setHover] = useState<SeriesPoint | null>(null);

  const { points, baseline } = useMemo(() => {
    const start = rangeStart(range);
    if (!start) return { points: j.series, baseline: 0 };
    const idx = j.series.findIndex((p) => p.date >= start);
    if (idx === -1) {
      const last = j.series[j.series.length - 1];
      return { points: last ? [last] : [], baseline: last?.value ?? 0 };
    }
    const base = idx > 0 ? j.series[idx - 1].value : 0;
    const pts = j.series.slice(Math.max(0, idx - 1));
    return { points: pts, baseline: base };
  }, [j.series, range]);

  const columns = useMemo(() => {
    const inRange = points.slice(1).length ? points.slice(1) : points;
    const weekly = inRange.length > 100;
    if (!weekly) {
      return inRange.filter((p) => p.daily !== 0).map((p) => ({ key: p.key, label: format(p.date, "MMM d"), value: p.daily }));
    }
    const map = new Map<string, { label: string; value: number }>();
    for (const p of inRange) {
      if (!p.daily) continue;
      const wk = startOfWeek(p.date, { weekStartsOn: 1 });
      const k = format(wk, "yyyy-MM-dd");
      const cur = map.get(k) ?? { label: `Week of ${format(wk, "MMM d")}`, value: 0 };
      cur.value += p.daily;
      map.set(k, cur);
    }
    return [...map.entries()].map(([key, v]) => ({ key, ...v }));
  }, [points]);

  const total = j.realized + j.unrealized;
  const shown = hover ? hover.value : total;
  const change = (hover ? hover.value : total) - baseline;

  const stats = useMemo(() => computeStats(j.closed), [j.closed]);
  const recent = useMemo(() => [...j.summaries].sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime()).slice(0, 6), [j.summaries]);

  return (
    <>
      <PageHeader
        left={
          <Segmented
            value={mode}
            onChange={setMode}
            ariaLabel="Chart type"
            options={[
              { value: "cumulative", label: "Total P&L", icon: <LineChart className="h-3.5 w-3.5" /> },
              { value: "daily", label: "Daily P&L", icon: <BarChart3 className="h-3.5 w-3.5" /> },
            ]}
          />
        }
      />

      {/* Hero */}
      <div className="px-4 pt-6 sm:px-6 md:px-8">
        {j.loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : (
          <>
            <div className="text-[34px] leading-none font-semibold tracking-tight sm:text-[40px]">
              <BigMoney value={shown} />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
              <Money value={change} sign className={signClass(change)} />
              <span className="text-muted">{hover ? (hover.live ? "now" : `through ${format(hover.date, "MMM d, yyyy")}`) : RANGE_LABEL[range]}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <HeroChip label="Realized" value={j.realized} />
              <HeroChip label="Open P&L" value={j.unrealized} />
              <HeroChip label="Today" value={j.dayPnl} />
            </div>
          </>
        )}
      </div>

      {/* Chart */}
      <div className="mt-4">
        {j.loading ? (
          <Skeleton className="mx-4 h-[260px] sm:mx-8" />
        ) : j.summaries.length === 0 ? (
          <div className="mx-4 grid h-[260px] place-items-center rounded-2xl border border-dashed border-border sm:mx-8">
            <EmptyState
              title="Your P&L curve starts with your first trade"
              body="Log trades as you take them and this chart fills in automatically."
              action={
                <Button variant="primary" size="sm" onClick={() => j.newTrade.start()}>
                  <Plus className="h-3.5 w-3.5" /> Log a trade
                </Button>
              }
            />
          </div>
        ) : mode === "cumulative" ? (
          <PnlAreaChart points={points} onHover={setHover} />
        ) : columns.length ? (
          <div className="px-2 sm:px-6">
            <PnlColumns data={columns} />
          </div>
        ) : (
          <div className="grid h-[260px] place-items-center text-sm text-muted">No closed P&L in this range</div>
        )}
        <div className="mt-3 flex justify-center px-4">
          <div className="flex items-center gap-0.5 sm:gap-1" role="radiogroup" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={range === r}
                onClick={() => setRange(r)}
                className={cn(
                  "h-7 cursor-pointer rounded-lg px-2.5 font-mono text-[11px] transition-colors sm:px-3",
                  range === r ? "bg-surface-3 font-medium text-fg" : "text-muted hover:text-fg",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <PageBody className="pt-6">
        {/* Stat strip */}
        <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
          <StatCell label="Win rate" value={fmtPct(stats.winRate, { digits: 1 })} sub={`${stats.wins}W · ${stats.losses}L`} />
          <StatCell label="Profit factor" value={fmtNumber(stats.profitFactor)} sub={`${fmtMoney(stats.grossWin, { whole: true })} / ${fmtMoney(stats.grossLoss, { whole: true })}`} money />
          <StatCell label="Avg win / loss" value={stats.avgWin === null ? "—" : `${fmtMoney(stats.avgWin, { whole: true })} / ${fmtMoney(stats.avgLoss ?? 0, { whole: true })}`} sub={`Payoff ${fmtNumber(stats.payoff)}`} money />
          <StatCell label="Expectancy" value={stats.expectancy === null ? "—" : fmtMoney(stats.expectancy, { sign: true })} sub={`per trade · ${stats.count} closed`} money />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section>
            <SectionTitle
              right={
                <Link href="/trades" className="inline-flex items-center gap-1 font-mono text-[11px] text-muted hover:text-fg">
                  View all <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              }
            >
              Recent trades
            </SectionTitle>
            {j.loading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[72px] rounded-2xl" />
                ))}
              </div>
            ) : recent.length ? (
              <div className="flex flex-col gap-2.5">
                {recent.map((s) => (
                  <RecentTradeRow key={s.trade.id} s={s} unrealized={j.open.find((p) => p.summary.trade.id === s.trade.id)?.unrealized ?? null} />
                ))}
              </div>
            ) : (
              <Card>
                <EmptyState title="No trades yet" body="Press N or use New trade to log your first one." />
              </Card>
            )}
          </section>

          <section>
            <SectionTitle
              right={
                <Link href="/positions" className="inline-flex items-center gap-1 font-mono text-[11px] text-muted hover:text-fg">
                  View all <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              }
            >
              Positions
            </SectionTitle>
            <Card className="bg-surface-2/50 p-1.5">
              {j.loading ? (
                <div className="space-y-1.5 p-1">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : j.open.length ? (
                <ul className="flex flex-col">
                  {j.open.map((p) => (
                    <li key={p.summary.trade.id}>
                      <Link href={`/trades/${p.summary.trade.id}`} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface">
                        <TickerLogo symbol={p.summary.trade.symbol} size={34} />
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-[13px] font-semibold">{p.summary.trade.symbol}</div>
                          <div className="truncate font-mono text-[11px] text-muted">
                            {fmtQty(p.summary.openQty)} {p.summary.trade.side === "short" ? "short" : "shares"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-[13px] font-medium">{p.marketValue === null ? <Money value={p.costBasis} className="text-muted" /> : <Money value={p.marketValue} />}</div>
                          <div className="mt-0.5 flex items-center justify-end gap-1.5 font-mono text-[11px]">
                            <Pnl value={p.unrealized} />
                            <PctPill value={p.unrealizedPct} />
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No open positions" body="Open trades show up here with live P&L." className="py-10" />
              )}
            </Card>
          </section>
        </div>
      </PageBody>
    </>
  );
}

function HeroChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="inline-flex h-7 items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-2.5 font-mono text-[11px]">
      <span className="text-muted">{label}</span>
      <Pnl value={value} />
    </div>
  );
}

function StatCell({ label, value, sub, money }: { label: string; value: string; sub?: string; money?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3.5 sm:px-5">
      <div className="font-mono text-[10.5px] tracking-wide text-muted uppercase">{label}</div>
      <div className={cn("mt-1 truncate text-lg font-semibold tracking-tight tabular", money && "money")}>{value}</div>
      {sub && <div className={cn("mt-0.5 truncate font-mono text-[11px] text-muted", money && "money")}>{sub}</div>}
    </div>
  );
}

function RecentTradeRow({ s, unrealized }: { s: TradeSummary; unrealized: number | null }) {
  const [open, setOpen] = useState(false);
  const { trade } = s;
  const pnl = s.status === "open" ? s.realized + (unrealized ?? 0) : s.realized;
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-pop/40">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left">
        <TickerLogo symbol={trade.symbol} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{trade.symbol}</span>
            <SideBadge side={trade.side} />
            <StatusBadge status={s.status} />
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
            {s.fills.length} {s.fills.length === 1 ? "fill" : "fills"} ·{" "}
            {s.status === "closed" ? `Closed ${format(s.closedAt!, "MMM d")} · held ${fmtDuration(s.holdMs)}` : `Opened ${format(s.openedAt, "MMM d")}`}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-sm font-medium">
            <Pnl value={pnl} />
          </div>
          <div className="mt-0.5 font-mono text-[11px]">{s.status === "closed" ? <PnlPct value={s.returnPct} /> : <span className="text-muted">{unrealized === null ? "Realized" : "Incl. open"}</span>}</div>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="animate-fade-in border-t border-border bg-surface-2/40 px-4 py-3">
          <table className="w-full font-mono text-[12px]">
            <tbody>
              {s.fills.map((f) => (
                <tr key={f.id} className="text-muted">
                  <td className="py-1 pr-3 whitespace-nowrap">{format(new Date(f.executed_at), "MMM d, h:mm a")}</td>
                  <td className={cn("py-1 pr-3 uppercase", f.action === "buy" ? "text-fg" : "text-fg")}>{f.action}</td>
                  <td className="py-1 pr-3 text-right text-fg tabular">{fmtQty(f.quantity)}</td>
                  <td className="py-1 text-right text-fg tabular">{fmtPrice(f.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {trade.notes && <p className="mt-2 line-clamp-2 text-[13px] text-muted">{trade.notes}</p>}
          <Link href={`/trades/${trade.id}`} className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] font-medium text-fg hover:underline">
            Open trade <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </Card>
  );
}
