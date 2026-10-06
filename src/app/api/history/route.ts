import { NextResponse, type NextRequest } from "next/server";
import { cleanSymbol } from "@/lib/finnhub";
import { fetchDailyCloses } from "@/lib/history";
import { isAuthorized } from "@/lib/supabase/server";

// GET /api/history?s=AAPL:2026-01-05,NVDA:2026-04-01  ->  { history: { AAPL: { "2026-01-05": 243.1, ... } } }
export async function GET(req: NextRequest) {
  if (!(await isAuthorized())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const wanted = (req.nextUrl.searchParams.get("s") ?? "")
    .split(",")
    .map((part) => {
      const [sym, from] = part.split(":");
      const symbol = cleanSymbol(sym);
      return symbol && /^\d{4}-\d{2}-\d{2}$/.test(from ?? "") ? { symbol, from } : null;
    })
    .filter((x): x is { symbol: string; from: string } => !!x)
    .slice(0, 80);

  const history: Record<string, Record<string, number>> = {};
  const failed: string[] = [];
  // small batches to stay polite with the upstream
  for (let i = 0; i < wanted.length; i += 8) {
    await Promise.all(
      wanted.slice(i, i + 8).map(async ({ symbol, from }) => {
        try {
          history[symbol] = await fetchDailyCloses(symbol, from);
        } catch {
          failed.push(symbol);
        }
      }),
    );
  }

  return NextResponse.json({ history, failed }, { headers: { "Cache-Control": "private, max-age=600" } });
}
