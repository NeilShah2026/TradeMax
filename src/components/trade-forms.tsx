"use client";

import { Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { closingAction, openingAction, validateFills, type TradeSummary } from "@/lib/calc";
import { cn } from "@/lib/cn";
import { fmtMoney, fmtPct, fmtPrice, fmtQty, signClass, toLocalInput } from "@/lib/format";
import type { Action, Fill, Side } from "@/lib/types";
import { useJournal, useQuotes } from "./journal-provider";
import { Money } from "./money";
import { TickerLogo } from "./ticker-logo";
import { Button, Chip, ConfirmDialog, Dialog, Field, Input, Segmented, Textarea } from "./ui";

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,11}$/;

// ---------- Tag input ----------

export function TagInput({ value, onChange, suggestions, placeholder }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[]; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!t) return;
    if (!value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const rest = suggestions.filter((s) => !value.includes(s) && s.toLowerCase().includes(draft.toLowerCase())).slice(0, 8);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface px-2 py-1.5 transition-[border,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
        {value.map((t) => (
          <Chip key={t} onRemove={() => onChange(value.filter((x) => x !== t))}>
            {t}
          </Chip>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => add(draft)}
          placeholder={value.length ? "" : placeholder}
          className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-faint"
        />
      </div>
      {rest.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {rest.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(s)}
              className="h-6 cursor-pointer rounded-lg border border-dashed border-border-strong px-2 text-xs text-muted transition-colors hover:border-solid hover:bg-surface-2 hover:text-fg"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Symbol input with search ----------

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function SymbolInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(query.trim(), 250);
  const { data } = useSWR(open && debounced.length >= 1 ? ["search", debounced] : null, async ([, q]: [string, string]) => {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    return res.ok ? ((await res.json()).results as { symbol: string; name: string }[]) : [];
  });
  const results = (data ?? []).filter((r) => r.symbol !== value || query !== value).slice(0, 5);
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input
          id={id}
          autoFocus={autoFocus}
          value={query}
          placeholder="AAPL"
          autoComplete="off"
          spellCheck={false}
          className="pl-9 font-mono uppercase placeholder:normal-case"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            const v = e.target.value.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
            setQuery(v);
            onChange(v);
            setOpen(true);
          }}
        />
      </div>
      {open && results.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {results.map((r) => (
            <button
              key={r.symbol}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQuery(r.symbol);
                onChange(r.symbol);
                setOpen(false);
              }}
              className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2"
            >
              <TickerLogo symbol={r.symbol} size={24} />
              <span className="font-mono text-sm font-medium">{r.symbol}</span>
              <span className="truncate text-xs text-muted">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function QuoteLine({ symbol, onUse }: { symbol: string; onUse: (price: number) => void }) {
  const valid = SYMBOL_RE.test(symbol);
  const { quotes, status } = useQuotes(valid ? [symbol] : []);
  const q = quotes[symbol];
  if (!valid) return null;
  if (!q) {
    return <p className="text-xs text-muted">{status === "off" ? "Live prices are off — add FINNHUB_API_KEY to .env.local." : status === "loading" ? "Fetching price…" : "No live price for this symbol."}</p>;
  }
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted">
        Last <span className="font-mono text-fg tabular">{fmtPrice(q.price)}</span>{" "}
        <span className={cn("font-mono tabular", signClass(q.changePct))}>{fmtPct(q.changePct / 100, { sign: true })}</span> today
      </span>
      <button type="button" onClick={() => onUse(q.price)} className="cursor-pointer font-mono text-[11px] font-medium text-accent hover:underline">
        Use market price
      </button>
    </div>
  );
}

// ---------- Number field helpers ----------

const parseNum = (s: string) => {
  const n = Number(s.replace(/[,$\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

function NumberInput({ value, onChange, placeholder, prefix, id }: { value: string; onChange: (v: string) => void; placeholder?: string; prefix?: string; id?: string }) {
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-sm text-faint">{prefix}</span>}
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ""))}
        className={cn("font-mono tabular", prefix && "pl-7")}
      />
    </div>
  );
}

// ---------- New trade ----------

export function NewTradeDialog() {
  const { newTrade, actions, allSetups } = useJournal();
  const router = useRouter();
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<Side>("long");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [when, setWhen] = useState(() => toLocalInput(new Date()));
  const [setups, setSetups] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  // Reset the form each time the dialog opens (render-time state sync)
  const [lastOpen, setLastOpen] = useState(false);
  if (newTrade.open !== lastOpen) {
    setLastOpen(newTrade.open);
    if (newTrade.open) {
      const p = newTrade.preset;
      setSymbol(p?.symbol ?? "");
      setSide(p?.side ?? "long");
      setQty(p?.fill?.quantity ? String(p.fill.quantity) : "");
      setPrice(p?.fill?.price ? String(p.fill.price) : "");
      setWhen(toLocalInput(new Date()));
      setSetups(p?.setups ?? []);
      setNotes("");
      setError(null);
      setFormKey((k) => k + 1);
    }
  }

  const q = parseNum(qty);
  const p = parseNum(price);
  const total = q > 0 && p >= 0 ? q * p : 0;

  const submit = async () => {
    const sym = symbol.trim().toUpperCase();
    if (!SYMBOL_RE.test(sym)) return setError("Enter a valid ticker symbol.");
    if (!(q > 0)) return setError("Quantity must be greater than 0.");
    if (!(p > 0)) return setError("Price must be greater than 0.");
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) return setError("Pick a valid date and time.");
    setError(null);
    setSaving(true);
    try {
      const id = await actions.createTrade({
        symbol: sym,
        side,
        setups,
        mistakes: [],
        notes: notes.trim(),
        fill: { action: openingAction(side), quantity: q, price: p, executed_at: date.toISOString() },
      });
      newTrade.setOpen(false);
      toast.success(`${side === "long" ? "Bought" : "Shorted"} ${fmtQty(q)} ${sym}`, {
        action: { label: "Open", onClick: () => router.push(`/trades/${id}`) },
      });
    } catch {
      // toast already shown
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={newTrade.open}
      onOpenChange={newTrade.setOpen}
      title="New trade"
      description="Log an entry. Add scale-ins, partial exits and the close from the trade page."
      footer={
        <>
          <span className="mr-auto font-mono text-xs text-muted">
            Size <Money value={total} className="text-fg" />
          </span>
          <Button variant="ghost" onClick={() => newTrade.setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            Log trade
          </Button>
        </>
      }
    >
      <form
        key={formKey}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Symbol">
          <SymbolInput value={symbol} onChange={setSymbol} autoFocus={!newTrade.preset?.symbol} />
          <QuoteLine symbol={symbol} onUse={(v) => setPrice(String(v))} />
        </Field>
        <Field label="Direction">
          <Segmented
            value={side}
            onChange={setSide}
            className="w-full"
            options={[
              { value: "long", label: "Long · Buy" },
              { value: "short", label: "Short · Sell" },
            ]}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Shares">
            <NumberInput value={qty} onChange={setQty} placeholder="100" />
          </Field>
          <Field label="Price">
            <NumberInput value={price} onChange={setPrice} placeholder="0.00" prefix="$" />
          </Field>
        </div>
        <Field label="Date & time">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="font-mono text-[13px]" />
        </Field>
        <Field label="Setup" hint="Enter to add">
          <TagInput value={setups} onChange={setSetups} suggestions={allSetups} placeholder="Breakout, Pullback…" />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why are you taking this trade? Where's your stop and target?" />
        </Field>
        {error && <p className="rounded-xl bg-neg-soft px-3 py-2 text-sm text-neg">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

// ---------- Add / edit fill ----------

export function FillDialog({
  summary,
  fill,
  defaultAction,
  open,
  onOpenChange,
  closeAll,
}: {
  summary: TradeSummary;
  fill?: Fill | null;
  defaultAction?: Action;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill the full remaining quantity at market — used by "Close position" */
  closeAll?: boolean;
}) {
  const { actions } = useJournal();
  const { trade } = summary;
  const opener = openingAction(trade.side);
  const closer = closingAction(trade.side);
  const { quotes } = useQuotes(open ? [trade.symbol] : [], { [trade.symbol]: summary.avgCost || summary.entryAvg });
  const live = quotes[trade.symbol]?.price ?? null;

  const [action, setAction] = useState<Action>(closer);
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceTouched, setPriceTouched] = useState(false);

  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setError(null);
      setPriceTouched(false);
      if (fill) {
        setAction(fill.action);
        setQty(String(fill.quantity));
        setPrice(String(fill.price));
        setWhen(toLocalInput(new Date(fill.executed_at)));
      } else {
        const a = defaultAction ?? closer;
        setAction(a);
        setQty(closeAll || a === closer ? String(summary.openQty || "") : "");
        setPrice(live ? String(live) : "");
        setWhen(toLocalInput(new Date()));
      }
    }
  }

  // Fill in the market price once the quote arrives, unless the user already typed one
  if (open && !fill && !priceTouched && live && price !== String(live)) {
    setPrice(String(live));
  }

  const q = parseNum(qty);
  const p = parseNum(price);
  const dir = trade.side === "long" ? 1 : -1;
  const isClosing = action === closer;
  const estPnl = !fill && isClosing && q > 0 && p > 0 && summary.avgCost > 0 ? (p - summary.avgCost) * Math.min(q, summary.openQty) * dir : null;

  const labels: Record<Action, string> =
    trade.side === "long" ? { buy: "Buy · add", sell: "Sell · reduce" } : { sell: "Short · add", buy: "Cover · reduce" };

  const submit = async () => {
    if (!(q > 0)) return setError("Quantity must be greater than 0.");
    if (!(p > 0)) return setError("Price must be greater than 0.");
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) return setError("Pick a valid date and time.");
    const next = { action, quantity: q, price: p, executed_at: date.toISOString() };
    const others = summary.fills.filter((f) => f.id !== fill?.id);
    const problem = validateFills(trade.side, [...others, { ...next, created_at: fill?.created_at ?? new Date().toISOString() }]);
    if (problem) return setError(problem);
    setError(null);
    setSaving(true);
    try {
      if (fill) await actions.updateFill(fill.id, next);
      else await actions.addFill(trade.id, next);
      onOpenChange(false);
    } catch {
      // toast shown
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!fill) return;
    const others = summary.fills.filter((f) => f.id !== fill.id);
    const problem = validateFills(trade.side, others);
    if (problem) {
      setConfirmDelete(false);
      return setError(others.length ? `Can't delete this fill: ${problem}` : "This is the only fill — delete the whole trade instead.");
    }
    setSaving(true);
    try {
      await actions.deleteFill(fill.id);
      setConfirmDelete(false);
      onOpenChange(false);
    } catch {
      // toast shown
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={fill ? "Edit fill" : closeAll ? `Close ${trade.symbol}` : `Add fill · ${trade.symbol}`}
        description={
          summary.openQty > 0 ? (
            <>
              Holding <span className="font-mono text-fg">{fmtQty(summary.openQty)}</span> {trade.side === "short" ? "short " : ""}@ <span className="font-mono text-fg">{fmtPrice(summary.avgCost)}</span> avg
            </>
          ) : (
            "Position is flat."
          )
        }
        className="sm:max-w-md"
        footer={
          <>
            {fill && (
              <Button variant="ghost" className="mr-auto text-neg hover:bg-neg-soft hover:text-neg" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
            {!fill && estPnl !== null && (
              <span className="mr-auto font-mono text-xs text-muted">
                Est. P&L <span className={signClass(estPnl)}>{fmtMoney(estPnl, { sign: true })}</span>
              </span>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} loading={saving}>
              {fill ? "Save" : closeAll ? "Close position" : "Add fill"}
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Action">
            <Segmented
              value={action}
              onChange={(a) => {
                setAction(a);
                if (!fill && a === closer && !qty) setQty(String(summary.openQty || ""));
              }}
              className="w-full"
              options={[
                { value: opener, label: labels[opener] },
                { value: closer, label: labels[closer] },
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Shares"
              hint={
                isClosing && summary.openQty > 0 && !fill ? (
                  <button type="button" onClick={() => setQty(String(summary.openQty))} className="cursor-pointer font-mono text-[11px] text-accent hover:underline">
                    All {fmtQty(summary.openQty)}
                  </button>
                ) : undefined
              }
            >
              <NumberInput value={qty} onChange={setQty} placeholder="0" />
            </Field>
            <Field
              label="Price"
              hint={
                live ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPriceTouched(true);
                      setPrice(String(live));
                    }}
                    className="cursor-pointer font-mono text-[11px] text-accent hover:underline">
                    Mkt {fmtPrice(live)}
                  </button>
                ) : undefined
              }
            >
              <NumberInput
                value={price}
                onChange={(v) => {
                  setPriceTouched(true);
                  setPrice(v);
                }}
                placeholder="0.00"
                prefix="$"
              />
            </Field>
          </div>
          <Field label="Date & time">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="font-mono text-[13px]" />
          </Field>
          {error && <p className="rounded-xl bg-neg-soft px-3 py-2 text-sm text-neg">{error}</p>}
          <button type="submit" className="hidden" />
        </form>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this fill?"
        body="P&L for this trade will be recalculated. This can't be undone."
        onConfirm={remove}
        loading={saving}
      />
    </>
  );
}

// ---------- Edit trade (symbol / direction) ----------

export function EditTradeDialog({ summary, open, onOpenChange }: { summary: TradeSummary; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { actions } = useJournal();
  const [symbol, setSymbol] = useState(summary.trade.symbol);
  const [side, setSide] = useState<Side>(summary.trade.side);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setSymbol(summary.trade.symbol);
      setSide(summary.trade.side);
      setError(null);
    }
  }
  const sideChanged = side !== summary.trade.side;
  // Flipping direction flips every fill's action so the trade stays coherent
  const flipped = useMemo(() => summary.fills.map((f) => ({ ...f, action: (f.action === "buy" ? "sell" : "buy") as Action })), [summary.fills]);

  const submit = async () => {
    const sym = symbol.trim().toUpperCase();
    if (!SYMBOL_RE.test(sym)) return setError("Enter a valid ticker symbol.");
    setSaving(true);
    try {
      if (sideChanged) {
        const problem = validateFills(side, flipped);
        if (problem) throw new Error(problem);
        for (const f of flipped) await actions.updateFill(f.id, { action: f.action, quantity: f.quantity, price: f.price, executed_at: f.executed_at });
      }
      await actions.updateTrade(summary.trade.id, { symbol: sym, side });
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit trade"
      className="sm:max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Symbol">
          <SymbolInput value={symbol} onChange={setSymbol} />
        </Field>
        <Field label="Direction">
          <Segmented
            value={side}
            onChange={setSide}
            className="w-full"
            options={[
              { value: "long", label: "Long" },
              { value: "short", label: "Short" },
            ]}
          />
        </Field>
        {sideChanged && <p className="text-xs text-muted">Every fill&apos;s buy/sell will be flipped to match the new direction.</p>}
        {error && <p className="rounded-xl bg-neg-soft px-3 py-2 text-sm text-neg">{error}</p>}
      </div>
    </Dialog>
  );
}
