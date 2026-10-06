"use client";

import { useCallback, useEffect, useState } from "react";

/** useState that remembers its value in localStorage (per browser; best-effort). */
export function usePersistentState<T extends string>(key: string, initial: T, allowed?: readonly T[]) {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`trademax:${key}`) as T | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
      if (stored && (!allowed || allowed.includes(stored))) setValue(stored);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(`trademax:${key}`, v);
      } catch {}
    },
    [key],
  );

  return [value, set] as const;
}
