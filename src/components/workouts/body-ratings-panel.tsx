"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  BODY_PARTS,
  BODY_PART_LABELS,
  type WorkoutBodyPart,
} from "@/lib/workout-exercises";
import type { BodyRatingSnapshot, BodyRatings, Profile } from "@/lib/types";
import { weekStartMonday } from "@/lib/workout-stats";
import { BodyRatingRing } from "@/components/workouts/body-rating-ring";
import { BodyRatingsSpider } from "@/components/workouts/body-ratings-spider";
import { BodyRatingHistory } from "@/components/workouts/body-rating-history";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

type Scores = {
  overall: number;
} & Record<WorkoutBodyPart, number>;

const EMPTY: Scores = {
  overall: 0,
  arms: 0,
  shoulders: 0,
  chest: 0,
  abs: 0,
  back: 0,
  butt: 0,
};

function scoresFromRow(row: BodyRatings | null): Scores {
  if (!row) return { ...EMPTY };
  return {
    overall: row.overall,
    arms: row.arms,
    shoulders: row.shoulders,
    chest: row.chest,
    abs: row.abs,
    back: row.back,
    butt: row.butt,
  };
}

export function BodyRatingsPanel({ className }: { className?: string }) {
  const { profile, isQueen, isSlave } = useAuth();
  const [scores, setScores] = useState<Scores>(EMPTY);
  const [rowId, setRowId] = useState<string | null>(null);
  const [slave, setSlave] = useState<Profile | null>(null);
  const [snapshots, setSnapshots] = useState<BodyRatingSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [highlight, setHighlight] = useState<WorkoutBodyPart | null>(null);

  const currentWeek = useMemo(() => weekStartMonday(), []);

  const ratedThisWeek = useMemo(
    () => snapshots.some((s) => s.week_start === currentWeek),
    [snapshots, currentWeek]
  );

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    try {
      let targetId = profile.id;
      if (isQueen) {
        const { data } = await supabase
          .from("users")
          .select("*")
          .eq("role", "slave")
          .limit(1)
          .maybeSingle();
        setSlave((data as Profile | null) ?? null);
        if (!data) {
          setScores(EMPTY);
          setRowId(null);
          setSnapshots([]);
          return;
        }
        targetId = data.id;
      }

      const [ratingRes, snapshotRes] = await Promise.all([
        supabase
          .from("body_ratings")
          .select("*")
          .eq("rated_for", targetId)
          .maybeSingle(),
        supabase
          .from("body_rating_snapshots")
          .select("*")
          .eq("rated_for", targetId)
          .order("week_start", { ascending: false })
          .limit(104),
      ]);

      if (ratingRes.error) throw ratingRes.error;
      if (snapshotRes.error) throw snapshotRes.error;

      const row = ratingRes.data as BodyRatings | null;
      setRowId(row?.id ?? null);
      setScores(scoresFromRow(row));
      setSnapshots((snapshotRes.data ?? []) as BodyRatingSnapshot[]);
    } catch (err) {
      console.error(err);
      toast.error("Could not load body ratings");
    } finally {
      setLoading(false);
    }
  }, [profile, isQueen]);

  useEffect(() => {
    if (profile) void load();
  }, [profile, load]);

  const partScores = useMemo(() => {
    const o = {} as Record<WorkoutBodyPart, number>;
    for (const p of BODY_PARTS) o[p] = scores[p];
    return o;
  }, [scores]);

  const save = async () => {
    if (!isQueen || !profile || !slave) return;
    setSaving(true);
    const supabase = createClient();
    try {
      const payload = {
        rated_by: profile.id,
        rated_for: slave.id,
        overall: scores.overall,
        arms: scores.arms,
        shoulders: scores.shoulders,
        chest: scores.chest,
        abs: scores.abs,
        back: scores.back,
        butt: scores.butt,
      };
      const { data, error } = rowId
        ? await supabase
            .from("body_ratings")
            .update(payload)
            .eq("id", rowId)
            .select("*")
            .single()
        : await supabase.from("body_ratings").insert(payload).select("*").single();
      if (error) throw error;
      const row = data as BodyRatings;
      setRowId(row.id);
      setScores(scoresFromRow(row));
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Queen rated your body",
          body: `Overall ${row.overall}/100`,
          url: "/dashboard/workouts",
          target: "slave",
          kind: "body_rating",
        })
      );
      toast.success("Ratings saved");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-2xl border border-gold/15 bg-charcoal/80 p-5 text-sm text-muted-foreground",
          className
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading body ratings…
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-5 rounded-2xl border border-gold/20 bg-charcoal/80 p-5 shadow-[0_0_32px_rgba(212,175,55,0.06)]",
        className
      )}
    >
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Body ratings
        </p>
        <p className="font-heading text-lg text-ivory">
          {isQueen ? "Rate his physique" : "Queen’s rating of you"}
        </p>
      </div>

      {isQueen && !ratedThisWeek && slave && (
        <div className="flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-gold">Weekly rating due</p>
            <p className="text-muted-foreground">
              Update {slave.username}&apos;s body scores for this week so he can
              track progress over time.
            </p>
          </div>
        </div>
      )}

      {isSlave ? (
        <BodyRatingHistory snapshots={snapshots} />
      ) : (
        <>
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-center">
            <BodyRatingRing value={scores.overall} />
            <BodyRatingsSpider
              scores={partScores}
              highlight={highlight}
              onSelectPart={setHighlight}
            />
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {BODY_PARTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setHighlight(p)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  highlight === p
                    ? "border-gold bg-gold/15 text-gold"
                    : "border-gold/20 text-muted-foreground"
                )}
              >
                {BODY_PART_LABELS[p]} · {scores[p]}
              </button>
            ))}
          </div>

          <div className="space-y-4 border-t border-gold/10 pt-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>Overall</Label>
                <span className="font-heading text-gold">{scores.overall}</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[scores.overall]}
                onValueChange={(v) =>
                  setScores((s) => ({ ...s, overall: v[0] ?? 0 }))
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {BODY_PARTS.map((p) => (
                <div key={p} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <Label>{BODY_PART_LABELS[p]}</Label>
                    <span className="font-heading text-gold">{scores[p]}</span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[scores[p]]}
                    onValueChange={(v) => {
                      setHighlight(p);
                      setScores((s) => ({ ...s, [p]: v[0] ?? 0 }));
                    }}
                  />
                </div>
              ))}
            </div>
            <Button
              type="button"
              disabled={saving || !slave}
              onClick={() => void save()}
              className="bg-gold text-void hover:bg-gold-muted"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save ratings
            </Button>
            {!slave && (
              <p className="text-xs text-muted-foreground">
                No slave account found.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
