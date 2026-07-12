"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { BrandLogo } from "@/components/brand-logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError("Access denied. Check your credentials.");
      setLoading(false);
      return;
    }

    void remember;
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(45,27,105,0.5), transparent 45%), radial-gradient(circle at 80% 70%, rgba(212,175,55,0.12), transparent 40%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(212,175,55,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(212,175,55,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="relative z-10 w-full max-w-md animate-rise">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex justify-center">
            <BrandLogo
              size="hero"
              rounded="lg"
              priority
              className="h-40 w-40 border-gold/40 shadow-[0_0_40px_rgba(212,175,55,0.15)] sm:h-44 sm:w-44"
            />
          </div>
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Enter the sanctum
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-xl border border-gold/20 bg-charcoal/90 p-8 glow-gold backdrop-blur-sm"
        >
          <div className="space-y-2">
            <Label htmlFor="email" className="text-ivory/80">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 border-gold/20 bg-void/60 transition-all duration-300 focus:border-gold focus:ring-gold/30"
              placeholder="you@private.domain"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-ivory/80">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 border-gold/20 bg-void/60 transition-all duration-300 focus:border-gold focus:ring-gold/30"
              placeholder="••••••••"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={remember}
                onCheckedChange={(v) => setRemember(v === true)}
                aria-label="Remember me"
              />
              Remember me
            </label>
            <Link
              href="/forgot-password"
              className="text-sm text-gold/80 transition-colors duration-200 hover:text-gold"
            >
              Forgotten your password?
            </Link>
          </div>

          {error && (
            <p
              role="alert"
              className="animate-fade-in rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="h-11 w-full bg-gold font-medium tracking-wide text-void transition-all duration-300 hover:bg-gold-muted"
          >
            {loading ? "Entering…" : "Enter"}
          </Button>
        </form>
      </div>
    </main>
  );
}
