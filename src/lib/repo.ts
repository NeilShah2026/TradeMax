import { isSupabaseConfigured } from "./supabase/config";
import { getBrowserSupabase } from "./supabase/client";
import { buildDemoTrades } from "./demo-data";
import type { Fill, FillInput, NewTradeInput, Trade, TradePatch } from "./types";

export interface Repo {
  list(): Promise<Trade[]>;
  createTrade(input: NewTradeInput): Promise<string>;
  updateTrade(id: string, patch: TradePatch): Promise<void>;
  deleteTrade(id: string): Promise<void>;
  addFill(tradeId: string, fill: FillInput): Promise<void>;
  updateFill(id: string, fill: FillInput): Promise<void>;
  deleteFill(id: string): Promise<void>;
}

type Row = Omit<Trade, "fills"> & { executions: Fill[] };

const normalize = (r: Row): Trade => {
  const { executions, ...rest } = r;
  return {
    ...rest,
    setups: rest.setups ?? [],
    mistakes: rest.mistakes ?? [],
    notes: rest.notes ?? "",
    fills: (executions ?? []).map((f) => ({
      id: f.id,
      trade_id: f.trade_id,
      action: f.action,
      quantity: Number(f.quantity),
      price: Number(f.price),
      executed_at: f.executed_at,
      created_at: f.created_at,
    })),
  };
};

function friendly(message: string): string {
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Can't reach Supabase. Check your connection — and if you just edited .env.local, restart the dev server.";
  }
  if (/row-level security|jwt|not authenticated|auth\.uid/i.test(message)) {
    return "Your session expired. Please sign in again.";
  }
  return message;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(friendly(error.message));
}

const supabaseRepo: Repo = {
  async list() {
    const { data, error } = await getBrowserSupabase()
      .from("trades")
      .select("id, symbol, side, setups, mistakes, notes, rating, created_at, updated_at, executions(id, trade_id, action, quantity, price, executed_at, created_at)")
      .order("created_at", { ascending: false });
    fail(error);
    return (data as unknown as Row[]).map(normalize);
  },
  async createTrade({ fill, ...trade }) {
    const sb = getBrowserSupabase();
    const { data, error } = await sb.from("trades").insert(trade).select("id").single();
    fail(error);
    const id = (data as { id: string }).id;
    const { error: fillError } = await sb.from("executions").insert({ ...fill, trade_id: id });
    if (fillError) {
      await sb.from("trades").delete().eq("id", id);
      throw new Error(friendly(fillError.message));
    }
    return id;
  },
  async updateTrade(id, patch) {
    const { error } = await getBrowserSupabase().from("trades").update(patch).eq("id", id);
    fail(error);
  },
  async deleteTrade(id) {
    const { error } = await getBrowserSupabase().from("trades").delete().eq("id", id);
    fail(error);
  },
  async addFill(tradeId, fill) {
    const { error } = await getBrowserSupabase().from("executions").insert({ ...fill, trade_id: tradeId });
    fail(error);
  },
  async updateFill(id, fill) {
    const { error } = await getBrowserSupabase().from("executions").update(fill).eq("id", id);
    fail(error);
  },
  async deleteFill(id) {
    const { error } = await getBrowserSupabase().from("executions").delete().eq("id", id);
    fail(error);
  },
};

// ---------- Demo mode: sample data kept in this browser's localStorage ----------

const DEMO_KEY = "trademax-demo-v1";
let memory: Trade[] | null = null;

function loadDemo(): Trade[] {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) memory = JSON.parse(raw) as Trade[];
  } catch {
    // storage unavailable — fall through to fresh sample data
  }
  if (!memory) {
    memory = buildDemoTrades();
    saveDemo();
  }
  return memory;
}

function saveDemo() {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(memory));
  } catch {
    // ignore; data stays in memory for this session
  }
}

export function resetDemo() {
  memory = buildDemoTrades();
  saveDemo();
}

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const nowIso = () => new Date().toISOString();

function mutateDemo(fn: (trades: Trade[]) => void) {
  const trades = loadDemo();
  fn(trades);
  saveDemo();
}

const demoRepo: Repo = {
  async list() {
    return structuredClone(loadDemo()).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async createTrade({ fill, ...input }) {
    const id = uid();
    const ts = nowIso();
    mutateDemo((t) =>
      t.push({ ...input, id, rating: null, created_at: ts, updated_at: ts, fills: [{ ...fill, id: uid(), trade_id: id, created_at: ts }] }),
    );
    return id;
  },
  async updateTrade(id, patch) {
    mutateDemo((t) => {
      const tr = t.find((x) => x.id === id);
      if (tr) Object.assign(tr, patch, { updated_at: nowIso() });
    });
  },
  async deleteTrade(id) {
    mutateDemo((t) => {
      const i = t.findIndex((x) => x.id === id);
      if (i >= 0) t.splice(i, 1);
    });
  },
  async addFill(tradeId, fill) {
    mutateDemo((t) => t.find((x) => x.id === tradeId)?.fills.push({ ...fill, id: uid(), trade_id: tradeId, created_at: nowIso() }));
  },
  async updateFill(id, fill) {
    mutateDemo((t) => {
      for (const tr of t) {
        const f = tr.fills.find((x) => x.id === id);
        if (f) Object.assign(f, fill);
      }
    });
  },
  async deleteFill(id) {
    mutateDemo((t) => {
      for (const tr of t) tr.fills = tr.fills.filter((x) => x.id !== id);
    });
  },
};

export const repo: Repo = isSupabaseConfigured ? supabaseRepo : demoRepo;
export const isDemo = !isSupabaseConfigured;
