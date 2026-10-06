# TradeMax

A personal trading journal: log trades as you take them, track live P&L on open positions, take notes, and see where your edge comes from.

**Stack:** Next.js 16 (App Router) · Supabase (auth + Postgres with row-level security) · Finnhub (live quotes) · Tailwind 4 · Recharts

## Setup

1. **Database** — paste [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) into the Supabase SQL editor and run it.
2. **Keys** — fill in `.env.local` (see `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Project Settings → API
   - `FINNHUB_API_KEY` — free at finnhub.io
   - `TRADEMAX_EMAIL`, `TRADEMAX_PASSWORD` — your login
3. **Create your login** — `npm run create-user` (re-run any time to reset the password to what's in `.env.local`).
4. **Run** — `npm run dev` → http://localhost:3000

> After editing `.env.local`, **restart the dev server** — `NEXT_PUBLIC_*` values are baked in when it starts.

Without Supabase keys the app runs in **demo mode** (sample data in your browser, simulated prices, no login).

## How it works

- A **trade** is one position in one symbol (long or short). Its **fills** are the individual buys/sells — scale in, take partials, close.
- P&L uses **average-cost** accounting. Status, average cost, realized and unrealized P&L are all derived from the fills, so editing a fill recalculates everything.
- Live prices refresh every 15s while the market is open (60/min Finnhub free tier; slower with 10+ positions, every 2 min when closed). The API key stays on the server.
- The **P&L curve is marked to market daily**: each trading day = realized P&L to date + every position you held that night valued at that day's close (daily closes from Yahoo Finance, since Finnhub's free tier has no history). The last point uses live quotes for the current session, so the "Today"/"Mon" chip always equals the curve's last step. The **calendar** shows realized P&L by the day you closed.
- **On your phone:** open the site and use *Add to Home Screen* — it launches full-screen like an app. Drag across the chart to scrub, swipe the calendar to change months.

| Page | What's there |
|---|---|
| Dashboard | Total P&L (realized + open), daily mark-to-market chart (cumulative or day-by-day bars) with ranges, key stats, recent trades, positions |
| Trades | Searchable, filterable, sortable log of every trade |
| Trade | Fills (add / edit / delete), close position, notes (autosave), setup & mistake tags, execution grade |
| Positions | Open positions at live prices, day P&L, weights, one-click close |
| Analytics | Win rate, profit factor, expectancy, drawdown, streaks; P&L by symbol, setup, mistake, weekday, hold time, side, grade |
| Calendar | Monthly P&L heatmap with weekly totals; click a day to see its trades |

**Shortcuts:** `N` opens New trade. The eye icon blurs every dollar amount (for screen-sharing).

## Deploying to Vercel

Import the repo, add the same variables from `.env.local` in Project → Settings → Environment Variables (the service-role key and `TRADEMAX_*` aren't needed there), and deploy.
