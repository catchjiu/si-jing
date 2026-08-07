"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Dumbbell,
  Loader2,
  Moon,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { BODY_PART_LABELS } from "@/lib/workout-exercises";
import {
  formatVolume,
  sessionDurationMin,
  sessionVolume,
} from "@/lib/workout-stats";
import { signObjectUrl, removeObject } from "@/lib/storage/client";
import {
  copyWorkoutAsPlanned,
  fetchQueenId,
  workoutStatusLabel,
} from "@/lib/workout-persist";
import type { WorkoutMedia, WorkoutSession, WorkoutSet } from "@/lib/types";
import { WorkoutSessionSummary } from "@/components/workouts/workout-session-summary";
import { WorkoutSessionEditor } from "@/components/workouts/workout-session-editor";
import { WorkoutQueenReaction } from "@/components/workouts/workout-queen-reaction";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type MediaView = WorkoutMedia & { signedUrl?: string };

export default function WorkoutDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const { profile, isQueen, isSlave, loading: authLoading } = useAuth();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [media, setMedia] = useState<MediaView[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyDate, setCopyDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [copying, setCopying] = useState(false);

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
    setMedia(
      await Promise.all(
        mediaRows.map(async (m) => ({
          ...m,
          signedUrl:
            (await signObjectUrl({ bucket: "workouts", path: m.file_path })) ??
            undefined,
        }))
      )
    );
    setLoading(false);
  }, [profile, id]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  useEffect(() => {
    if (!authLoading && profile && session && isSlave) {
      if (session.status === "in_progress") {
        router.replace(`/dashboard/workouts/log/${id}`);
      }
    }
  }, [authLoading, profile, session, isSlave, id, router]);

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

  const deleteSession = async () => {
    if (!session || !isSlave) return;
    if (!window.confirm("Delete this workout?")) return;
    setDeleting(true);
    const supabase = createClient();
    for (const m of media) {
      await removeObject({ bucket: "workouts", path: m.file_path }).catch(
        () => undefined
      );
    }
    const { error } = await supabase
      .from("workout_sessions")
      .delete()
      .eq("id", session.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Workout deleted");
    router.push("/dashboard/workouts");
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
      });
      toast.success("Copied as planned workout — edit reps & weights");
      router.push(`/dashboard/workouts/plan/${newId}`);
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
          href="/dashboard/workouts"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <p className="text-sm text-muted-foreground">Workout not found.</p>
      </div>
    );
  }

  if (editing && isSlave) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/workouts"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Workouts
        </Link>
        <WorkoutSessionEditor
          session={session}
          sets={sets}
          media={media}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void load();
          }}
        />
      </div>
    );
  }

  const isSkipped = session.status === "skipped";
  const isPlanned = session.status === "planned";
  const isCompleted = session.status === "completed";

  return (
    <div className="space-y-8">
      <Link
        href="/dashboard/workouts"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Workouts
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading flex flex-wrap items-center gap-2 text-2xl text-ivory">
            {isSkipped ? (
              <Moon className="h-6 w-6 text-muted-foreground" />
            ) : (
              <Dumbbell className="h-6 w-6 text-gold" />
            )}
            {isSkipped
              ? "Rest day"
              : new Date(`${session.performed_at}T12:00:00`).toLocaleDateString(
                  undefined,
                  { weekday: "long", month: "long", day: "numeric" }
                )}
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
          {isSkipped && session.notes && (
            <p className="mt-2 text-sm text-ivory/90">{session.notes}</p>
          )}
          {isSkipped && !session.notes && (
            <p className="mt-2 text-sm text-muted-foreground">No workout today.</p>
          )}
        </div>
        {isSlave && (
          <div className="flex flex-wrap items-center gap-1">
            {isPlanned && (
              <>
                <Button
                  asChild
                  size="sm"
                  className="bg-gold text-void hover:bg-gold-muted"
                >
                  <Link href={`/dashboard/workouts/log/${session.id}`}>
                    <Play className="mr-1.5 h-4 w-4" />
                    Start workout
                  </Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="border-gold/30 text-gold"
                >
                  <Link href={`/dashboard/workouts/plan/${session.id}`}>
                    <Pencil className="mr-1.5 h-4 w-4" />
                    Edit plan
                  </Link>
                </Button>
              </>
            )}
            {isCompleted && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
                className="border-gold/30 text-gold"
              >
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
            )}
            {!isSkipped && sets.length > 0 && (
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
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={deleting}
              onClick={() => void deleteSession()}
              className="text-muted-foreground hover:text-red-300"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </header>

      {isSlave && copyOpen && !isSkipped && sets.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-gold/20 bg-charcoal/80 p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="copy-workout-date">Copy as planned workout on</Label>
            <Input
              id="copy-workout-date"
              type="date"
              value={copyDate}
              onChange={(e) => setCopyDate(e.target.value)}
              className="border-gold/20 bg-void/60"
            />
            <p className="text-[11px] text-muted-foreground">
              Same exercises &amp; sets — then edit reps and weights on the plan.
            </p>
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

      {(session.queen_impressed != null || session.queen_note) && (
        <div className="rounded-xl border border-gold/25 bg-gold/8 p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Queen’s reaction
          </p>
          {session.queen_impressed != null && (
            <p className="font-heading text-xl text-gold">
              Impressed {session.queen_impressed}/100
            </p>
          )}
          {session.queen_note && (
            <p className="mt-1 text-sm text-ivory/90">{session.queen_note}</p>
          )}
        </div>
      )}

      {isQueen && (
        <WorkoutQueenReaction session={session} onSaved={setSession} />
      )}

      {!isSkipped && (
      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">
          {isPlanned ? "Planned exercises" : "Exercises"}
        </h2>
        <ul className="space-y-3">
          {grouped.map(([key, group]) => {
            const first = group[0]!;
            return (
              <li
                key={key}
                className="rounded-xl border border-gold/15 bg-charcoal/80 p-4"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="font-heading text-ivory">{first.exercise_name}</p>
                  <span className="text-xs text-muted-foreground">
                    {BODY_PART_LABELS[first.body_part]}
                  </span>
                  {group.some((s) => s.is_pr) && (
                    <Badge className="bg-gold/20 text-gold border-gold/40">PR</Badge>
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
              </li>
            );
          })}
        </ul>
      </section>
      )}

      {media.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-heading text-xl text-gold">Media</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {media.map((m) => (
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
    </div>
  );
}
