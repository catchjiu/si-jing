"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Crown,
  ImagePlus,
  Loader2,
  Moon,
  Pencil,
  Play,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { BODY_PART_LABELS, type WorkoutBodyPart } from "@/lib/workout-exercises";
import {
  formatVolume,
  sessionDurationMin,
  sessionVolume,
} from "@/lib/workout-stats";
import {
  QUEEN_WORKOUTS_PATH,
  copyWorkoutAsPlanned,
  fetchQueenId,
  signWorkoutMediaUrl,
  uploadWorkoutMedia,
  workoutStatusLabel,
} from "@/lib/workout-persist";
import type { WorkoutMedia, WorkoutSession, WorkoutSet } from "@/lib/types";
import { WorkoutDeleteButton } from "@/components/workouts/workout-delete-button";
import { WorkoutSessionSummary } from "@/components/workouts/workout-session-summary";
import { WorkoutCommentThread } from "@/components/workouts/workout-comment-thread";
import { WorkoutExerciseVideo } from "@/components/workouts/workout-exercise-video";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type MediaView = WorkoutMedia & { signedUrl?: string };

export default function QueenWorkoutDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const highlightCommentId = searchParams.get("comment");
  const { profile, isQueen, isSlave, loading: authLoading } = useAuth();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [sessionMedia, setSessionMedia] = useState<MediaView[]>([]);
  const [exerciseMedia, setExerciseMedia] = useState<MediaView[]>([]);
  const [loading, setLoading] = useState(true);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyDate, setCopyDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [copying, setCopying] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const load = useCallback(async () => {
    if (!profile || !id) return;
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      setSession(null);
      setLoading(false);
      return;
    }
    const s = data as WorkoutSession;
    if (s.athlete_role !== "queen") {
      router.replace(`/dashboard/workouts/${id}`);
      return;
    }
    setSession(s);

    const [setsRes, mediaRes] = await Promise.all([
      supabase
        .from("workout_sets")
        .select("*")
        .eq("session_id", id)
        .order("sort_order", { ascending: true })
        .order("set_number", { ascending: true }),
      supabase
        .from("workout_media")
        .select("*")
        .eq("session_id", id)
        .order("created_at", { ascending: true }),
    ]);
    setSets((setsRes.data ?? []) as WorkoutSet[]);
    const mediaRows = (mediaRes.data ?? []) as WorkoutMedia[];
    const signed = await Promise.all(
      mediaRows.map(async (m) => ({
        ...m,
        scope: m.scope ?? "session",
        signedUrl: await signWorkoutMediaUrl(m),
      }))
    );
    setSessionMedia(signed.filter((m) => (m.scope ?? "session") === "session"));
    setExerciseMedia(signed.filter((m) => m.scope === "exercise"));
    setLoading(false);
  }, [profile, id, router]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  const grouped = useMemo(() => {
    const map = new Map<string, WorkoutSet[]>();
    for (const s of sets) {
      const key = `${s.body_part}::${s.exercise_name}`;
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [sets]);

  const volume = sessionVolume(
    sets.map((s) => ({ reps: s.reps, weight: Number(s.weight) }))
  );
  const prCount = sets.filter((s) => s.is_pr).length;
  const exerciseCount = grouped.length;
  const mins = session ? sessionDurationMin(session) : null;

  const handleSessionMedia = async (files: FileList | null) => {
    if (!profile || !files?.length || !session) return;
    setUploadingMedia(true);
    const supabase = createClient();
    try {
      for (const file of Array.from(files)) {
        await uploadWorkoutMedia(supabase, session.id, profile.id, file);
      }
      toast.success("Video saved");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingMedia(false);
    }
  };

  const copyToDay = async () => {
    if (!session || !isSlave || !profile) return;
    if (!copyDate) {
      toast.error("Pick a day");
      return;
    }
    setCopying(true);
    const supabase = createClient();
    try {
      const queenId = await fetchQueenId(supabase);
      if (!queenId) throw new Error("Queen account not found");
      const newId = await copyWorkoutAsPlanned(supabase, {
        profileId: profile.id,
        queenId,
        sourceSessionId: session.id,
        targetDate: copyDate,
        notes: session.notes,
        athleteRole: "queen",
      });
      toast.success("Copied as planned workout — edit reps & weights");
      router.push(`${QUEEN_WORKOUTS_PATH}/plan/${newId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not copy workout");
      setCopying(false);
    }
  };

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!session) {
    return (
      <div className="space-y-4">
        <Link
          href={QUEEN_WORKOUTS_PATH}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <p className="text-sm text-muted-foreground">Workout not found.</p>
      </div>
    );
  }

  const isSkipped = session.status === "skipped";
  const isPlanned = session.status === "planned";
  const isInProgress = session.status === "in_progress";
  const dateLabel = new Date(
    `${session.performed_at}T12:00:00`
  ).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-8">
      <Link
        href={QUEEN_WORKOUTS_PATH}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Queen Workouts
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading flex flex-wrap items-center gap-2 text-2xl text-ivory">
            {isSkipped ? (
              <Moon className="h-6 w-6 text-muted-foreground" />
            ) : (
              <Crown className="h-6 w-6 text-gold" />
            )}
            {isSkipped ? "Rest day" : dateLabel}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {session.status !== "completed" && (
              <Badge
                variant="outline"
                className={
                  isSkipped
                    ? "border-muted-foreground/40 text-muted-foreground"
                    : isPlanned
                      ? "border-gold/40 text-gold"
                      : "border-emerald-400/40 text-emerald-300"
                }
              >
                {workoutStatusLabel(session.status)}
              </Badge>
            )}
            {!isSkipped && session.notes && (
              <p className="text-sm text-muted-foreground">{session.notes}</p>
            )}
          </div>
          {isSkipped && (
            <p className="mt-2 text-sm text-ivory/90">
              {session.notes || "No workout today."}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {isQueen && (isPlanned || isInProgress) && (
            <Button
              asChild
              size="sm"
              className="bg-gold text-void hover:bg-gold-muted"
            >
              <Link href={`${QUEEN_WORKOUTS_PATH}/log/${session.id}`}>
                <Play className="mr-1.5 h-4 w-4" />
                {isPlanned ? "Start workout" : "Continue"}
              </Link>
            </Button>
          )}
          {isSlave && isPlanned && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="border-gold/30 text-gold"
            >
              <Link href={`${QUEEN_WORKOUTS_PATH}/plan/${session.id}`}>
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit plan
              </Link>
            </Button>
          )}
          {isSlave && !isSkipped && sets.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCopyOpen((o) => !o)}
              className="border-gold/30 text-gold"
            >
              <Copy className="mr-1.5 h-4 w-4" />
              Copy to day
            </Button>
          )}
          <WorkoutDeleteButton
            sessionId={session.id}
            status={session.status}
            onDeleted={() => router.push(QUEEN_WORKOUTS_PATH)}
          />
        </div>
      </header>

      {isSlave && copyOpen && !isSkipped && sets.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-gold/20 bg-charcoal/80 p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="copy-queen-workout-date">
              Copy as planned workout on
            </Label>
            <Input
              id="copy-queen-workout-date"
              type="date"
              value={copyDate}
              onChange={(e) => setCopyDate(e.target.value)}
              className="border-gold/20 bg-void/60"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-gold/30"
              disabled={copying}
              onClick={() => setCopyOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={copying}
              onClick={() => void copyToDay()}
              className="bg-gold text-void hover:bg-gold-muted"
            >
              {copying ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Copy className="mr-1.5 h-4 w-4" />
              )}
              Copy
            </Button>
          </div>
        </div>
      )}

      {!isSkipped && (
        <WorkoutSessionSummary
          volume={volume}
          setCount={sets.length}
          exerciseCount={exerciseCount}
          durationMin={mins}
          prCount={prCount}
        />
      )}

      {!isSkipped && (
        <section className="space-y-4">
          <h2 className="font-heading text-xl text-gold">
            {isPlanned ? "Planned exercises" : "Exercises"}
          </h2>
          <ul className="space-y-3">
            {grouped.map(([key, group]) => {
              const first = group[0]!;
              const videos = exerciseMedia.filter(
                (m) =>
                  m.exercise_name === first.exercise_name &&
                  m.body_part === first.body_part
              );
              return (
                <li
                  key={key}
                  className="space-y-3 rounded-xl border border-gold/15 bg-charcoal/80 p-4"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="font-heading text-ivory">
                      {first.exercise_name}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {BODY_PART_LABELS[first.body_part]}
                    </span>
                    {group.some((s) => s.is_pr) && (
                      <Badge className="bg-gold/20 text-gold border-gold/40">
                        PR
                      </Badge>
                    )}
                  </div>
                  <ul className="space-y-1 text-sm text-ivory/85">
                    {group.map((s) => (
                      <li key={s.id} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">
                          Set {s.set_number}
                        </span>
                        <span>
                          {s.reps} reps · {Number(s.weight)} {s.unit}
                          {s.is_pr ? " · PR" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <WorkoutExerciseVideo
                    sessionId={session.id}
                    bodyPart={first.body_part as WorkoutBodyPart}
                    exerciseName={first.exercise_name}
                    videos={videos}
                    canUpload={isSlave}
                    onChanged={() => void load()}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(sessionMedia.length > 0 || isQueen) && (
        <section className="space-y-3">
          <h2 className="font-heading text-xl text-gold">Queen’s media</h2>
          {isQueen && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadingMedia}
              asChild
            >
              <label className="cursor-pointer">
                {uploadingMedia ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="mr-2 h-4 w-4" />
                )}
                Add photo / video
                <input
                  type="file"
                  accept="image/*,video/*,video/hevc,video/ogg,.hevc,.h265,.ogg,.ogv"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void handleSessionMedia(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </Button>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {sessionMedia.map((m) => (
              <div
                key={m.id}
                className="relative aspect-[4/5] overflow-hidden rounded-xl border border-gold/15"
              >
                {m.signedUrl && m.media_kind === "image" ? (
                  <WatermarkedFrame
                    className="absolute inset-0"
                    mediaPath={m.file_path}
                  >
                    <Image
                      src={m.signedUrl}
                      alt=""
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  </WatermarkedFrame>
                ) : m.signedUrl ? (
                  <video
                    src={m.signedUrl}
                    controls
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}

      <WorkoutCommentThread
        sessionId={session.id}
        sessionLabel={isSkipped ? "Rest day" : dateLabel}
        highlightCommentId={highlightCommentId}
      />
    </div>
  );
}
