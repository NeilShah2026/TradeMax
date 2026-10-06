"use client";

import { JournalProvider } from "@/components/journal-provider";
import { AppShell } from "@/components/shell";
import { NewTradeDialog } from "@/components/trade-forms";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <JournalProvider>
      <AppShell>{children}</AppShell>
      <NewTradeDialog />
    </JournalProvider>
  );
}
