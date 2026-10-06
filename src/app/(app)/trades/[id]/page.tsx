"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { format } from "date-fns";
import { ArrowLeft, Check, Loader2, MoreHorizontal, Pencil, Plus, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useJournal } from "@/components/journal-provider";
import { BigMoney, Money, PctPill, Pnl, PnlPct } from "@/components/money";
import { PageBody, PageHeader } from "@/components/shell";
import { TickerLogo, useProfile } from "@/components/ticker-logo";
import { EditTradeDialog, FillDialog, TagInput } from "@/components/trade-forms";
import { Button, Card, ConfirmDialog, EmptyState, SectionTitle, SideBadge, Skeleton, StatusBadge, Textarea } from "@/components/ui";
import { openingAction, sortFills, type LivePosition, type TradeSummary } from "@/lib/calc";
import { cn } from "@/lib/cn";
import { fmtDuration, fmtPct, fmtPrice, fmtQty, signClass } from "@/lib/format";
import type { Action, Fill } from "@/lib/types";

export default function TradePage() {
  const { id } = useParams<{ id: string }>();
  const j = useJournal();
  const s = j.byId.get(id);
  const live = j.open.find((p) => p.summary.trade.id === id) ?? null;

  if (j.loading) {
    return (
      <>
        <PageHeader left={<BackLink />} />
        <PageBody>
          <Skeleton className="h-40 rounded-2xl" />
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        </PageBody>
      </>
    );
  }

  if (!s) {
    return (
      <>
        <PageHeader left={<BackLink />} />
        <PageBody>
          <Card>
            <EmptyState title="Trade not found" body="It may have been deleted." action={<Link href="/trades" className="text-sm font-medium underline">Back to trades</Link>} />
          </Card>
        </PageBody>
      </>
    );
  }

  return <TradeView key={s.trade.id} s={s} live={live} />;
}

function BackLink() {
  return (
    <Link href="/trades" className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 font-mono text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg">
      <ArrowLeft className="h-3.5 w-3.5" /> Trades
    </Link>
  );
}

/** Realized P&L attributable to each closing fill (average-cost), keyed by fill id */
function perFillRealized(s: TradeSummary): Map<string, number> {
  const out = new Map<string, number>();
  const dir = s.trade.side === "long" ? 1 : -1;
  const open = openingAction(s.trade.side);
  let qty = 0;
  let avg = 0;
  for (const f of sortFills(s.trade.fills)) {
    if (f.action === open) {
      avg = (avg * qty + f.price * f.quantity) / (qty + f.quantity);
      qty += f.quantity;
    } else {
      const q = Math.min(qty, f.quantity);
      out.set(f.id, (f.price - avg) * q * dir);
      qty -= q;
    }
  }
  return out;
}

function TradeView({ s, live }: { s: TradeSummary; live: LivePosition | null }) {
  const j = useJournal();
  const router = useRouter();
  const profile = useProfile(s.trade.symbol);
  const { trade } = s;

  const [fillDialog, setFillDialog] = useState<{ open: boolean; fill: Fill | null; action?: Action; closeAll?: boolean }>({ open: false, fill: null });
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const total = s.realized + (live?.unrealized ?? 0);
  const totalCost = s.closedCost + (live?.costBasis ?? 0);
  const totalPct = totalCost > 0 ? total / totalCost : null;
  const fillPnl = useMemo(() => perFillRealized(s), [s]);
  const opener = openingAction(trade.side);

  const remove = async () => {
    setDeleting(true);
    try {
      await j.actions.deleteTrade(trade.id);
      router.push("/trades");
    } catch {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader left={<BackLink />} />
      <PageBody>
        {/* Header */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3.5">
            <TickerLogo symbol={trade.symbol} size={48} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-2xl font-semibold tracking-tight">{trade.symbol}</h1>
                <SideBadge side={trade.side} />
                <StatusBadge status={s.status} />
              </div>
              <p className="mt-0.5 truncate text-sm text-muted">
                {profile?.name ?? " "}
                {live?.quote && (
                  <>
                    {profile?.name && " · "}
                    <span className="font-mono text-fg tabular">{fmtPrice(live.quote.price)}</span>{" "}
                    <span className={cn("font-mono tabular", signClass(live.quote.changePct))}>{fmtPct(live.quote.changePct / 100, { sign: true })}</span>
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {s.status === "open" && (
              <Button variant="outline" size="sm" onClick={() => setFillDialog({ open: true, fill: null, action: opener === "buy" ? "sell" : "buy", closeAll: true })}>
                Close position
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => setFillDialog({ open: true, fill: null, action: s.status === "open" ? undefined : opener })}>
              <Plus className="h-3.5 w-3.5" /> Add fill
            </Button>
            <Dropdown.Root>
              <Dropdown.Trigger asChild>
                <Button variant="ghost" size="icon" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content align="end" sideOffset={6} className="z-50 min-w-44 animate-fade-in rounded-xl border border-border bg-surface p-1 shadow-pop">
                  <Dropdown.Item onSelect={() => setEditOpen(true)} className="flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-sm outline-none data-highlighted:bg-surface-2">
                    <Pencil className="h-3.5 w-3.5 text-muted" /> Edit symbol / side
                  </Dropdown.Item>
                  <Dropdown.Item onSelect={() => setConfirmDelete(true)} className="flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-sm text-neg outline-none data-highlighted:bg-neg-soft">
                    <Trash2 className="h-3.5 w-3.5" /> Delete trade
                  </Dropdown.Item>
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
          </div>
        </div>

        {/* P&L summary */}
        <Card className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-px overflow-hidden bg-border p-0 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="bg-surface p-5 sm:p-6">
            <div className="font-mono text-[10.5px] tracking-wide text-muted uppercase">{s.status === "open" ? "Total P&L · incl. open" : "Realized P&L"}</div>
            <div className={cn("mt-1.5 text-[32px] leading-none font-semibold tracking-tight", signClass(total))}>
              <BigMoney value={total} sign />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 font-mono text-xs">
              <PctPill value={totalPct} />
              {s.status === "open" && (
                <span className="text-muted">
                  Realized <Pnl value={s.realized} /> · Open <Pnl value={live?.unrealized ?? null} />
                </span>
              )}
              {s.status === "closed" && <span className="text-muted">held {fmtDuration(s.holdMs)}</span>}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-px bg-border">
            {s.status === "open" ? (
              <>
                <Stat label="Shares open" value={fmtQty(s.openQty)} />
                <Stat label="Avg cost" value={fmtPrice(s.avgCost)} />
                <Stat label="Market value" value={live?.marketValue == null ? "—" : <Money value={live.marketValue} />} />
                <Stat label="Day P&L" value={<Pnl value={live?.dayPnl ?? null} />} />
              </>
            ) : (
              <>
                <Stat label="Shares" value={fmtQty(s.exitQty)} />
                <Stat label="Return" value={<PnlPct value={s.returnPct} />} />
                <Stat label="Avg entry" value={fmtPrice(s.entryAvg)} />
                <Stat label="Avg exit" value={fmtPrice(s.exitAvg)} />
              </>
            )}
          </dl>
        </Card>

        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-8">
            {/* Fills */}
            <section>
              <SectionTitle
                right={
                  <span className="font-mono text-[11px] text-muted">
                    Opened {format(s.openedAt, "MMM d, yyyy")}
                    {s.closedAt && ` · Closed ${format(s.closedAt, "MMM d, yyyy")}`}
                  </span>
                }
              >
                Fills
              </SectionTitle>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left font-mono text-[10.5px] tracking-wide text-muted uppercase">
                        <th className="py-2.5 pr-3 pl-4 font-medium">Time</th>
                        <th className="px-3 py-2.5 font-medium">Action</th>
                        <th className="px-3 py-2.5 text-right font-medium">Shares</th>
                        <th className="px-3 py-2.5 text-right font-medium">Price</th>
                        <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Value</th>
                        <th className="px-3 py-2.5 text-right font-medium">Realized</th>
                        <th className="w-10 py-2.5 pr-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {s.fills.map((f) => {
                        const realized = fillPnl.get(f.id);
                        const adds = f.action === opener;
                        return (
                          <tr key={f.id} className="group border-b border-border last:border-0 hover:bg-surface-2/60">
                            <td className="py-2.5 pr-3 pl-4 font-mono text-[12px] whitespace-nowrap text-muted">{format(new Date(f.executed_at), "MMM d, yy · h:mm a")}</td>
                            <td className="px-3 py-2.5">
                              <span className={cn("inline-flex items-center gap-1.5 font-mono text-[12px] uppercase", adds ? "text-fg" : "text-fg")}>
                                <span className={cn("h-1.5 w-1.5 rounded-full", adds ? "bg-accent" : "bg-faint")} />
                                {f.action === "buy" ? (trade.side === "short" ? "Cover" : "Buy") : trade.side === "short" ? "Short" : "Sell"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular">{fmtQty(f.quantity)}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular">{fmtPrice(f.price)}</td>
                            <td className="hidden px-3 py-2.5 text-right font-mono text-[13px] text-muted tabular sm:table-cell">
                              <Money value={f.price * f.quantity} />
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-[13px]">{realized === undefined ? <span className="text-faint">—</span> : <Pnl value={realized} />}</td>
                            <td className="py-2.5 pr-3 text-right">
                              <Button variant="ghost" size="icon-sm" aria-label="Edit fill" onClick={() => setFillDialog({ open: true, fill: f })} className="opacity-60 group-hover:opacity-100">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>

            {/* Notes */}
            <NotesEditor tradeId={trade.id} initial={trade.notes} />
          </div>

          {/* Review side panel */}
          <aside className="flex flex-col gap-6">
            <section>
              <SectionTitle>Execution grade</SectionTitle>
              <Rating value={trade.rating} onChange={(rating) => j.actions.updateTrade(trade.id, { rating }, { silent: true })} />
            </section>
            <section>
              <SectionTitle>Setup</SectionTitle>
              <TagInput value={trade.setups} onChange={(setups) => j.actions.updateTrade(trade.id, { setups }, { silent: true })} suggestions={j.allSetups} placeholder="Add a setup…" />
            </section>
            <section>
              <SectionTitle>Mistakes</SectionTitle>
              <TagInput
                value={trade.mistakes}
                onChange={(mistakes) => j.actions.updateTrade(trade.id, { mistakes }, { silent: true })}
                suggestions={j.allMistakes.length ? j.allMistakes : ["FOMO entry", "Moved stop", "Sized too big", "Exited early", "No plan"]}
                placeholder="What went wrong?"
              />
              <p className="mt-2 text-xs text-muted">Analytics totals how much each mistake has cost you.</p>
            </section>
          </aside>
        </div>
      </PageBody>

      <FillDialog
        summary={s}
        fill={fillDialog.fill}
        defaultAction={fillDialog.action}
        closeAll={fillDialog.closeAll}
        open={fillDialog.open}
        onOpenChange={(open) => setFillDialog((d) => ({ ...d, open }))}
      />
      <EditTradeDialog summary={s} open={editOpen} onOpenChange={setEditOpen} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${trade.symbol} trade?`}
        body={`This removes the trade, its ${s.fills.length} ${s.fills.length === 1 ? "fill" : "fills"} and notes. This can't be undone.`}
        confirmLabel="Delete trade"
        onConfirm={remove}
        loading={deleting}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-surface px-4 py-3.5 sm:px-5">
      <dt className="font-mono text-[10.5px] tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-1 font-mono text-[15px] font-medium tabular">{value}</dd>
    </div>
  );
}

function Rating({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  const labels = ["", "Poor", "Below plan", "Okay", "Good", "Textbook"];
  return (
    <div className="flex items-center gap-3">
      <div className="flex" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(value === n ? null : n)}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg transition-transform hover:scale-110"
          >
            <Star className={cn("h-5 w-5 transition-colors", n <= shown ? "fill-accent text-accent" : "text-border-strong")} />
          </button>
        ))}
      </div>
      <span className="font-mono text-[11px] text-muted">{shown ? labels[shown] : "Not graded"}</span>
    </div>
  );
}

function NotesEditor({ tradeId, initial }: { tradeId: string; initial: string }) {
  const { actions } = useJournal();
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const saved = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = async (text: string) => {
    if (text === saved.current) return;
    setState("saving");
    try {
      await actions.updateTrade(tradeId, { notes: text }, { silent: true });
      saved.current = text;
      setState("saved");
    } catch {
      setState("idle");
    }
  };

  // Flush pending edits when leaving the page
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (latest.current !== saved.current) void actions.updateTrade(tradeId, { notes: latest.current }, { silent: true });
    },
    [actions, tradeId],
  );

  return (
    <section>
      <SectionTitle
        right={
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
            {state === "saving" && (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Saving
              </>
            )}
            {state === "saved" && (
              <>
                <Check className="h-3 w-3" /> Saved
              </>
            )}
          </span>
        }
      >
        Notes
      </SectionTitle>
      <Textarea
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          setState("idle");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => save(v), 800);
        }}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          save(value);
        }}
        placeholder="Thesis, entry reason, stop & target, how you managed it, what you'd do differently…"
        className="min-h-56 bg-surface"
      />
    </section>
  );
}
