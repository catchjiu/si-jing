"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { RewardForm } from "@/components/rewards/reward-form";
import { RewardGallery } from "@/components/rewards/reward-gallery";
import type { Profile, Reward, RewardWithSignedUrl } from "@/lib/types";

async function withSignedUrls(
  rewards: Reward[]
): Promise<RewardWithSignedUrl[]> {
  const supabase = createClient();
  return Promise.all(
    rewards.map(async (r) => {
      const { data } = await supabase.storage
        .from("rewards")
        .createSignedUrl(r.image_path, 3600);
      return { ...r, signedUrl: data?.signedUrl };
    })
  );
}

export default function RewardsPage() {
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
  const [rewards, setRewards] = useState<RewardWithSignedUrl[]>([]);
  const [recipient, setRecipient] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from("rewards")
      .select("*")
      .order("created_at", { ascending: false });

    if (isSlave) {
      query = query.eq("sent_to", profile.id);
    }

    const { data } = await query;
    const signed = await withSignedUrls((data ?? []) as Reward[]);
    setRewards(signed);
    setLoading(false);
  }, [profile, isSlave]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  useEffect(() => {
    if (!isQueen) return;
    const findRecipient = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("role", "slave")
        .limit(1)
        .maybeSingle();
      setRecipient((data as Profile | null) ?? null);
    };
    void findRecipient();
  }, [isQueen]);

  const onViewed = (id: string) => {
    setRewards((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, viewed_at: new Date().toISOString() } : r
      )
    );
  };

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl text-ivory flex items-center gap-3">
          <Gift className="h-7 w-7 text-gold" />
          Rewards
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Send a picture — and optionally a voice message — as a gift"
            : "Gifts from Queen Sisi"}
        </p>
      </div>

      {isQueen && recipient && (
        <RewardForm recipientId={recipient.id} onSuccess={load} />
      )}

      {isQueen && !recipient && (
        <p className="text-sm text-muted-foreground">
          No recipient found. Create D&apos;s account first.
        </p>
      )}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">
          {isQueen ? "Sent" : "Received"}
        </h2>
        <RewardGallery rewards={rewards} onViewed={onViewed} />
      </section>
    </div>
  );
}
