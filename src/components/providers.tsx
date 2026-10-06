"use client";

import { ThemeProvider } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { SWRConfig } from "swr";

const PrivacyContext = createContext<{ hidden: boolean; toggle(): void }>({ hidden: false, toggle: () => {} });
export const usePrivacy = () => useContext(PrivacyContext);

const PRIVACY_KEY = "trademax-privacy";

function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let stored = false;
    try {
      stored = localStorage.getItem(PRIVACY_KEY) === "1";
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from storage after hydration
    if (stored) setHidden(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("privacy", hidden);
  }, [hidden]);

  const toggle = useCallback(() => {
    setHidden((h) => {
      try {
        localStorage.setItem(PRIVACY_KEY, h ? "0" : "1");
      } catch {}
      return !h;
    });
  }, []);

  return <PrivacyContext.Provider value={{ hidden, toggle }}>{children}</PrivacyContext.Provider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SWRConfig value={{ errorRetryCount: 2 }}>
        <PrivacyProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: "!rounded-2xl !border !border-border !bg-surface !text-fg !shadow-pop !font-sans",
                description: "!text-muted",
                actionButton: "!bg-fg !text-bg !rounded-lg",
              },
            }}
          />
        </PrivacyProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
