"use client";

import { useCallback, useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { FlirtGuy, FlirtStatus, Profile } from "@/lib/types";
import { FlirtGuyForm } from "@/components/flirt/flirt-guy-form";
import { FlirtGuysGrid } from "@/components/flirt/flirt-guys-grid";

export default function FlirtPage() {
  const { profile, isQueen, isSlave, loading: authLoading } = useAuth();
  const [guys, setGuys] = useState<FlirtGuy[]>([]);
  const [recipient, setRecipient] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FlirtStatus | "all">("all");

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("flirt_guys")
      .select("*")
      .order("updated_at", { ascending: false });
    if (isSlave) query = query.eq("assigned_to", profile.id);
    const { data } = await query;
    setGuys((data ?? []) as FlirtGuy[]);
    setLoading(false);
  }, [profile, isSlave]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  useEffect(() => {
    if (!isQueen) return;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("role", "slave")
        .limit(1)
        .maybeSingle();
      setRecipient((data as Profile | null) ?? null);
    })();
  }, [isQueen]);

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading flex items-center gap-3 text-2xl text-ivory sm:text-3xl">
          <Flame className="h-7 w-7 text-gold" />
          Flirt
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Guys you've flirted with — status, interest, and a dated timeline for D"
            : "Guys Queen has flirted with — tap one to see the timeline"}
        </p>
      </div>

      {isQueen && recipient && (
        <FlirtGuyForm
          recipient={recipient}
          onCreated={() => {
            void load();
          }}
        />
      )}

      {isQueen && !recipient && (
        <p className="text-sm text-muted-foreground">
          No slave account found to assign flirts to.
        </p>
      )}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">Guys</h2>
        <FlirtGuysGrid
          guys={guys}
          filter={filter}
          onFilterChange={setFilter}
        />
      </section>
    </div>
  );
}
