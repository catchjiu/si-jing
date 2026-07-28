"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Gift } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { RewardForm } from "@/components/rewards/reward-form";
import { RewardGallery } from "@/components/rewards/reward-gallery";
import { hasPunishmentEffect } from "@/lib/punishments";
import { signObjectUrl } from "@/lib/storage/client";
import type { Profile, Reward, RewardWithSignedUrl } from "@/lib/types";

async function withSignedUrls(
  rewards: Reward[]
): Promise<RewardWithSignedUrl[]> {
  return Promise.all(
    rewards.map(async (r) => {
      const signedUrl =
        (await signObjectUrl({
          bucket: "rewards",
          path: r.image_path,
        })) ?? undefined;
      return { ...r, signedUrl };
    })
  );
}

function RewardsPageInner() {
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const focusRewardId = searchParams.get("reward");
  const [rewards, setRewards] = useState<RewardWithSignedUrl[]>([]);
  const [recipient, setRecipient] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [rewardsFrozen, setRewardsFrozen] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();

    let frozen = false;
    if (isSlave) {
      frozen = await hasPunishmentEffect("rewards", profile.id);
      setRewardsFrozen(frozen);
    } else {
      setRewardsFrozen(false);
    }

    let query = supabase
      .from("rewards")
      .select("*")
      .order("created_at", { ascending: false });

    if (isSlave) {
      query = query.eq("sent_to", profile.id);
    }

    const { data } = await query;
    let list = (data ?? []) as Reward[];
    // Privilege freeze: hide new unviewed rewards from D
    if (isSlave && frozen) {
      list = list.filter((r) => r.viewed_at != null);
    }
    const signed = await withSignedUrls(list);
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

      {isSlave && rewardsFrozen && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200">
          Privilege freeze is active — new unviewed rewards are hidden until it
          lifts.
        </div>
      )}

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
        <RewardGallery
          rewards={rewards}
          onViewed={onViewed}
          focusRewardId={focusRewardId}
        />
      </section>
    </div>
  );
}

export default function RewardsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <RewardsPageInner />
    </Suspense>
  );
}
