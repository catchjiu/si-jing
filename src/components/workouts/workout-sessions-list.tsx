"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Dumbbell, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { signObjectUrl } from "@/lib/storage/client";
import {
  formatVolume,
  sessionVolume,
  buildSparklineSeries,
} from "@/lib/workout-stats";
import { workoutStatusLabel } from "@/lib/workout-persist";
import type { WorkoutMedia, WorkoutSession, WorkoutSet } from "@/lib/types";
import { WorkoutExerciseSparkline } from "@/components/workouts/workout-exercise-sparkline";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SessionPreview = {
  mediaKind: WorkoutMedia["media_kind"];
  filePath: string;
  signedUrl?: string;
};

type SessionCard = WorkoutSession & {
  sets: WorkoutSet[];
  spark: number[];
  volume: number;
  prCount: number;
  exerciseCount: number;
  preview: SessionPreview | null;
};

function pickPreview(media: WorkoutMedia[]): WorkoutMedia | null {
  if (media.length === 0) return null;
  return media.find((m) => m.media_kind === "image") ?? media[0] ?? null;
}

export function WorkoutSessionsList({ className }: { className?: string }) {
  const { profile, isSlave } = useAuth();
  const [items, setItems] = useState<SessionCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      setLoading(true);
      const supabase = createClient();
      let query = supabase
        .from("workout_sessions")
        .select("*")
        .order("performed_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30);
      if (isSlave) query = query.eq("created_by", profile.id);
      const { data } = await query;
      const rows = (data ?? []) as WorkoutSession[];
      const ids = rows.map((r) => r.id);
      const setsBySession = new Map<string, WorkoutSet[]>();
      const mediaBySession = new Map<string, WorkoutMedia[]>();
      if (ids.length > 0) {
        const [{ data: setRows }, { data: mediaRows }] = await Promise.all([
          supabase.from("workout_sets").select("*").in("session_id", ids),
          supabase
            .from("workout_media")
            .select("*")
            .in("session_id", ids)
            .order("created_at", { ascending: true }),
        ]);
        for (const s of (setRows ?? []) as WorkoutSet[]) {
          const list = setsBySession.get(s.session_id) ?? [];
          list.push(s);
          setsBySession.set(s.session_id, list);
        }
        for (const m of (mediaRows ?? []) as WorkoutMedia[]) {
          const list = mediaBySession.get(m.session_id) ?? [];
          list.push(m);
          mediaBySession.set(m.session_id, list);
        }
      }

      const cards = await Promise.all(
        rows.map(async (r) => {
          const sets = setsBySession.get(r.id) ?? [];
          const weights = sets.map((s) => Number(s.weight));
          const names = new Set(sets.map((s) => s.exercise_name));
          const previewMedia = pickPreview(mediaBySession.get(r.id) ?? []);
          const preview: SessionPreview | null = previewMedia
            ? {
                mediaKind: previewMedia.media_kind,
                filePath: previewMedia.file_path,
                signedUrl:
                  (await signObjectUrl({
                    bucket: "workouts",
                    path: previewMedia.file_path,
                  })) ?? undefined,
              }
            : null;
          return {
            ...r,
            sets,
            volume: sessionVolume(
              sets.map((s) => ({ reps: s.reps, weight: Number(s.weight) }))
            ),
            prCount: sets.filter((s) => s.is_pr).length,
            exerciseCount: names.size,
            spark: buildSparklineSeries(
              weights.map((w, i) => ({
                at: String(i),
                weight: w,
              }))
            ),
            preview,
          };
        })
      );
      setItems(cards);
      setLoading(false);
    })();
  }, [profile, isSlave]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading sessions…</p>;
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-10 text-center text-sm text-muted-foreground">
        No workouts logged yet.
      </p>
    );
  }

  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((s, i) => (
        <li
          key={s.id}
          className="animate-in fade-in slide-in-from-bottom-2"
          style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
        >
          <Link
            href={
              isSlave &&
              (s.status === "planned" || s.status === "in_progress")
                ? `/dashboard/workouts/log/${s.id}`
                : `/dashboard/workouts/${s.id}`
            }
            className="flex gap-3 rounded-xl border border-gold/15 bg-charcoal/80 p-4 transition hover:border-gold/40"
          >
            <div className="w-1 shrink-0 rounded-full bg-gold/70" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-heading text-ivory">
                  {new Date(`${s.performed_at}T12:00:00`).toLocaleDateString(
                    undefined,
                    { weekday: "short", month: "short", day: "numeric" }
                  )}
                </p>
                {s.status !== "completed" && (
                  <Badge
                    variant="outline"
                    className={
                      s.status === "skipped"
                        ? "border-muted-foreground/40 text-muted-foreground"
                        : s.status === "in_progress"
                          ? "border-emerald-400/40 text-emerald-300"
                          : "border-gold/40 text-gold"
                    }
                  >
                    {workoutStatusLabel(s.status)}
                  </Badge>
                )}
                {s.prCount > 0 && (
                  <Badge className="bg-gold/20 text-gold border-gold/40">
                    {s.prCount} PR
                  </Badge>
                )}
                {s.queen_impressed != null && (
                  <Badge variant="outline" className="border-gold/30 text-gold">
                    Impressed {s.queen_impressed}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {s.status === "skipped"
                  ? s.notes || "Rest day"
                  : `${s.exerciseCount} exercises · ${s.sets.length} sets · ${formatVolume(s.volume)}`}
              </p>
              {s.status === "completed" && (
                <WorkoutExerciseSparkline values={s.spark} className="mt-1 h-8 w-28" />
              )}
            </div>
            <div className="relative h-16 w-14 shrink-0 self-center overflow-hidden rounded-lg border border-gold/20 bg-void/50">
              {s.preview?.signedUrl && s.preview.mediaKind === "image" ? (
                <WatermarkedFrame
                  className="absolute inset-0"
                  mediaPath={s.preview.filePath}
                  sizeClassName="text-[0.45rem]"
                >
                  <Image
                    src={s.preview.signedUrl}
                    alt=""
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </WatermarkedFrame>
              ) : s.preview?.signedUrl ? (
                <>
                  <video
                    src={s.preview.signedUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-void/35">
                    <Play className="h-4 w-4 fill-gold text-gold" />
                  </span>
                </>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gold/40">
                  <Dumbbell className="h-5 w-5" />
                </div>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
