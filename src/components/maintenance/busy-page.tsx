"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TAP_TARGET = 5;
const TAP_WINDOW_MS = 2000;

export function BusyPage() {
  const router = useRouter();
  const [tapCount, setTapCount] = useState(0);
  const [showUnlock, setShowUnlock] = useState(false);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTaps = useCallback(() => {
    setTapCount(0);
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
  }, []);

  const onLogoTap = () => {
    if (showUnlock) return;

    const next = tapCount + 1;
    setTapCount(next);

    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(resetTaps, TAP_WINDOW_MS);

    if (next >= TAP_TARGET) {
      resetTaps();
      setShowUnlock(true);
    }
  };

  const onUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/maintenance/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });

      if (!res.ok) {
        setError("That key does not open the chamber.");
        setLoading(false);
        return;
      }

      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
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

      <div className="relative z-10 w-full max-w-md animate-rise text-center">
        <button
          type="button"
          onClick={onLogoTap}
          className="mx-auto mb-6 flex cursor-default justify-center border-0 bg-transparent p-0"
          aria-label="Queen Sisi"
        >
          <BrandLogo
            size="hero"
            rounded="lg"
            priority
            className="h-40 w-40 border-gold/40 shadow-[0_0_40px_rgba(212,175,55,0.15)] sm:h-44 sm:w-44"
          />
        </button>

        <p className="text-lg leading-relaxed text-ivory/90 sm:text-xl">
          Queen Sisi is busy at the moment, she hopes to be able to be served
          again soon
        </p>

        {showUnlock && (
          <form
            onSubmit={onUnlockSubmit}
            className="mt-8 animate-fade-in space-y-3 rounded-xl border border-gold/20 bg-charcoal/90 p-6 glow-gold backdrop-blur-sm"
          >
            <Input
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Chamber key"
              className="h-11 border-gold/20 bg-void/60 text-center transition-all duration-300 focus:border-gold focus:ring-gold/30"
            />
            {error && (
              <p
                role="alert"
                className="text-sm text-red-300"
              >
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={loading || !secret.trim()}
              className="h-11 w-full bg-gold font-medium tracking-wide text-void transition-all duration-300 hover:bg-gold-muted"
            >
              {loading ? "Opening…" : "Open"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
