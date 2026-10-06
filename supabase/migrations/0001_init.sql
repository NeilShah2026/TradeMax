-- TradeMax schema. Paste into the Supabase SQL editor (or run with `supabase db push`).
-- A trade is a position in one symbol; its fills (executions) are the individual buys/sells.
-- Status, average cost and P&L are derived from the fills in the app, so nothing here can drift.

create extension if not exists pgcrypto;

create table if not exists public.trades (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol      text not null check (symbol = upper(symbol) and length(symbol) between 1 and 12),
  side        text not null check (side in ('long', 'short')),
  setups      text[] not null default '{}',
  mistakes    text[] not null default '{}',
  notes       text not null default '',
  rating      smallint check (rating between 1 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.executions (
  id           uuid primary key default gen_random_uuid(),
  trade_id     uuid not null references public.trades (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action       text not null check (action in ('buy', 'sell')),
  quantity     numeric(20, 6) not null check (quantity > 0),
  price        numeric(20, 6) not null check (price >= 0),
  executed_at  timestamptz not null,
  created_at   timestamptz not null default now()
);

create index if not exists trades_user_idx on public.trades (user_id);
create index if not exists executions_trade_idx on public.executions (trade_id, executed_at);
create index if not exists executions_user_idx on public.executions (user_id);

-- Keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trades_touch on public.trades;
create trigger trades_touch before update on public.trades
  for each row execute function public.touch_updated_at();

-- Row level security: every row belongs to exactly one user and only they can see it.
alter table public.trades enable row level security;
alter table public.executions enable row level security;

drop policy if exists "own trades" on public.trades;
create policy "own trades" on public.trades
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own executions" on public.executions;
create policy "own executions" on public.executions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.trades t where t.id = trade_id and t.user_id = (select auth.uid()))
  );
