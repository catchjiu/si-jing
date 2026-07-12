"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Flame, Gift, Loader2, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { StreakMilestone, StreakMilestoneAward } from "@/lib/types";
import { formatRoleSpeech } from "@/lib/role-speech";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface StreakMilestonesPanelProps {
  currentStreak: number;
  className?: string;
}

export function StreakMilestonesPanel({
  currentStreak,
  className,
}: StreakMilestonesPanelProps) {
  const { isQueen } = useAuth();
  const [milestones, setMilestones] = useState<StreakMilestone[]>([]);
  const [awards, setAwards] = useState<StreakMilestoneAward[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [targetDays, setTargetDays] = useState("7");
  const [description, setDescription] = useState("");
  const [rewardSuggestion, setRewardSuggestion] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: ms }, { data: aw }] = await Promise.all([
      supabase
        .from("streak_milestones")
        .select("*")
        .order("target_days", { ascending: true }),
      supabase.from("streak_milestone_awards").select("*"),
    ]);
    setMilestones((ms as StreakMilestone[]) ?? []);
    setAwards((aw as StreakMilestoneAward[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const awardedIds = new Set(awards.map((a) => a.milestone_id));
  const nextMilestone = milestones.find(
    (m) => !awardedIds.has(m.id) && m.target_days > currentStreak
  );

  const addMilestone = async () => {
    if (!isQueen) return;
    const days = parseInt(targetDays, 10);
    if (!title.trim() || !days || days < 1) {
      toast.error("Enter a title and day target");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data: profile } = await supabase.auth.getUser();
    if (!profile.user) return;

    const { error } = await supabase.from("streak_milestones").insert({
      created_by: profile.user.id,
      target_days: days,
      title: formatRoleSpeech(title.trim(), "queen"),
      description: description.trim()
        ? formatRoleSpeech(description.trim(), "queen")
        : null,
      reward_suggestion: rewardSuggestion.trim()
        ? formatRoleSpeech(rewardSuggestion.trim(), "queen")
        : null,
      sort_order: milestones.length,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Milestone added");
    setTitle("");
    setTargetDays("7");
    setDescription("");
    setRewardSuggestion("");
    void load();
  };

  const removeMilestone = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("streak_milestones")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Could not remove milestone");
      return;
    }
    void load();
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading milestones…</p>;
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-gold/15 bg-charcoal/80 p-4 sm:p-5 space-y-4",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <Flame className="h-5 w-5 text-orange-400" />
        <div>
          <h3 className="font-heading text-lg text-ivory">Streak milestones</h3>
          <p className="text-xs text-muted-foreground">
            Current streak:{" "}
            <span className="font-heading text-orange-400">{currentStreak}</span>{" "}
            day{currentStreak === 1 ? "" : "s"}
            {nextMilestone && (
              <>
                {" "}
                · {nextMilestone.target_days - currentStreak} to go for &ldquo;
                {nextMilestone.title}&rdquo;
              </>
            )}
          </p>
        </div>
      </div>

      {milestones.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isQueen
            ? "Set streak targets — e.g. 7 days earns a reward."
            : "Queen has not set streak goals yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {milestones.map((m) => {
            const achieved = awardedIds.has(m.id);
            const reached = currentStreak >= m.target_days;
            return (
              <li
                key={m.id}
                className={cn(
                  "rounded-lg border px-3 py-3",
                  achieved
                    ? "border-emerald-500/30 bg-emerald-950/20"
                    : reached
                      ? "border-gold/40 bg-gold/5"
                      : "border-gold/10 bg-void/40"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-heading text-ivory">{m.title}</p>
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase tracking-wider"
                      >
                        {m.target_days}d
                      </Badge>
                      {achieved && (
                        <Badge className="bg-emerald-600/80 text-[10px] uppercase">
                          Achieved
                        </Badge>
                      )}
                      {!achieved && reached && (
                        <Badge className="bg-gold/80 text-void text-[10px] uppercase">
                          Ready!
                        </Badge>
                      )}
                    </div>
                    {m.description && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {m.description}
                      </p>
                    )}
                    {m.reward_suggestion && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-gold">
                        <Gift className="h-3.5 w-3.5" />
                        {m.reward_suggestion}
                      </p>
                    )}
                  </div>
                  {isQueen && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-red-400"
                      onClick={() => void removeMilestone(m.id)}
                      aria-label="Remove milestone"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isQueen && (
        <div className="space-y-3 border-t border-gold/10 pt-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Add milestone
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ms-title">Title</Label>
              <Input
                id="ms-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Week warrior"
                className="border-gold/20 bg-void/60"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ms-days">Target days</Label>
              <Input
                id="ms-days"
                type="number"
                min={1}
                value={targetDays}
                onChange={(e) => setTargetDays(e.target.value)}
                className="border-gold/20 bg-void/60"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ms-desc">Description (optional)</Label>
            <Textarea
              id="ms-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="border-gold/20 bg-void/60"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ms-reward">Reward suggestion (optional)</Label>
            <Input
              id="ms-reward"
              value={rewardSuggestion}
              onChange={(e) => setRewardSuggestion(e.target.value)}
              placeholder="A small gift or privilege…"
              className="border-gold/20 bg-void/60"
            />
          </div>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void addMilestone()}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add milestone
          </Button>
        </div>
      )}
    </div>
  );
}
