"use client";

import { useEffect, useRef, useState } from "react";
import { dayKey } from "./calc";

export interface LiveSample {
  /** epoch ms */
  t: number;
  /** portfolio market value */
  value: number;
  /** open positions' P&L for the day */
  pnl: number;
}

const PREFIX = "trademax:live-samples:";
// A full session at one sample per 15s is ~1,560 points
const MAX = 2_000;

function load(day: string): LiveSample[] {
  try {
    const raw = localStorage.getItem(PREFIX + day);
    return raw ? (JSON.parse(raw) as LiveSample[]) : [];
  } catch {
    return [];
  }
}

function save(day: string, samples: LiveSample[]) {
  try {
    // Only today's samples are kept
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX) && k !== PREFIX + day) localStorage.removeItem(k);
    }
    localStorage.setItem(PREFIX + day, JSON.stringify(samples));
  } catch {}
}

/**
 * Intraday portfolio samples, one per landed quote fetch. `tick` is when that fetch landed; the hook only
 * reads already-fetched numbers, so it costs no API calls. Pass `sample = null` to pause recording.
 */
export function useLiveSamples(tick: number | null, sample: Omit<LiveSample, "t"> | null) {
  const [samples, setSamples] = useState<LiveSample[]>([]);
  const latest = useRef(sample);

  useEffect(() => {
    latest.current = sample;
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
    setSamples(load(dayKey(new Date())));
  }, []);

  useEffect(() => {
    if (!tick) return;
    // The fetch-landed signal can render before the new prices do; wait a tick so `latest` holds them
    const id = setTimeout(() => {
      const s = latest.current;
      if (!s) return;
      const day = dayKey(new Date(tick));
      setSamples((prev) => {
        const today = prev.length && dayKey(new Date(prev[0].t)) === day ? prev : load(day);
        const last = today[today.length - 1];
        if (last && tick <= last.t) return prev;
        const next = [...today, { t: tick, ...s }].slice(-MAX);
        save(day, next);
        return next;
      });
    }, 0);
    return () => clearTimeout(id);
  }, [tick]);

  return samples;
}
