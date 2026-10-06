"use client";

import { addMonths, endOfMonth, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useJournal } from "@/components/journal-provider";
import { Money, Pnl } from "@/components/money";
import { PageBody, PageHeader } from "@/components/shell";
import { TickerLogo } from "@/components/ticker-logo";
import { Button, Card, EmptyState, SectionTitle, SideBadge, Skeleton } from "@/components/ui";
import { dayKey } from "@/lib/calc";
import { cn } from "@/lib/cn";
import { fmtMoney, fmtQty, fmtShortMoney } from "@/lib/format";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const noopSubscribe = () => () => {};

export default function CalendarPage() {
  // "Today" depends on the viewer's clock, so render the calendar only in the browser
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) {
    return (
      <>
        <PageHeader title="Calendar" />
        <PageBody>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-4 h-[520px] rounded-2xl" />
        </PageBody>
      </>
    );
  }
  return <CalendarView />;
}

function CalendarView() {
  const j = useJournal();
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<string | null>(() => dayKey(new Date()));

  const byDay = useMemo(() => new Map(j.daily.map((d) => [d.key, d])), [j.daily]);

  const weeks = useMemo(() => {
    const first = startOfWeek(startOfMonth(month));
    const last = endOfMonth(month);
    const out: Date[][] = [];
    const cur = new Date(first);
    while (cur <= last) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
      out.push(week);
    }
    return out;
  }, [month]);

  const monthStats = useMemo(() => {
    const days = j.daily.filter((d) => isSameMonth(d.date, month));
    const maxAbs = Math.max(...days.map((d) => Math.abs(d.pnl)), 1);
    return {
      net: days.reduce((a, d) => a + d.pnl, 0),
      green: days.filter((d) => d.pnl > 0.005).length,
      red: days.filter((d) => d.pnl < -0.005).length,
      trades: new Set(days.flatMap((d) => d.tradeIds)).size,
      maxAbs,
    };
  }, [j.daily, month]);

  const todayKey = dayKey(new Date());

  const dayDetail = useMemo(() => {
    if (!selected) return null;
    const rows = j.summaries
      .map((s) => ({ s, events: s.events.filter((e) => dayKey(e.date) === selected) }))
      .filter((r) => r.events.length)
      .map((r) => ({ ...r, pnl: r.events.reduce((a, e) => a + e.pnl, 0), qty: r.events.reduce((a, e) => a + e.quantity, 0) }));
    const opened = j.summaries.filter((s) => dayKey(s.openedAt) === selected && !rows.some((r) => r.s.trade.id === s.trade.id));
    return { rows, opened, total: rows.reduce((a, r) => a + r.pnl, 0) };
  }, [selected, j.summaries]);

  const tint = (pnl: number) => {
    const t = Math.min(1, Math.abs(pnl) / monthStats.maxAbs);
    const pct = Math.round(14 + t * 46);
    return { background: `color-mix(in oklab, ${pnl >= 0 ? "var(--pos)" : "var(--neg)"} ${pct}%, var(--surface))` };
  };

  return (
    <>
      <PageHeader title="Calendar" />
      <PageBody>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="min-w-36 text-center text-base font-semibold tracking-tight">{format(month, "MMMM yyyy")}</h2>
            <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isSameMonth(month, new Date()) && (
              <Button variant="secondary" size="sm" className="ml-1" onClick={() => setMonth(startOfMonth(new Date()))}>
                Today
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs text-muted">
            <span>
              Month <Pnl value={monthStats.net} className="font-medium" />
            </span>
            <span>
              <span className="text-pos">{monthStats.green}</span> green · <span className="text-neg">{monthStats.red}</span> red days
            </span>
            <span>{monthStats.trades} trades closed</span>
          </div>
        </div>

        {j.loading ? (
          <Skeleton className="mt-4 h-[520px] rounded-2xl" />
        ) : (
          <Card
            className="mt-4 overflow-hidden"
            onTouchStart={(e) => {
              touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }}
            onTouchEnd={(e) => {
              const t = touch.current;
              touch.current = null;
              if (!t) return;
              const dx = e.changedTouches[0].clientX - t.x;
              const dy = e.changedTouches[0].clientY - t.y;
              // a deliberate horizontal swipe changes month
              if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) setMonth((m) => addMonths(m, dx < 0 ? 1 : -1));
            }}
          >
            <div className="grid grid-cols-7 border-b border-border md:grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,0.9fr)]">
              {DOW.map((d) => (
                <div key={d} className="px-2 py-2.5 text-center font-mono text-[10.5px] tracking-wide text-muted uppercase sm:text-left sm:px-3">
                  {d}
                </div>
              ))}
              <div className="hidden px-3 py-2.5 font-mono text-[10.5px] tracking-wide text-muted uppercase md:block">Week</div>
            </div>
            {weeks.map((week, wi) => {
              const weekDays = week.map((d) => byDay.get(dayKey(d))).filter(Boolean);
              const weekPnl = weekDays.reduce((a, d) => a + d!.pnl, 0);
              const weekTrades = new Set(weekDays.flatMap((d) => d!.tradeIds)).size;
              return (
                <div key={wi} className="grid grid-cols-7 border-b border-border last:border-0 md:grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,0.9fr)]">
                  {week.map((d) => {
                    const k = dayKey(d);
                    const info = byDay.get(k);
                    const inMonth = isSameMonth(d, month);
                    const isSel = selected === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setSelected(k)}
                        aria-pressed={isSel}
                        aria-label={`${format(d, "MMMM d")}${info ? `, ${fmtMoney(info.pnl, { sign: true })}` : ""}`}
                        className={cn(
                          "relative flex aspect-square cursor-pointer flex-col items-start border-r border-border p-1.5 text-left transition-colors outline-none sm:aspect-auto sm:h-[92px] sm:p-2.5",
                          !inMonth && "opacity-35",
                          !info && "hover:bg-surface-2",
                          "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                        style={info && inMonth ? tint(info.pnl) : undefined}
                      >
                        {isSel && <span className="pointer-events-none absolute inset-0.5 rounded-lg ring-2 ring-fg" />}
                        <span className={cn("font-mono text-[11px]", k === todayKey ? "grid h-5 w-5 place-items-center rounded-full bg-fg font-semibold text-bg" : "text-muted")}>{d.getDate()}</span>
                        {info && (
                          <span className="mt-auto w-full">
                            <span className="money block truncate font-mono text-[10px] font-semibold text-fg tabular sm:hidden">{fmtShortMoney(info.pnl)}</span>
                            <span className="money hidden truncate font-mono text-[13px] font-semibold text-fg tabular sm:block">{fmtMoney(info.pnl, { sign: true, compact: true, whole: Math.abs(info.pnl) >= 1000 })}</span>
                            <span className="hidden font-mono text-[10.5px] text-fg/70 sm:block">
                              {info.tradeIds.length} {info.tradeIds.length === 1 ? "trade" : "trades"}
                            </span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <div className="hidden flex-col justify-end bg-surface-2/50 p-2.5 md:flex">
                    {weekTrades > 0 && (
                      <>
                        <Pnl value={weekPnl} className="font-mono text-[13px] font-semibold" />
                        <span className="font-mono text-[10.5px] text-muted">
                          {weekTrades} {weekTrades === 1 ? "trade" : "trades"}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        )}

        {/* Selected day */}
        {selected && dayDetail && (
          <section className="mt-8">
            <SectionTitle right={dayDetail.rows.length > 0 && <Pnl value={dayDetail.total} className="font-mono text-sm font-semibold" />}>
              {format(new Date(selected + "T00:00:00"), "EEEE, MMMM d")}
            </SectionTitle>
            {dayDetail.rows.length === 0 && dayDetail.opened.length === 0 ? (
              <Card>
                <EmptyState title="No activity this day" body="Pick a colored day to see the trades that closed." className="py-8" />
              </Card>
            ) : (
              <Card className="divide-y divide-border overflow-hidden">
                {dayDetail.rows.map(({ s, pnl, qty }) => (
                  <Link key={s.trade.id} href={`/trades/${s.trade.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/70">
                    <TickerLogo symbol={s.trade.symbol} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{s.trade.symbol}</span>
                        <SideBadge side={s.trade.side} />
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
                        Closed {fmtQty(qty)} sh{s.trade.setups.length ? ` · ${s.trade.setups.join(", ")}` : ""}
                      </div>
                    </div>
                    <Pnl value={pnl} className="font-mono text-sm font-medium" />
                  </Link>
                ))}
                {dayDetail.opened.map((s) => (
                  <Link key={s.trade.id} href={`/trades/${s.trade.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/70">
                    <TickerLogo symbol={s.trade.symbol} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{s.trade.symbol}</span>
                        <SideBadge side={s.trade.side} />
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-muted">Opened {fmtQty(s.entryQty)} sh</div>
                    </div>
                    <span className="font-mono text-[12px] text-muted">
                      <Money value={s.entryAvg * s.entryQty} /> in
                    </span>
                  </Link>
                ))}
              </Card>
            )}
          </section>
        )}
      </PageBody>
    </>
  );
}
