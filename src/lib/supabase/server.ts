import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

export async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a context that can't set cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
}

/** For API routes: true when the request is from the signed-in user (or the app is in demo mode). */
export async function isAuthorized(): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getClaims();
  return !!data?.claims?.sub;
}
