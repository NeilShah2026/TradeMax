"use client";

import { BarChart3 } from "lucide-react";
import { useMemo } from "react";
import { BarList, PnlColumns } from "@/components/charts";
import { useJournal } from "@/components/journal-provider";
import { Pnl } from "@/components/money";
import { PageBody, PageHeader } from "@/components/shell";
import { Card, EmptyState, SectionTitle, Segmented, Skeleton } from "@/components/ui";
import { computeStats, groupBy, HOLD_BUCKETS, holdBucket, WEEKDAYS, type Group } from "@/lib/calc";
import { cn } from "@/lib/cn";
import { fmtDuration, fmtMoney, fmtNumber, fmtPct } from "@/lib/format";
import { rangeStart, type RangeKey } from "@/lib/ranges";
import { usePersistentState } from "@/lib/use-persistent";

const RANGE_OPTS: RangeKey[] = ["1M", "3M", "YTD", "1Y", "ALL"];

const toRows = (groups: Group[]) => groups.map((g) => ({ key: g.key, label: g.key, value: g.pnl, count: g.count, winRate: g.winRate }));

export default function AnalyticsPage() {
  const j = useJournal();
  const [range, setRange] = usePersistentState<RangeKey>("analytics-range", "ALL", RANGE_OPTS);

  const closed = useMemo(() => {
    const start = rangeStart(range);
    return start ? j.closed.filter((s) => s.closedAt! >= start) : j.closed;
  }, [j.closed, range]);

  const stats = useMemo(() => computeStats(closed), [closed]);

  const data = useMemo(() => {
    const bySymbol = toRows(groupBy(closed, (s) => [s.trade.symbol]).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, 10));
    const bySetup = toRows(groupBy(closed, (s) => (s.trade.setups.length ? s.trade.setups : ["Untagged"])).sort((a, b) => b.pnl - a.pnl));
    const byMistake = toRows(groupBy(closed, (s) => s.trade.mistakes).sort((a, b) => a.pnl - b.pnl));
    const weekdayMap = new Map(groupBy(closed, (s) => [WEEKDAYS[(s.closedAt!.getDay() + 6) % 7] ?? "Weekend"]).map((g) => [g.key, g]));
    const byWeekday = WEEKDAYS.map((d) => weekdayMap.get(d) ?? { key: d, pnl: 0, count: 0, wins: 0, winRate: null });
    const holdMap = new Map(groupBy(closed, (s) => [holdBucket(s.holdMs)]).map((g) => [g.key, g]));
    const byHold = HOLD_BUCKETS.filter((b) => holdMap.has(b)).map((b) => holdMap.get(b)!);
    const bySide = groupBy(closed, (s) => [s.trade.side === "long" ? "Long" : "Short"]);
    const byGrade = groupBy(
      closed.filter((s) => s.trade.rating),
      (s) => [`${"★".repeat(s.trade.rating!)}`],
    ).sort((a, b) => b.key.length - a.key.length);

    // Distribution of trade results in buckets
    const values = closed.map((s) => s.realized);
    let dist: { key: string; label: string; value: number; sub: string }[] = [];
    if (values.length) {
      const sorted = [...closed].sort((a, b) => a.closedAt!.getTime() - b.closedAt!.getTime());
      dist = sorted.map((s, i) => ({ key: s.trade.id, label: `#${i + 1} ${s.trade.symbol}`, value: s.realized, sub: s.closedAt!.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) }));
    }
    return { bySymbol, bySetup, byMistake, byWeekday: toRows(byWeekday), byHold: toRows(byHold), bySide: toRows(bySide), byGrade: toRows(byGrade), dist };
  }, [closed]);

  const mistakeCost = data.byMistake.reduce((a, r) => a + Math.min(0, r.value), 0);

  return (
    <>
      <PageHeader
        title="Analytics"
        left={
          <Segmented
            size="sm"
            value={range}
            onChange={setRange}
            ariaLabel="Range"
            options={RANGE_OPTS.map((r) => ({ value: r, label: r === "ALL" ? "All" : r }))}
          />
        }
      />
      <PageBody>
        {j.loading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : !closed.length ? (
          <Card>
            <EmptyState icon={<BarChart3 className="h-5 w-5" />} title="No closed trades in this range" body="Analytics are calculated from closed trades. Close a position or widen the range." />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
              <Tile label="Net realized" value={<Pnl value={stats.net} />} sub={`${stats.count} closed trades`} />
              <Tile label="Win rate" value={fmtPct(stats.winRate, { digits: 1 })} sub={`${stats.wins} wins · ${stats.losses} losses${stats.breakeven ? ` · ${stats.breakeven} flat` : ""}`} meter={stats.winRate} />
              <Tile label="Profit factor" value={fmtNumber(stats.profitFactor)} sub="gross win ÷ gross loss" />
              <Tile label="Expectancy" value={<Pnl value={stats.expectancy} />} sub="average per trade" />
              <Tile label="Avg win" value={<Pnl value={stats.avgWin} />} sub={`held ${fmtDuration(stats.avgHoldWin)}`} />
              <Tile label="Avg loss" value={<Pnl value={stats.avgLoss} />} sub={`held ${fmtDuration(stats.avgHoldLoss)}`} />
              <Tile label="Largest win / loss" value={<span className="money">{stats.largestWin === null ? "—" : fmtMoney(stats.largestWin, { sign: true, whole: true })} / {stats.largestLoss === null ? "—" : fmtMoney(stats.largestLoss, { whole: true })}</span>} sub={`Payoff ratio ${fmtNumber(stats.payoff)}`} />
              <Tile label="Max drawdown" value={<Pnl value={-stats.maxDrawdown} />} sub={`Streaks: ${stats.bestStreak}W best · ${stats.worstStreak}L worst`} />
            </div>

            <section className="mt-8">
              <SectionTitle right={<span className="font-mono text-[11px] text-muted">each bar is one closed trade</span>}>Trade results</SectionTitle>
              <Card className="px-3 pt-4 pb-2 sm:px-5">
                <PnlColumns data={data.dist} height={200} />
              </Card>
            </section>

            <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-2">
              <Breakdown title="By symbol" note="top 10 by size" rows={data.bySymbol} />
              <Breakdown title="By setup" rows={data.bySetup} empty="Tag trades with a setup to compare strategies" />
              <Breakdown
                title="Mistakes"
                note={mistakeCost < 0 ? <span className="money">cost {fmtMoney(mistakeCost)}</span> : undefined}
                rows={data.byMistake}
                empty="No mistakes tagged — or you're very disciplined"
              />
              <Breakdown title="By weekday" note="by close date" rows={data.byWeekday} />
              <Breakdown title="By hold time" rows={data.byHold} />
              <div className="flex flex-col gap-8">
                <Breakdown title="Long vs short" rows={data.bySide} />
                {data.byGrade.length > 0 && <Breakdown title="By execution grade" rows={data.byGrade} />}
              </div>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}

function Tile({ label, value, sub, meter }: { label: string; value: React.ReactNode; sub?: string; meter?: number | null }) {
  return (
    <div className="bg-surface px-4 py-3.5 sm:px-5">
      <div className="font-mono text-[10.5px] tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1 truncate font-mono text-lg font-semibold tracking-tight tabular">{value}</div>
      {meter !== undefined && meter !== null && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-neg-soft">
          <div className="h-full rounded-full bg-pos" style={{ width: `${meter * 100}%` }} />
        </div>
      )}
      {sub && <div className={cn("truncate font-mono text-[11px] text-muted", meter == null ? "mt-0.5" : "mt-1.5")}>{sub}</div>}
    </div>
  );
}

function Breakdown({ title, note, rows, empty }: { title: string; note?: React.ReactNode; rows: ReturnType<typeof toRows>; empty?: string }) {
  return (
    <section className="min-w-0">
      <SectionTitle right={note && <span className="font-mono text-[11px] text-muted">{note}</span>}>{title}</SectionTitle>
      <Card className="p-2">
        <BarList rows={rows} emptyLabel={empty} />
      </Card>
    </section>
  );
}
