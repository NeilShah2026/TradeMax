"use client";

import { format } from "date-fns";
import { useId, useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint } from "@/lib/calc";
import { cn } from "@/lib/cn";
import { fmtMoney, fmtPct } from "@/lib/format";

const POS = "var(--pos)";
const NEG = "var(--neg)";

function ChartTip({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-pop">
      <div className="font-mono text-[10.5px] tracking-wide text-muted uppercase">{label}</div>
      <div className="money mt-0.5 font-mono text-sm font-medium text-fg tabular">{fmtMoney(value, { sign: true })}</div>
      {sub && <div className="mt-0.5 font-mono text-[10.5px] text-muted">{sub}</div>}
    </div>
  );
}

/** Where 0 sits within [min, max], as a gradient offset from the top */
function zeroOffset(values: number[]) {
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  if (max <= 0) return 0;
  if (min >= 0) return 1;
  return max / (max - min);
}

/** Cumulative P&L area. Line and wash turn red below zero. */
export function PnlAreaChart({ points, height = 260, onHover }: { points: SeriesPoint[]; height?: number; onHover?: (p: SeriesPoint | null) => void }) {
  const id = useId().replace(/:/g, "");
  const values = points.map((p) => p.value);
  const off = zeroOffset(values);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const pad = (max - min || 1) * 0.08;
  const crossesZero = min < 0 && max > 0;
  // The stroke gradient spans the line's own bounding box, so split it on the data range (not the 0-padded domain)
  const dataMax = Math.max(...values);
  const dataMin = Math.min(...values);
  const lineOff = dataMax - dataMin > 0 ? dataMax / (dataMax - dataMin) : 1;
  const stroke = dataMin >= 0 ? POS : dataMax <= 0 ? NEG : `url(#stroke-${id})`;
  const track = (i: number | string | null | undefined) => onHover?.(i === undefined || i === null ? null : (points[Number(i)] ?? null));

  return (
    // pan-y keeps vertical page scrolling on phones while a horizontal drag scrubs the chart
    <div style={{ height, touchAction: "pan-y" }} className="w-full select-none [-webkit-tap-highlight-color:transparent]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={points}
          margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
          onMouseMove={(s) => track(s?.activeTooltipIndex)}
          onTouchStart={(s) => track(s?.activeTooltipIndex)}
          onTouchMove={(s) => track(s?.activeTooltipIndex)}
          onMouseLeave={() => onHover?.(null)}
          onTouchEnd={() => onHover?.(null)}
        >
          <defs>
            <linearGradient id={`stroke-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={POS} />
              <stop offset={lineOff} stopColor={POS} />
              <stop offset={lineOff} stopColor={NEG} />
              <stop offset={1} stopColor={NEG} />
            </linearGradient>
            <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={POS} stopOpacity={0.2} />
              <stop offset={off} stopColor={POS} stopOpacity={0.03} />
              <stop offset={off} stopColor={NEG} stopOpacity={0.03} />
              <stop offset={1} stopColor={NEG} stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <XAxis dataKey="key" hide />
          <YAxis hide domain={[min - pad, max + pad]} />
          {crossesZero && <ReferenceLine y={0} stroke="var(--border-strong)" strokeWidth={1} />}
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = active && payload?.[0]?.payload as SeriesPoint | undefined;
              if (!p) return null;
              return (
                <ChartTip
                  label={p.live ? `Today · ${format(p.date, "MMM d")}` : format(p.date, "EEE, MMM d yyyy")}
                  value={p.value}
                  sub={`Day ${fmtMoney(p.daily, { sign: true })}`}
                />
              );
            }}
          />
          <Area
            type="linear"
            dataKey="value"
            baseValue={0}
            stroke={stroke}
            strokeWidth={2}
            fill={`url(#fill-${id})`}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={false}
            activeDot={{ r: 4.5, fill: "var(--fg)", stroke: "var(--surface)", strokeWidth: 2 }}
            animationDuration={500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface BarDatum {
  key: string;
  label: string;
  value: number;
  sub?: string;
}

// Bar with a 4px rounded data-end and a square baseline
function DivergingBar(props: { x?: number; y?: number; width?: number; height?: number; payload?: BarDatum }) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  const h = Math.abs(height);
  const top = height < 0 ? y + height : y;
  if (h < 0.5 || width <= 0) return null;
  const positive = (payload?.value ?? 0) >= 0;
  const r = Math.min(4, h, width / 2);
  const d = positive
    ? `M${x},${top + h} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + width - r},${top} Q${x + width},${top} ${x + width},${top + r} L${x + width},${top + h} Z`
    : `M${x},${top} L${x + width},${top} L${x + width},${top + h - r} Q${x + width},${top + h} ${x + width - r},${top + h} L${x + r},${top + h} Q${x},${top + h} ${x},${top + h - r} Z`;
  return <path d={d} fill={positive ? POS : NEG} />;
}

/** Vertical P&L columns growing up (gain) or down (loss) from zero. */
export function PnlColumns({ data, height = 260, showAxis = false }: { data: BarDatum[]; height?: number; showAxis?: boolean }) {
  const hasNeg = data.some((d) => d.value < 0);
  return (
    <div style={{ height }} className="w-full select-none">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
          <XAxis
            dataKey="label"
            hide={!showAxis}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            tickMargin={8}
          />
          <YAxis hide domain={hasNeg ? ["auto", "auto"] : [0, "auto"]} />
          <ReferenceLine y={0} stroke="var(--border-strong)" strokeWidth={1} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)", radius: 6 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = active && (payload?.[0]?.payload as BarDatum | undefined);
              if (!p) return null;
              return <ChartTip label={p.label} value={p.value} sub={p.sub} />;
            }}
          />
          <Bar dataKey="value" maxBarSize={24} shape={DivergingBar} animationDuration={400} minPointSize={2} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal diverging bar list — for breakdowns by ticker, setup, weekday… */
export function BarList({
  rows,
  emptyLabel = "No data yet",
  className,
}: {
  rows: { key: string; label: React.ReactNode; value: number; count: number; winRate: number | null }[];
  emptyLabel?: string;
  className?: string;
}) {
  const maxAbs = useMemo(() => Math.max(...rows.map((r) => Math.abs(r.value)), 1), [rows]);
  const hasNeg = rows.some((r) => r.value < 0);
  const hasPos = rows.some((r) => r.value > 0);
  const split = hasNeg && hasPos;

  if (!rows.length) return <p className="py-8 text-center text-sm text-muted">{emptyLabel}</p>;

  return (
    <ul className={cn("flex flex-col", className)}>
      {rows.map((r) => {
        const pct = (Math.abs(r.value) / maxAbs) * 100;
        const pos = r.value >= 0;
        return (
          <li key={r.key} className="group grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2 sm:grid-cols-[minmax(0,9rem)_1fr_auto]">
            <div className="min-w-0">
              <div className="truncate text-[13px] text-fg">{r.label}</div>
              <div className="font-mono text-[10.5px] text-muted">
                {r.count} {r.count === 1 ? "trade" : "trades"}
                {r.winRate !== null && ` · ${fmtPct(r.winRate, { digits: 0 })} win`}
              </div>
            </div>
            <div className={cn("relative h-4", split && "grid grid-cols-2")}>
              {split ? (
                <>
                  <div className="flex justify-end border-r border-border-strong">
                    {!pos && <span className="h-4 rounded-l-[4px] bg-neg" style={{ width: `${pct}%` }} />}
                  </div>
                  <div className="flex justify-start">{pos && <span className="h-4 rounded-r-[4px] bg-pos" style={{ width: `${pct}%` }} />}</div>
                </>
              ) : (
                <div className={cn("flex h-4", hasNeg ? "justify-end border-r border-border-strong" : "justify-start border-l border-border-strong")}>
                  <span className={cn("h-4", pos ? "rounded-r-[4px] bg-pos" : "rounded-l-[4px] bg-neg")} style={{ width: `${Math.max(pct, 1)}%` }} />
                </div>
              )}
            </div>
            <div className="money min-w-[5.5rem] text-right font-mono text-[13px] text-fg tabular">{fmtMoney(r.value, { sign: true })}</div>
          </li>
        );
      })}
    </ul>
  );
}
