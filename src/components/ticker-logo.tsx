"use client";

import { useState } from "react";
import useSWR from "swr";
import { cn } from "@/lib/cn";
import type { Profile } from "@/lib/types";

const fetchProfile = async (symbol: string): Promise<Profile> => {
  const res = await fetch(`/api/profile?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) return { symbol, name: null, logo: null };
  return res.json();
};

export function useProfile(symbol: string | null) {
  const { data } = useSWR(symbol ? ["profile", symbol] : null, ([, s]: [string, string]) => fetchProfile(s), {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    dedupingInterval: 3_600_000,
  });
  return data ?? null;
}

// Stable warm-ish hue per symbol for the fallback monogram
function hue(symbol: string) {
  let h = 0;
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function TickerLogo({ symbol, size = 32, className }: { symbol: string; size?: number; className?: string }) {
  const profile = useProfile(symbol);
  const [broken, setBroken] = useState<string | null>(null);
  const logo = profile?.logo && broken !== profile.logo ? profile.logo : null;
  const h = hue(symbol);

  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-surface", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote logos from many hosts; tiny and cached
        <img src={logo} alt="" width={size} height={size} className="h-full w-full object-cover" onError={() => setBroken(logo)} loading="lazy" />
      ) : (
        <span
          className="monogram grid h-full w-full place-items-center font-mono font-semibold"
          style={{ fontSize: Math.max(9, size * 0.32), ["--h" as string]: h }}
        >
          {symbol.slice(0, symbol.length > 3 ? 2 : 3)}
        </span>
      )}
    </span>
  );
}
