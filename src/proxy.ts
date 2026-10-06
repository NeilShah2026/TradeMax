import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

// Refreshes the Supabase session cookie and keeps signed-out visitors on /login.
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/login";

  if (pathname.startsWith("/api/")) {
    return signedIn ? response : NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!signedIn && !isLogin) {
    return redirectWithCookies(new URL("/login", request.url), response);
  }
  if (signedIn && isLogin) {
    return redirectWithCookies(new URL("/", request.url), response);
  }
  return response;
}

function redirectWithCookies(url: URL, from: NextResponse) {
  const res = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => res.cookies.set(c));
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
