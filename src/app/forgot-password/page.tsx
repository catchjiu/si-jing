"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const origin = window.location.origin;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${origin}/auth/callback?next=/dashboard/profile` }
    );

    setLoading(false);
    if (resetError) {
      setError("Unable to send reset link. Try again.");
      return;
    }
    setSent(true);
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md animate-rise">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to entrance
        </Link>

        <h1 className="font-heading text-3xl text-gold mb-2">Reset access</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Enter your email and we will send a secure reset link.
        </p>

        {sent ? (
          <div className="rounded-xl border border-gold/20 bg-charcoal/90 p-6 text-sm text-ivory/90">
            If an account exists for that address, a reset link is on its way.
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="rounded-xl border border-gold/20 bg-charcoal/90 p-8 space-y-5 glow-gold"
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 border-gold/20 bg-void/60"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-300">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gold text-void hover:bg-gold-muted"
            >
              {loading ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
