import { NextResponse, type NextRequest } from "next/server";
import { cleanSymbol, fetchQuote, isFinnhubConfigured } from "@/lib/finnhub";
import { isAuthorized } from "@/lib/supabase/server";
import type { Quote } from "@/lib/types";

export async function GET(req: NextRequest) {
  if (!(await isAuthorized())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isFinnhubConfigured) return NextResponse.json({ configured: false, quotes: {} });

  const symbols = [...new Set((req.nextUrl.searchParams.get("symbols") ?? "").split(",").map(cleanSymbol).filter(Boolean))] as string[];
  const quotes: Record<string, Quote> = {};
  let rateLimited = false;

  await Promise.all(
    symbols.slice(0, 40).map(async (s) => {
      try {
        const q = await fetchQuote(s);
        if (q) quotes[s] = q;
      } catch (e) {
        if ((e as Error).message === "rate_limited") rateLimited = true;
      }
    }),
  );

  return NextResponse.json({ configured: true, quotes, rateLimited }, { headers: { "Cache-Control": "no-store" } });
}
