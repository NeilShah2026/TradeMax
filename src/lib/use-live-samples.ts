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
 * Intraday portfolio samples, taken every `interval` ms from the latest already-fetched numbers.
 * It only reads state (no fetching), so it costs no API calls. Pass `null` to pause recording.
 */
export function useLiveSamples(sample: Omit<LiveSample, "t"> | null, interval: number) {
  const [samples, setSamples] = useState<LiveSample[]>([]);
  const latest = useRef(sample);
  const recording = sample !== null;

  useEffect(() => {
    latest.current = sample;
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
    setSamples(load(dayKey(new Date())));
  }, []);

  useEffect(() => {
    if (!recording) return;
    const append = () => {
      const s = latest.current;
      if (!s) return;
      const now = Date.now();
      const day = dayKey(new Date(now));
      setSamples((prev) => {
        const today = prev.length && dayKey(new Date(prev[0].t)) === day ? prev : load(day);
        const last = today[today.length - 1];
        // Re-enabling recording right after a sample shouldn't double up
        if (last && now - last.t < interval / 3) return prev;
        const next = [...today, { t: now, ...s }].slice(-MAX);
        save(day, next);
        return next;
      });
    };
    const first = setTimeout(append, 0);
    const id = setInterval(append, interval);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [recording, interval]);

  return samples;
}
