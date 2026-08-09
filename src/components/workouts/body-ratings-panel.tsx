"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  BODY_PARTS,
  BODY_PART_LABELS,
  type WorkoutBodyPart,
} from "@/lib/workout-exercises";
import type {
  BodyRatingSnapshot,
  Profile,
  WorkoutWeeklyPic,
} from "@/lib/types";
import { weekStartMonday } from "@/lib/workout-stats";
import { signObjectUrl } from "@/lib/storage/client";
import { BodyRatingRing } from "@/components/workouts/body-rating-ring";
import { BodyRatingsSpider } from "@/components/workouts/body-ratings-spider";
import { BodyRatingHistory } from "@/components/workouts/body-rating-history";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Scores = {
  overall: number;
} & Record<WorkoutBodyPart, number>;

type PicOption = WorkoutWeeklyPic & { url?: string };

const EMPTY: Scores = {
  overall: 0,
  arms: 0,
  shoulders: 0,
  chest: 0,
  abs: 0,
  back: 0,
  butt: 0,
};

function scoresFromPic(pic: WorkoutWeeklyPic | null): Scores {
  if (!pic || pic.rating_overall == null) return { ...EMPTY };
  return {
    overall: pic.rating_overall ?? 0,
    arms: pic.rating_arms ?? 0,
    shoulders: pic.rating_shoulders ?? 0,
    chest: pic.rating_chest ?? 0,
    abs: pic.rating_abs ?? 0,
    back: pic.rating_back ?? 0,
    butt: pic.rating_butt ?? 0,
  };
}

function formatPicLabel(pic: WorkoutWeeklyPic) {
  const ymd = pic.taken_on || pic.week_start;
  try {
    return new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return ymd;
  }
}

function pickDefaultPicId(pics: WorkoutWeeklyPic[], currentWeek: string) {
  const unratedCurrent = pics.find(
    (p) => p.week_start === currentWeek && p.rating_overall == null
  );
  if (unratedCurrent) return unratedCurrent.id;
  const anyUnrated = pics.find((p) => p.rating_overall == null);
  if (anyUnrated) return anyUnrated.id;
  return pics[0]?.id ?? null;
}

export function BodyRatingsPanel({ className }: { className?: string }) {
  const { profile, isQueen, isSlave } = useAuth();
  const [scores, setScores] = useState<Scores>(EMPTY);
  const [slave, setSlave] = useState<Profile | null>(null);
  const [pics, setPics] = useState<PicOption[]>([]);
  const [selectedPicId, setSelectedPicId] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<BodyRatingSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [highlight, setHighlight] = useState<WorkoutBodyPart | null>(null);

  const currentWeek = useMemo(() => weekStartMonday(), []);

  const selectedPic = useMemo(
    () => pics.find((p) => p.id === selectedPicId) ?? null,
    [pics, selectedPicId]
  );

  const ratedThisWeek = useMemo(
    () =>
      pics.some(
        (p) => p.week_start === currentWeek && p.rating_overall != null
      ) || snapshots.some((s) => s.week_start === currentWeek),
    [pics, snapshots, currentWeek]
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
          setPics([]);
          setSelectedPicId(null);
          setSnapshots([]);
          return;
        }
        targetId = data.id;
      }

      const [picRes, snapshotRes] = await Promise.all([
        supabase
          .from("workout_weekly_pics")
          .select("*")
          .eq("created_by", targetId)
          .not("file_path", "is", null)
          .order("week_start", { ascending: false })
          .limit(52),
        supabase
          .from("body_rating_snapshots")
          .select("*")
          .eq("rated_for", targetId)
          .order("week_start", { ascending: false })
          .limit(104),
      ]);

      if (picRes.error) throw picRes.error;
      if (snapshotRes.error) throw snapshotRes.error;

      const rawPics = (picRes.data ?? []) as WorkoutWeeklyPic[];
      const withUrls = await Promise.all(
        rawPics.map(async (p) => {
          const url = p.file_path
            ? await signObjectUrl({ bucket: "workouts", path: p.file_path })
            : null;
          return { ...p, url: url ?? undefined };
        })
      );
      setPics(withUrls);
      setSnapshots((snapshotRes.data ?? []) as BodyRatingSnapshot[]);

      setSelectedPicId((prev) => {
        if (prev && withUrls.some((p) => p.id === prev)) return prev;
        return pickDefaultPicId(withUrls, currentWeek);
      });
    } catch (err) {
      console.error(err);
      toast.error("Could not load body ratings");
    } finally {
      setLoading(false);
    }
  }, [profile, isQueen, currentWeek]);

  useEffect(() => {
    if (profile) void load();
  }, [profile, load]);

  useEffect(() => {
    if (isQueen) setScores(scoresFromPic(selectedPic));
  }, [isQueen, selectedPic]);

  const partScores = useMemo(() => {
    const o = {} as Record<WorkoutBodyPart, number>;
    for (const p of BODY_PARTS) o[p] = scores[p];
    return o;
  }, [scores]);

  const save = async () => {
    if (!isQueen || !profile || !slave || !selectedPicId) return;
    setSaving(true);
    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc("rate_weekly_progress_pic", {
        p_pic_id: selectedPicId,
        p_overall: scores.overall,
        p_arms: scores.arms,
        p_shoulders: scores.shoulders,
        p_chest: scores.chest,
        p_abs: scores.abs,
        p_back: scores.back,
        p_butt: scores.butt,
      });
      if (error) throw error;
      const row = data as WorkoutWeeklyPic;
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Queen rated your body",
          body: `${formatPicLabel(row)} · Overall ${row.rating_overall}/100`,
          url: "/dashboard/workouts",
          target: "slave",
          kind: "body_rating",
        })
      );
      toast.success("Rating saved to this progress pic");
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
          {isQueen ? "Rate a progress pic" : "Queen’s rating of you"}
        </p>
        <p className="text-xs text-muted-foreground">
          {isQueen
            ? "Each photo keeps its own scores — updating one won’t erase older weeks."
            : "Swipe through ratings tied to each progress photo over time."}
        </p>
      </div>

      {isQueen && !ratedThisWeek && slave && pics.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-gold">Weekly rating due</p>
            <p className="text-muted-foreground">
              Rate this week&apos;s progress pic for {slave.username} so the
              timeline stays up to date.
            </p>
          </div>
        </div>
      )}

      {isSlave ? (
        <BodyRatingHistory snapshots={snapshots} pics={pics} />
      ) : pics.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No progress photos yet — once he uploads one, you can rate that week.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-[120px_1fr] sm:items-start">
            <div className="relative mx-auto aspect-[3/4] w-[120px] overflow-hidden rounded-lg border border-gold/20 bg-void/50">
              {selectedPic?.url && selectedPic.file_path ? (
                <WatermarkedFrame
                  className="absolute inset-0"
                  mediaPath={selectedPic.file_path}
                >
                  <Image
                    src={selectedPic.url}
                    alt={formatPicLabel(selectedPic)}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </WatermarkedFrame>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Progress pic</Label>
              <Select
                value={selectedPicId ?? undefined}
                onValueChange={setSelectedPicId}
              >
                <SelectTrigger className="border-gold/20 bg-void/60">
                  <SelectValue placeholder="Choose a photo" />
                </SelectTrigger>
                <SelectContent>
                  {pics.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {formatPicLabel(p)}
                      {p.rating_overall != null
                        ? ` · ${p.rating_overall}/100`
                        : " · unrated"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPic?.rating_overall != null && selectedPic.rated_at && (
                <p className="text-[11px] text-muted-foreground">
                  Already rated — saving updates this pic only, not older ones.
                </p>
              )}
            </div>
          </div>

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
              disabled={saving || !slave || !selectedPicId}
              onClick={() => void save()}
              className="bg-gold text-void hover:bg-gold-muted"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save to this pic
            </Button>
            {!slave && (
              <p className="text-xs text-muted-foreground">
                No slave account found.
              </p>
            )}
          </div>

          {snapshots.length > 0 && (
            <div className="border-t border-gold/10 pt-4">
              <p className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                History by week
              </p>
              <BodyRatingHistory snapshots={snapshots} pics={pics} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
