"use client";

import { BarChart3, BookOpen, Briefcase, CalendarDays, Eye, EyeOff, LayoutGrid, LogOut, Monitor, Moon, Plus, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { isDemo } from "@/lib/repo";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useJournal, type QuoteStatus } from "./journal-provider";
import { LogoMark } from "./logo";
import { usePrivacy } from "./providers";
import { Button } from "./ui";

export const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/trades", label: "Trades", icon: BookOpen },
  { href: "/positions", label: "Positions", icon: Briefcase },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
];

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

const useMounted = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

function ThemeButton({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const order = ["system", "light", "dark"] as const;
  const current = mounted ? ((theme as (typeof order)[number]) ?? "system") : "system";
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;
  const next = order[(order.indexOf(current) + 1) % order.length];
  return (
    <SideButton label={`Theme: ${current}`} onClick={() => setTheme(next)} className={className}>
      <Icon className="h-[18px] w-[18px]" />
    </SideButton>
  );
}

function SideButton({ label, children, onClick, className }: { label: string; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn("group relative grid h-10 w-10 cursor-pointer place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-fg", className)}
    >
      {children}
      <Tip>{label}</Tip>
    </button>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-full z-50 ml-3 hidden rounded-lg md:block bg-fg px-2 py-1 font-mono text-[11px] whitespace-nowrap text-bg opacity-0 shadow-pop transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
      {children}
    </span>
  );
}

async function signOut(router: ReturnType<typeof useRouter>) {
  await getBrowserSupabase().auth.signOut();
  router.replace("/login");
  router.refresh();
}

function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { newTrade } = useJournal();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[68px] shrink-0 flex-col items-center py-4 md:flex">
      <Link href="/" aria-label="TradeMax home" className="mb-5 rounded-full transition-transform hover:scale-105">
        <LogoMark size={34} />
      </Link>
      <button
        type="button"
        onClick={() => newTrade.start()}
        aria-label="New trade"
        className="group relative mb-4 grid h-10 w-10 cursor-pointer place-items-center rounded-xl bg-fg text-bg shadow-card transition-opacity hover:opacity-90"
      >
        <Plus className="h-[18px] w-[18px]" />
        <Tip>
          New trade <span className="opacity-60">· N</span>
        </Tip>
      </button>
      <nav className="flex flex-col items-center gap-1.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative grid h-10 w-10 place-items-center rounded-xl transition-colors",
                active ? "border border-border bg-surface text-fg shadow-card" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.1 : 1.8} />
              <Tip>{label}</Tip>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-1.5">
        <ThemeButton />
        {!isDemo && (
          <SideButton label="Sign out" onClick={() => signOut(router)}>
            <LogOut className="h-[18px] w-[18px]" />
          </SideButton>
        )}
      </div>
    </aside>
  );
}

function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} className={cn("flex h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium", active ? "text-fg" : "text-muted")}>
              <Icon className="h-5 w-5" strokeWidth={active ? 2.1 : 1.7} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function MobileTopBar() {
  const router = useRouter();
  const mounted = useMounted();
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/85 px-4 backdrop-blur-xl md:hidden">
      <Link href="/" className="flex items-center gap-2">
        <LogoMark size={28} />
        <span className="text-[15px] font-semibold tracking-tight">TradeMax</span>
      </Link>
      <div className="flex items-center gap-1">
        <MobileStatus />
        <PrivacyButton />
        <ThemeButton className="h-9 w-9" />
        {mounted && !isDemo && (
          <SideButton label="Sign out" onClick={() => signOut(router)} className="h-9 w-9">
            <LogOut className="h-[18px] w-[18px]" />
          </SideButton>
        )}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { newTrade } = useJournal();

  // "N" opens the new-trade dialog from anywhere (unless typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        newTrade.start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newTrade]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col md:py-2 md:pr-2">
        <MobileTopBar />
        <main className="min-h-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:h-[calc(100dvh-1rem)] md:overflow-y-auto md:rounded-2xl md:border md:border-border md:bg-surface md:pb-0 md:shadow-card">
          {isDemo && <DemoBanner />}
          {children}
        </main>
      </div>
      <MobileNav />
      <button
        type="button"
        onClick={() => newTrade.start()}
        aria-label="New trade"
        className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 grid h-13 w-13 cursor-pointer place-items-center rounded-full bg-fg text-bg shadow-pop transition-transform active:scale-95 md:hidden"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

function MobileStatus() {
  const { quoteStatus } = useJournal();
  return (
    <span className="px-2">
      <LiveDot status={quoteStatus} />
    </span>
  );
}

function DemoBanner() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-border bg-surface-2 px-4 py-2 text-center text-xs text-muted">
      <span className="font-mono font-medium tracking-wide text-fg uppercase">Demo mode</span>
      <span>Sample data stored in this browser. Add your Supabase keys to <code className="font-mono text-fg">.env.local</code> to use your real journal.</span>
    </div>
  );
}

// ---------- Page header ----------

export function LiveDot({ status }: { status: QuoteStatus }) {
  const map: Record<QuoteStatus, { label: string; dot: string; pulse?: boolean }> = {
    loading: { label: "Connecting", dot: "bg-faint" },
    live: { label: "Live", dot: "bg-pos", pulse: true },
    closed: { label: "Market closed", dot: "bg-faint" },
    off: { label: "Prices off · add FINNHUB_API_KEY", dot: "bg-neg" },
    demo: { label: "Simulated prices", dot: "bg-accent", pulse: true },
    error: { label: "Price feed error", dot: "bg-neg" },
  };
  const m = map[status];
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] text-muted" title={m.label}>
      <span className="relative flex h-2 w-2">
        {m.pulse && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", m.dot)} />}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", m.dot)} />
      </span>
      <span className="hidden sm:inline">{m.label}</span>
    </span>
  );
}

export function PrivacyButton() {
  const { hidden, toggle } = usePrivacy();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={hidden ? "Show amounts" : "Hide amounts"} title={hidden ? "Show amounts" : "Hide amounts"}>
      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </Button>
  );
}

export function PageHeader({ title, left, right }: { title?: string; left?: ReactNode; right?: ReactNode }) {
  const { quoteStatus, newTrade } = useJournal();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-6 md:px-8 md:pt-5">
      <div className="flex min-w-0 items-center gap-3">
        {title && <h1 className="text-lg font-semibold tracking-tight">{title}</h1>}
        {left}
      </div>
      <div className="hidden items-center gap-1.5 md:flex">
        {right}
        <LiveDot status={quoteStatus} />
        <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
        <PrivacyButton />
        <Button variant="primary" size="sm" onClick={() => newTrade.start()} className="ml-1">
          <Plus className="h-3.5 w-3.5" />
          <span>New trade</span>
        </Button>
      </div>
    </div>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-4 py-5 sm:px-6 md:px-8 md:py-6", className)}>{children}</div>;
}
