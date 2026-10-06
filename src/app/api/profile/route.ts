import { NextResponse, type NextRequest } from "next/server";
import { DEMO_SYMBOL_NAMES } from "@/lib/demo-data";
import { cleanSymbol, fetchProfile, isFinnhubConfigured } from "@/lib/finnhub";
import { isAuthorized } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  if (!(await isAuthorized())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const symbol = cleanSymbol(req.nextUrl.searchParams.get("symbol"));
  if (!symbol) return NextResponse.json({ error: "bad_symbol" }, { status: 400 });

  const fallback = { symbol, name: DEMO_SYMBOL_NAMES[symbol] ?? null, logo: null };
  if (!isFinnhubConfigured) return NextResponse.json(fallback);

  try {
    const profile = await fetchProfile(symbol);
    return NextResponse.json(profile, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch {
    return NextResponse.json(fallback);
  }
}
