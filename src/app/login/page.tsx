"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoMark } from "@/components/logo";
import { Button, Field, Input } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await getBrowserSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
      setLoading(false);
      return;
    }
    router.replace("/");
    router.refresh();
  };

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark size={44} />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your TradeMax journal</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-6 shadow-card">
          {isSupabaseConfigured ? (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <Field label="Email" htmlFor="email">
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </Field>
              <Field label="Password" htmlFor="password">
                <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {error && <p className="rounded-xl bg-neg-soft px-3 py-2 text-sm text-neg">{error}</p>}
              <Button type="submit" variant="primary" loading={loading} className="mt-1 w-full">
                Sign in
              </Button>
            </form>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-surface-2 text-muted">
                <Lock className="h-4 w-4" />
              </div>
              <p className="text-sm text-muted">
                Supabase isn&apos;t connected yet, so the app is running in demo mode without a login.
              </p>
              <Link href="/" className="text-sm font-medium underline underline-offset-4">
                Open the demo
              </Link>
            </div>
          )}
        </div>
        <p className="mt-6 text-center font-mono text-[11px] text-muted">Private journal · single user</p>
      </div>
    </div>
  );
}
