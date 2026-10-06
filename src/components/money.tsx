import { cn } from "@/lib/cn";
import { fmtMoney, fmtPct, signClass } from "@/lib/format";

/** A dollar amount that blurs in privacy mode. */
export function Money({ value, sign, compact, whole, className }: { value: number; sign?: boolean; compact?: boolean; whole?: boolean; className?: string }) {
  return <span className={cn("money tabular", className)}>{fmtMoney(value, { sign, compact, whole })}</span>;
}

/** Signed, colored P&L amount */
export function Pnl({ value, className, compact }: { value: number | null; className?: string; compact?: boolean }) {
  if (value === null) return <span className={cn("text-muted", className)}>—</span>;
  return <Money value={value} sign compact={compact} className={cn(signClass(value), className)} />;
}

export function PnlPct({ value, className }: { value: number | null; className?: string }) {
  return <span className={cn("tabular", signClass(value), className)}>{fmtPct(value, { sign: true })}</span>;
}

/** Soft tinted pill with a percent (like the holdings list in the reference design) */
export function PctPill({ value, className }: { value: number | null; className?: string }) {
  const tone = value === null || Math.abs(value) < 0.00005 ? "bg-surface-3 text-muted" : value > 0 ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg";
  return <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 font-mono text-[11px] font-medium tabular", tone, className)}>{fmtPct(value, { sign: true })}</span>;
}

/** Big headline amount where cents are de-emphasized: $664,735.94 */
export function BigMoney({ value, sign, className }: { value: number; sign?: boolean; className?: string }) {
  const s = fmtMoney(value, { sign });
  const dot = s.lastIndexOf(".");
  return (
    <span className={cn("money tabular", className)}>
      {s.slice(0, dot)}
      <span className="text-muted">{s.slice(dot)}</span>
    </span>
  );
}
