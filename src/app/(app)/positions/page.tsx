"use client";

import { Briefcase } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useJournal } from "@/components/journal-provider";
import { Money, PctPill, Pnl } from "@/components/money";
import { PageBody, PageHeader } from "@/components/shell";
import { TickerLogo } from "@/components/ticker-logo";
import { FillDialog } from "@/components/trade-forms";
import { Button, Card, EmptyState, SideBadge, Skeleton } from "@/components/ui";
import type { LivePosition } from "@/lib/calc";
import { cn } from "@/lib/cn";
import { fmtPct, fmtPrice, fmtQty, signClass } from "@/lib/format";

export default function PositionsPage() {
  const j = useJournal();
  const router = useRouter();
  const [closing, setClosing] = useState<LivePosition | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);

  const gross = j.open.reduce((a, p) => a + Math.abs(p.marketValue ?? p.costBasis), 0);
  const cost = j.open.reduce((a, p) => a + p.costBasis, 0);

  return (
    <>
      <PageHeader title="Positions" />
      <PageBody>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
          <Tile label="Market value" value={<Money value={j.marketValue} />} sub={`${j.open.length} ${j.open.length === 1 ? "position" : "positions"}`} />
          <Tile label="Cost basis" value={<Money value={cost} />} />
          <Tile label="Open P&L" value={<Pnl value={j.unrealized} />} sub={cost > 0 ? fmtPct(j.unrealized / cost, { sign: true }) : undefined} subClass={signClass(j.unrealized)} />
          <Tile label="Today" value={<Pnl value={j.dayPnl} />} sub="realized + open" />
        </div>

        <Card className="mt-6 overflow-hidden">
          {j.loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : !j.open.length ? (
            <EmptyState
              icon={<Briefcase className="h-5 w-5" />}
              title="No open positions"
              body="Trades you haven't fully closed appear here with live prices."
              action={<Button variant="primary" size="sm" onClick={() => j.newTrade.start()}>New trade</Button>}
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left font-mono text-[10.5px] tracking-wide text-muted uppercase">
                      <th className="py-3 pr-3 pl-5 font-medium">Symbol</th>
                      <th className="px-3 py-3 text-right font-medium">Shares</th>
                      <th className="px-3 py-3 text-right font-medium">Avg cost</th>
                      <th className="px-3 py-3 text-right font-medium">Last</th>
                      <th className="px-3 py-3 text-right font-medium">Day</th>
                      <th className="px-3 py-3 text-right font-medium">Mkt value</th>
                      <th className="px-3 py-3 text-right font-medium">Open P&L</th>
                      <th className="px-3 py-3 font-medium">Weight</th>
                      <th className="py-3 pr-5" />
                    </tr>
                  </thead>
                  <tbody>
                    {j.open.map((p) => {
                      const weight = gross > 0 ? Math.abs(p.marketValue ?? p.costBasis) / gross : 0;
                      return (
                        <tr key={p.summary.trade.id} onClick={() => router.push(`/trades/${p.summary.trade.id}`)} className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2/70">
                          <td className="py-3 pr-3 pl-5">
                            <div className="flex items-center gap-2.5">
                              <TickerLogo symbol={p.summary.trade.symbol} size={30} />
                              <span className="font-mono text-[13px] font-semibold">{p.summary.trade.symbol}</span>
                              <SideBadge side={p.summary.trade.side} />
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-[13px] tabular">{fmtQty(p.summary.openQty)}</td>
                          <td className="px-3 py-3 text-right font-mono text-[13px] tabular">{fmtPrice(p.summary.avgCost)}</td>
                          <td className="px-3 py-3 text-right font-mono text-[13px] tabular">{fmtPrice(p.price)}</td>
                          <td className={cn("px-3 py-3 text-right font-mono text-[12px] tabular", signClass(p.quote?.changePct))}>{p.quote ? fmtPct(p.quote.changePct / 100, { sign: true }) : "—"}</td>
                          <td className="px-3 py-3 text-right font-mono text-[13px]">{p.marketValue === null ? "—" : <Money value={p.marketValue} />}</td>
                          <td className="px-3 py-3 text-right font-mono text-[13px]">
                            <div className="flex items-center justify-end gap-2">
                              <Pnl value={p.unrealized} />
                              <PctPill value={p.unrealizedPct} />
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                                <div className="h-full rounded-full bg-accent" style={{ width: `${weight * 100}%` }} />
                              </div>
                              <span className="font-mono text-[11px] text-muted tabular">{fmtPct(weight, { digits: 0 })}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-5 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setClosing(p);
                                setCloseOpen(true);
                              }}
                            >
                              Close
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-border md:hidden">
                {j.open.map((p) => (
                  <li key={p.summary.trade.id} className="flex items-center gap-3 px-4 py-3">
                    <button type="button" onClick={() => router.push(`/trades/${p.summary.trade.id}`)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                      <TickerLogo symbol={p.summary.trade.symbol} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{p.summary.trade.symbol}</span>
                          <SideBadge side={p.summary.trade.side} />
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-muted">
                          {fmtQty(p.summary.openQty)} @ {fmtPrice(p.summary.avgCost)} · {fmtPrice(p.price)}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-[13px]">{p.marketValue === null ? "—" : <Money value={p.marketValue} />}</div>
                        <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[11px]">
                          <Pnl value={p.unrealized} />
                        </div>
                      </div>
                    </button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setClosing(p);
                        setCloseOpen(true);
                      }}
                    >
                      Close
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        {j.quoteStatus === "off" && (
          <p className="mt-3 text-center text-xs text-muted">
            Live prices are off. Add <code className="font-mono text-fg">FINNHUB_API_KEY</code> to <code className="font-mono text-fg">.env.local</code> and restart.
          </p>
        )}
      </PageBody>

      {closing && <FillDialog summary={closing.summary} open={closeOpen} onOpenChange={setCloseOpen} closeAll defaultAction={closing.summary.trade.side === "long" ? "sell" : "buy"} />}
    </>
  );
}

function Tile({ label, value, sub, subClass }: { label: string; value: React.ReactNode; sub?: string; subClass?: string }) {
  return (
    <div className="bg-surface px-4 py-3.5 sm:px-5">
      <div className="font-mono text-[10.5px] tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight tabular">{value}</div>
      {sub && <div className={cn("mt-0.5 font-mono text-[11px] text-muted", subClass)}>{sub}</div>}
    </div>
  );
}
