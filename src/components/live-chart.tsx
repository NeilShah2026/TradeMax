"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SeriesPoint } from "@/lib/calc";
import { fmtMoney } from "@/lib/format";

const POS = "var(--pos)";
const NEG = "var(--neg)";
/** Glide time constant (ms): the head and the y-range close ~63% of the gap to their target per TAU */
const TAU = 220;
/** Until this much time has passed the snake crawls out from the left instead of filling the width */
const MIN_SPAN = 2 * 60_000;
const PAD_TOP = 12;
const PAD_BOTTOM = 8;
/** Room on the right so the head dot never clips */
const PAD_RIGHT = 14;

/** Monotone cubic path (Fritsch–Carlson, as in d3's curveMonotoneX): smooth, but never overshoots the data. */
function monotonePath(xs: number[], ys: number[]) {
  const n = xs.length;
  if (!n) return "";
  if (n === 1) return `M${xs[0]},${ys[0]}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i];
    m[i] = dx[i] ? (ys[i + 1] - ys[i]) / dx[i] : 0;
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    const p = (m[i - 1] * dx[i] + m[i] * dx[i - 1]) / (dx[i - 1] + dx[i] || 1);
    t[i] = (Math.sign(m[i - 1]) + Math.sign(m[i])) * Math.min(Math.abs(m[i - 1]), Math.abs(m[i]), 0.5 * Math.abs(p)) || 0;
  }
  t[n - 1] = m[n - 2];
  let d = `M${xs[0]},${ys[0]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${xs[i] + h},${ys[i] + t[i] * h},${xs[i + 1] - h},${ys[i + 1] - t[i + 1] * h},${xs[i + 1]},${ys[i + 1]}`;
  }
  return d;
}

function nearest(points: SeriesPoint[], t: number) {
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].date.getTime() < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && t - points[lo - 1].date.getTime() < points[lo].date.getTime() - t) lo--;
  return lo;
}

/**
 * Intraday line that moves like a ticker: x is real time, so the head crawls right every frame and older
 * history compresses continuously; new values, and the y-range, glide in rather than snap. Drawn straight to
 * the SVG from a requestAnimationFrame loop so it doesn't re-render React 60 times a second.
 */
export function LiveLineChart({
  points,
  height = 260,
  onHover,
  tip,
}: {
  points: SeriesPoint[];
  height?: number;
  onHover?: (p: SeriesPoint | null) => void;
  tip: (p: SeriesPoint) => { label: string; sub?: string };
}) {
  const id = useId().replace(/:/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const fillRef = useRef<SVGPathElement>(null);
  const zeroRef = useRef<SVGLineElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const cursorRef = useRef<SVGGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  /** The green/red split stops of both gradients; they move with the $0 row */
  const splitRefs = useRef<(SVGStopElement | null)[]>([]);

  const pointsRef = useRef(points);
  const hoverRef = useRef<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      widthRef.current = e.contentRect.width;
      setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const anim = { head: null as number | null, lo: null as number | null, hi: null as number | null, last: performance.now() };
    let raf = 0;

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      const pts = pointsRef.current;
      const w = widthRef.current;
      if (!pts.length || !w) return;
      const k = reduce ? 1 : 1 - Math.exp(-(ts - anim.last) / TAU);
      anim.last = ts;

      // The newest value glides in; it's drawn on both the latest sample and the head so the line never kinks
      const target = pts[pts.length - 1].value;
      anim.head = anim.head === null ? target : anim.head + (target - anim.head) * k;

      let lo = Infinity;
      let hi = -Infinity;
      for (const p of pts) {
        if (p.value < lo) lo = p.value;
        if (p.value > hi) hi = p.value;
      }
      const pad = Math.max(hi - lo, Math.abs(hi) * 0.002, 0.5) * 0.15;
      anim.lo = anim.lo === null ? lo - pad : anim.lo + (lo - pad - anim.lo) * k;
      anim.hi = anim.hi === null ? hi + pad : anim.hi + (hi + pad - anim.hi) * k;

      const t0 = pts[0].date.getTime();
      const lastT = pts[pts.length - 1].date.getTime();
      const now = Math.max(Date.now(), lastT);
      const span = Math.max(now - t0, MIN_SPAN);
      const plotW = w - PAD_RIGHT;
      const plotH = height - PAD_TOP - PAD_BOTTOM;
      const range = anim.hi - anim.lo || 1;
      const X = (t: number) => ((t - t0) / span) * plotW;
      const Y = (v: number) => PAD_TOP + ((anim.hi! - v) / range) * plotH;

      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        xs.push(X(pts[i].date.getTime()));
        ys.push(Y(i === pts.length - 1 ? anim.head : pts[i].value));
      }
      const headX = X(now);
      const headY = Y(anim.head);
      if (headX - xs[xs.length - 1] > 0.5) {
        xs.push(headX);
        ys.push(headY);
      }

      const d = monotonePath(xs, ys);
      lineRef.current?.setAttribute("d", d);
      fillRef.current?.setAttribute("d", `${d}L${xs[xs.length - 1]},${height}L${xs[0]},${height}Z`);
      headRef.current?.setAttribute("transform", `translate(${headX},${headY})`);
      headRef.current?.style.setProperty("color", anim.head < 0 ? NEG : POS);

      // Green above $0, red below: split both gradients at the zero line's pixel row
      const y0 = Y(0);
      const split = Math.min(1, Math.max(0, y0 / height));
      splitRefs.current.forEach((s) => s?.setAttribute("offset", String(split)));
      const zero = zeroRef.current;
      if (zero) {
        const show = y0 > PAD_TOP && y0 < height - PAD_BOTTOM;
        zero.style.display = show ? "" : "none";
        if (show) {
          zero.setAttribute("y1", String(y0));
          zero.setAttribute("y2", String(y0));
        }
      }

      const hi2 = hoverRef.current;
      const cursor = cursorRef.current;
      if (cursor && tipRef.current) {
        if (hi2 === null || !pts[hi2]) {
          cursor.style.display = "none";
        } else {
          const cx = X(pts[hi2].date.getTime());
          const cy = Y(hi2 === pts.length - 1 ? anim.head : pts[hi2].value);
          cursor.style.display = "";
          cursor.setAttribute("transform", `translate(${cx},0)`);
          cursor.lastElementChild?.setAttribute("cy", String(cy));
          const tw = tipRef.current.offsetWidth;
          tipRef.current.style.transform = `translateX(${Math.min(Math.max(cx - tw / 2, 0), w - tw)}px)`;
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [height]);

  const track = (clientX: number) => {
    const el = wrapRef.current;
    const pts = pointsRef.current;
    if (!el || !pts.length) return;
    const x = clientX - el.getBoundingClientRect().left;
    const t0 = pts[0].date.getTime();
    const span = Math.max(Date.now() - t0, MIN_SPAN);
    const i = nearest(pts, t0 + (x / (widthRef.current - PAD_RIGHT)) * span);
    if (i !== hoverRef.current) {
      hoverRef.current = i;
      setHoverIdx(i);
      onHover?.(pts[i]);
    }
  };
  const leave = () => {
    hoverRef.current = null;
    setHoverIdx(null);
    onHover?.(null);
  };

  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    // pan-y keeps vertical page scrolling on phones while a horizontal drag scrubs the chart
    <div
      ref={wrapRef}
      style={{ height, touchAction: "pan-y" }}
      className="relative w-full select-none [-webkit-tap-highlight-color:transparent]"
      onPointerMove={(e) => track(e.clientX)}
      onPointerDown={(e) => track(e.clientX)}
      onPointerLeave={leave}
      onPointerCancel={leave}
      onPointerUp={(e) => e.pointerType !== "mouse" && leave()}
    >
      <svg width={width} height={height} className="block overflow-visible">
        <defs>
          <linearGradient id={`ls-${id}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={height}>
            <stop offset={0} style={{ stopColor: POS }} />
            <stop ref={(el) => void (splitRefs.current[0] = el)} offset={0.5} style={{ stopColor: POS }} />
            <stop ref={(el) => void (splitRefs.current[1] = el)} offset={0.5} style={{ stopColor: NEG }} />
            <stop offset={1} style={{ stopColor: NEG }} />
          </linearGradient>
          <linearGradient id={`lf-${id}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={height}>
            <stop offset={0} style={{ stopColor: POS, stopOpacity: 0.2 }} />
            <stop ref={(el) => void (splitRefs.current[2] = el)} offset={0.5} style={{ stopColor: POS, stopOpacity: 0.03 }} />
            <stop ref={(el) => void (splitRefs.current[3] = el)} offset={0.5} style={{ stopColor: NEG, stopOpacity: 0.03 }} />
            <stop offset={1} style={{ stopColor: NEG, stopOpacity: 0.2 }} />
          </linearGradient>
        </defs>
        <line ref={zeroRef} x1={0} x2={width} stroke="var(--border-strong)" strokeWidth={1} style={{ display: "none" }} />
        <path ref={fillRef} fill={`url(#lf-${id})`} />
        <path ref={lineRef} fill="none" stroke={`url(#ls-${id})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <g ref={cursorRef} style={{ display: "none" }} className="pointer-events-none">
          <line y1={0} y2={height} stroke="var(--border-strong)" strokeWidth={1} />
          <circle r={4.5} fill="var(--fg)" stroke="var(--surface)" strokeWidth={2} />
        </g>
        <g ref={headRef} className="pointer-events-none">
          <circle r={9} fill="currentColor" className="animate-ping opacity-40 [transform-box:fill-box] [transform-origin:center] motion-reduce:hidden" />
          <circle r={4.5} fill="currentColor" stroke="var(--surface)" strokeWidth={2} />
        </g>
      </svg>
      <div ref={tipRef} className="pointer-events-none absolute top-0 left-0" style={{ visibility: hovered ? "visible" : "hidden" }}>
        {hovered && (
          <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-pop">
            <div className="font-mono text-[10.5px] tracking-wide text-muted uppercase">{tip(hovered).label}</div>
            <div className="money mt-0.5 font-mono text-sm font-medium text-fg tabular">{fmtMoney(hovered.value, { sign: true })}</div>
            {tip(hovered).sub && <div className="mt-0.5 font-mono text-[10.5px] text-muted">{tip(hovered).sub}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
