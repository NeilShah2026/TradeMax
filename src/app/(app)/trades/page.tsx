"use client";

import { format } from "date-fns";
import { ArrowDown, ArrowUp, BookOpen, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useJournal } from "@/components/journal-provider";
import { Pnl, PnlPct } from "@/components/money";
import { PageBody, PageHeader } from "@/components/shell";
import { TickerLogo } from "@/components/ticker-logo";
import { Button, Card, Chip, EmptyState, Input, Segmented, SideBadge, Skeleton, StatusBadge } from "@/components/ui";
import type { TradeSummary } from "@/lib/calc";
import { cn } from "@/lib/cn";
import { fmtPct, fmtPrice, fmtQty } from "@/lib/format";

type StatusFilter = "all" | "open" | "closed";
type SideFilter = "all" | "long" | "short";
type SortKey = "date" | "symbol" | "pnl" | "return";

interface Row {
  s: TradeSummary;
  pnl: number;
  ret: number | null;
  date: Date;
}

export default function TradesPage() {
  const j = useJournal();
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [side, setSide] = useState<SideFilter>("all");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });

  const tags = useMemo(() => [...new Set([...j.allSetups, ...j.allMistakes])], [j.allSetups, j.allMistakes]);

  const rows = useMemo<Row[]>(() => {
    const live = new Map(j.open.map((p) => [p.summary.trade.id, p]));
    const q = query.trim().toUpperCase();
    const out = j.summaries
      .filter((s) => status === "all" || s.status === status)
      .filter((s) => side === "all" || s.trade.side === side)
      .filter((s) => !q || s.trade.symbol.includes(q) || s.trade.notes.toUpperCase().includes(q))
      .filter((s) => !tag || s.trade.setups.includes(tag) || s.trade.mistakes.includes(tag))
      .map((s) => {
        const lp = live.get(s.trade.id);
        const pnl = s.realized + (lp?.unrealized ?? 0);
        const ret = s.status === "closed" ? s.returnPct : lp?.unrealizedPct ?? null;
        return { s, pnl, ret, date: s.status === "closed" ? s.closedAt! : s.openedAt };
      });
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      date: (a, b) => a.s.lastActivity.getTime() - b.s.lastActivity.getTime(),
      symbol: (a, b) => a.s.trade.symbol.localeCompare(b.s.trade.symbol),
      pnl: (a, b) => a.pnl - b.pnl,
      return: (a, b) => (a.ret ?? -Infinity) - (b.ret ?? -Infinity),
    };
    return out.sort((a, b) => cmp[sort.key](a, b) * sort.dir);
  }, [j.summaries, j.open, status, side, query, tag, sort]);

  const totals = useMemo(() => {
    const closed = rows.filter((r) => r.s.status === "closed");
    const wins = closed.filter((r) => r.pnl > 0.005).length;
    const losses = closed.filter((r) => r.pnl < -0.005).length;
    return { pnl: rows.reduce((a, r) => a + r.pnl, 0), winRate: wins + losses ? wins / (wins + losses) : null };
  }, [rows]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "symbol" ? 1 : -1 }));
  const filtered = status !== "all" || side !== "all" || !!query || !!tag;

  return (
    <>
      <PageHeader title="Trades" />
      <PageBody>
        {/* Filters */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative lg:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search symbol or notes" className="h-9 pl-9" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              size="sm"
              value={status}
              onChange={setStatus}
              ariaLabel="Status"
              options={[
                { value: "all", label: "All" },
                { value: "open", label: "Open" },
                { value: "closed", label: "Closed" },
              ]}
            />
            <Segmented
              size="sm"
              value={side}
              onChange={setSide}
              ariaLabel="Direction"
              options={[
                { value: "all", label: "Both" },
                { value: "long", label: "Long" },
                { value: "short", label: "Short" },
              ]}
            />
            {filtered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatus("all");
                  setSide("all");
                  setQuery("");
                  setTag(null);
                }}
              >
                <X className="h-3.5 w-3.5" /> Reset
              </Button>
            )}
          </div>
          <div className="flex items-center gap-4 font-mono text-xs lg:ml-auto">
            <span className="text-muted">
              {rows.length} {rows.length === 1 ? "trade" : "trades"}
            </span>
            <span className="text-muted">
              Win <span className="text-fg">{fmtPct(totals.winRate, { digits: 0 })}</span>
            </span>
            <span className="text-muted">
              Net <Pnl value={totals.pnl} />
            </span>
          </div>
        </div>
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.slice(0, 16).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTag(tag === t ? null : t)}
                className={cn(
                  "h-6 cursor-pointer rounded-lg border px-2 text-xs transition-colors",
                  tag === t ? "border-fg bg-fg text-bg" : "border-border text-muted hover:bg-surface-2 hover:text-fg",
                  j.allMistakes.includes(t) && tag !== t && "border-dashed",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        <Card className="mt-5 overflow-hidden">
          {j.loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-11" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-5 w-5" />}
              title={j.summaries.length ? "No trades match these filters" : "No trades yet"}
              body={j.summaries.length ? "Try clearing a filter." : "Log your first trade and it will show up here."}
              action={!j.summaries.length && <Button variant="primary" size="sm" onClick={() => j.newTrade.start()}>New trade</Button>}
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left font-mono text-[10.5px] tracking-wide text-muted uppercase">
                      <SortTh label="Symbol" k="symbol" sort={sort} onSort={toggleSort} className="pl-5" />
                      <th className="px-3 py-3 font-medium">Status</th>
                      <SortTh label="Date" k="date" sort={sort} onSort={toggleSort} />
                      <th className="px-3 py-3 text-right font-medium">Shares</th>
                      <th className="px-3 py-3 text-right font-medium">Entry</th>
                      <th className="px-3 py-3 text-right font-medium">Exit</th>
                      <SortTh label="P&L" k="pnl" sort={sort} onSort={toggleSort} right />
                      <SortTh label="Return" k="return" sort={sort} onSort={toggleSort} right />
                      <th className="px-3 py-3 pr-5 font-medium">Setup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ s, pnl, ret, date }) => (
                      <tr
                        key={s.trade.id}
                        onClick={() => router.push(`/trades/${s.trade.id}`)}
                        className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-surface-2/70"
                      >
                        <td className="px-3 py-2.5 pl-5">
                          <div className="flex items-center gap-2.5">
                            <TickerLogo symbol={s.trade.symbol} size={28} />
                            <span className="font-mono text-[13px] font-semibold">{s.trade.symbol}</span>
                            <SideBadge side={s.trade.side} />
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={s.status} />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[12px] whitespace-nowrap text-muted">{format(date, "MMM d, yyyy")}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular">{fmtQty(s.status === "open" ? s.openQty : s.exitQty)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular">{fmtPrice(s.entryAvg)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-[13px] text-muted tabular">{s.exitAvg === null ? "—" : <span className="text-fg">{fmtPrice(s.exitAvg)}</span>}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-[13px] font-medium">
                          <Pnl value={pnl} />
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-[12px]">
                          <PnlPct value={ret} />
                        </td>
                        <td className="px-3 py-2.5 pr-5">
                          <div className="flex max-w-48 flex-wrap gap-1">
                            {s.trade.setups.slice(0, 2).map((t) => (
                              <Chip key={t} className="h-5 text-[11px]">
                                {t}
                              </Chip>
                            ))}
                            {s.trade.mistakes.length > 0 && <Chip className="h-5 border-dashed text-[11px] text-neg">{s.trade.mistakes.length} mistake{s.trade.mistakes.length > 1 ? "s" : ""}</Chip>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile list */}
              <ul className="divide-y divide-border md:hidden">
                {rows.map(({ s, pnl, ret, date }) => (
                  <li key={s.trade.id}>
                    <button type="button" onClick={() => router.push(`/trades/${s.trade.id}`)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
                      <TickerLogo symbol={s.trade.symbol} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{s.trade.symbol}</span>
                          <SideBadge side={s.trade.side} />
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-muted">
                          {s.status === "open" ? "Open" : "Closed"} · {format(date, "MMM d")} · {fmtQty(s.status === "open" ? s.openQty : s.exitQty)} sh
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-sm font-medium">
                          <Pnl value={pnl} />
                        </div>
                        <div className="text-[11px]">
                          <PnlPct value={ret} />
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        {rows.some((r) => r.s.status === "open") && <p className="mt-3 text-center font-mono text-[11px] text-muted">P&L on open trades includes unrealized gains at the live price.</p>}
      </PageBody>
    </>
  );
}

function SortTh({ label, k, sort, onSort, right, className }: { label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; right?: boolean; className?: string }) {
  const active = sort.key === k;
  const Icon = sort.dir === 1 ? ArrowUp : ArrowDown;
  return (
    <th className={cn("px-3 py-3 font-medium", right && "text-right", className)} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex cursor-pointer items-center gap-1 uppercase hover:text-fg", active && "text-fg")}>
        {label}
        <Icon className={cn("h-3 w-3", !active && "opacity-0")} />
      </button>
    </th>
  );
}
