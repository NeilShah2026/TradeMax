const money2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const moneyCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

export function fmtMoney(v: number, opts: { sign?: boolean; compact?: boolean; whole?: boolean } = {}): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const body = opts.compact && abs >= 10_000 ? moneyCompact.format(abs) : opts.whole ? money0.format(abs) : money2.format(abs);
  const isZero = abs < 0.005;
  if (v < 0 && !isZero) return `-${body}`;
  if (opts.sign && !isZero) return `+${body}`;
  return body;
}

export function fmtPct(v: number | null | undefined, opts: { sign?: boolean; digits?: number } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const digits = opts.digits ?? 2;
  const body = `${Math.abs(v * 100).toFixed(digits)}%`;
  if (v < 0 && Math.abs(v * 100) >= 0.5 * 10 ** -digits) return `-${body}`;
  if (opts.sign && v > 0) return `+${body}`;
  return body;
}

export function fmtPrice(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const digits = Math.abs(v) < 1 && v !== 0 ? 4 : 2;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

export function fmtQty(v: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(v);
}

export function fmtNumber(v: number | null, digits = 2): string {
  if (v === null || !Number.isFinite(v)) return v === Infinity ? "∞" : "—";
  return v.toFixed(digits);
}

export function fmtDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days}d ${hours % 24}h`;
  return `${Math.round(days / 30)}mo`;
}

export function signClass(v: number | null | undefined): string {
  if (v === null || v === undefined || Math.abs(v) < 0.005) return "text-muted";
  return v > 0 ? "text-pos" : "text-neg";
}

/** Value for a <input type="datetime-local"> in local time */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
