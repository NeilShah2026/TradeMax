import { NextResponse, type NextRequest } from "next/server";
import { DEMO_SYMBOL_NAMES } from "@/lib/demo-data";
import { isFinnhubConfigured, searchSymbols } from "@/lib/finnhub";
import { isAuthorized } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  if (!(await isAuthorized())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 30);
  if (!q) return NextResponse.json({ results: [] });

  if (!isFinnhubConfigured) {
    const u = q.toUpperCase();
    const results = Object.entries(DEMO_SYMBOL_NAMES)
      .filter(([s, name]) => s.startsWith(u) || name.toUpperCase().includes(u))
      .slice(0, 8)
      .map(([symbol, name]) => ({ symbol, name }));
    return NextResponse.json({ results });
  }

  try {
    return NextResponse.json({ results: await searchSymbols(q) });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
