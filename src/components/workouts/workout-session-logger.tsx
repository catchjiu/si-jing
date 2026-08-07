"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Cloud, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  BODY_PARTS,
  BODY_PART_LABELS,
  CUSTOM_EXERCISE_VALUE,
  WORKOUT_EXERCISES,
  type WorkoutBodyPart,
} from "@/lib/workout-exercises";
import {
  exerciseKey,
  formatVolume,
  sessionVolume,
} from "@/lib/workout-stats";
import { signObjectUrl, removeObject } from "@/lib/storage/client";
import type { WorkoutMedia, WorkoutSession, WorkoutSet } from "@/lib/types";
import {
  completeWorkoutSession,
  savePlannedWorkout,
  syncDraftSets,
  syncSessionFields,
  uploadWorkoutMedia,
  type DraftExercise,
  type DraftSet,
  type SessionFields,
} from "@/lib/workout-persist";
import { WorkoutWeightDial } from "@/components/workouts/workout-weight-dial";
import { WorkoutWheelPicker } from "@/components/workouts/workout-wheel-picker";
import { WorkoutDeleteButton } from "@/components/workouts/workout-delete-button";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const LONG_PRESS_MS = 480;
const MOVE_CANCEL_PX = 10;

type MediaView = WorkoutMedia & { signedUrl?: string };

const REPS_OPTS = Array.from({ length: 50 }, (_, i) => i + 1);
const SETS_OPTS = Array.from({ length: 20 }, (_, i) => i + 1);
const WEIGHT_OPTS = Array.from({ length: 201 }, (_, i) => i * 2.5);

function setsToDraft(sets: WorkoutSet[]): DraftExercise[] {
  const order: string[] = [];
  const map = new Map<string, DraftExercise>();
  for (const s of [...sets].sort(
    (a, b) => a.sort_order - b.sort_order || a.set_number - b.set_number
  )) {
    const key = `${s.body_part}::${s.exercise_name}`;
    if (!map.has(key)) {
      order.push(key);
      map.set(key, {
        key,
        body_part: s.body_part,
        exercise_name: s.exercise_name,
        sets: [],
      });
    }
    map.get(key)!.sets.push({
      reps: s.reps,
      weight: Number(s.weight),
    });
  }
  return order.map((k) => map.get(k)!);
}

export function WorkoutSessionLogger({
  sessionId,
  mode,
  className,
}: {
  sessionId: string;
  mode: "log" | "plan";
  className?: string;
}) {
  const { profile } = useAuth();
  const router = useRouter();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [performedAt, setPerformedAt] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState("");
  const [minutes, setMinutes] = useState("");
  const [draft, setDraft] = useState<DraftExercise[]>([]);
  const [media, setMedia] = useState<MediaView[]>([]);
  const [priorMax, setPriorMax] = useState<Map<string, number>>(new Map());
  const [recent, setRecent] = useState<string[]>([]);
  const [bodyPart, setBodyPart] = useState<WorkoutBodyPart>("chest");
  const [exercise, setExercise] = useState("");
  const [customName, setCustomName] = useState("");
  const [reps, setReps] = useState(10);
  const [weight, setWeight] = useState(20);
  const [setCount, setSetCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const [removingMediaId, setRemovingMediaId] = useState<string | null>(null);
  const [editingExerciseKey, setEditingExerciseKey] = useState<string | null>(
    null
  );

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressRef = useRef<{
    timer: number | null;
    startX: number;
    startY: number;
    exKey: string | null;
    fired: boolean;
  }>({ timer: null, startX: 0, startY: 0, exKey: null, fired: false });
  const draftRef = useRef(draft);
  const fieldsRef = useRef<SessionFields>({ performed_at: performedAt, notes, minutes });

  draftRef.current = draft;
  fieldsRef.current = { performed_at: performedAt, notes, minutes };

  const exerciseName =
    exercise === CUSTOM_EXERCISE_VALUE ? customName.trim() : exercise;
  const presets = WORKOUT_EXERCISES[bodyPart];

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    const { data: sessionRow, error } = await supabase
      .from("workout_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (error || !sessionRow) {
      setSession(null);
      setLoading(false);
      return;
    }
    const s = sessionRow as WorkoutSession;
    if (s.created_by !== profile.id) {
      setSession(null);
      setLoading(false);
      return;
    }
    setSession(s);
    setPerformedAt(s.performed_at);
    setNotes(s.notes ?? "");
    setMinutes(s.duration_minutes != null ? String(s.duration_minutes) : "");

    const [setsRes, mediaRes] = await Promise.all([
      supabase
        .from("workout_sets")
        .select("*")
        .eq("session_id", sessionId)
        .order("sort_order", { ascending: true })
        .order("set_number", { ascending: true }),
      supabase
        .from("workout_media")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
    ]);
    setDraft(setsToDraft((setsRes.data ?? []) as WorkoutSet[]));
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
  }, [profile, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadHistory = useCallback(async () => {
    if (!profile) return;
    const supabase = createClient();
    const { data: mySessions } = await supabase
      .from("workout_sessions")
      .select("id")
      .eq("created_by", profile.id)
      .eq("status", "completed")
      .neq("id", sessionId)
      .limit(50);
    const sessionIds = ((mySessions ?? []) as { id: string }[]).map((s) => s.id);
    if (sessionIds.length === 0) {
      setPriorMax(new Map());
      setRecent([]);
      return;
    }
    const { data } = await supabase
      .from("workout_sets")
      .select("exercise_name, body_part, weight, reps, created_at")
      .in("session_id", sessionIds)
      .order("created_at", { ascending: false })
      .limit(200);

    const mine = (data ?? []) as {
      exercise_name: string;
      body_part: WorkoutBodyPart;
      weight: number;
    }[];
    const seen = new Set<string>();
    const recentNames: string[] = [];
    const maxMap = new Map<string, number>();
    for (const r of mine) {
      const key = exerciseKey(r.body_part, r.exercise_name);
      if (!maxMap.has(key)) maxMap.set(key, Number(r.weight));
      else maxMap.set(key, Math.max(maxMap.get(key)!, Number(r.weight)));
      if (r.body_part === bodyPart && !seen.has(r.exercise_name)) {
        seen.add(r.exercise_name);
        recentNames.push(r.exercise_name);
      }
    }
    setPriorMax(maxMap);
    setRecent(recentNames.slice(0, 8));
  }, [profile, bodyPart, sessionId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const persistNow = useCallback(async () => {
    if (!profile) return;
    setSaveState("saving");
    const supabase = createClient();
    try {
      await syncSessionFields(supabase, sessionId, fieldsRef.current);
      await syncDraftSets(
        supabase,
        sessionId,
        draftRef.current,
        priorMax,
        false
      );
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (err) {
      setSaveState("idle");
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }, [profile, sessionId, priorMax]);

  const schedulePersist = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persistNow();
    }, 800);
  }, [persistNow]);

  useEffect(() => {
    if (loading) return;
    schedulePersist();
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft, performedAt, notes, minutes, loading, schedulePersist]);

  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      void persistNow();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [persistNow]);

  const pickExercise = (name: string) => {
    setExercise(name);
    if (name === CUSTOM_EXERCISE_VALUE) return;
    const last = priorMax.get(exerciseKey(bodyPart, name));
    if (last != null) setWeight(last);
  };

  useEffect(() => {
    if (!profile || !exerciseName) return;
    void (async () => {
      const supabase = createClient();
      const { data: mySessions } = await supabase
        .from("workout_sessions")
        .select("id")
        .eq("created_by", profile.id)
        .eq("status", "completed")
        .limit(50);
      const sessionIds = ((mySessions ?? []) as { id: string }[]).map((s) => s.id);
      if (sessionIds.length === 0) return;
      const { data } = await supabase
        .from("workout_sets")
        .select("weight, reps")
        .eq("body_part", bodyPart)
        .eq("exercise_name", exerciseName)
        .in("session_id", sessionIds)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setWeight(Number((data as { weight: number }).weight));
        setReps(Number((data as { reps: number }).reps));
      }
    })();
  }, [profile, bodyPart, exerciseName]);

  const addSets = () => {
    if (!exerciseName) {
      toast.error("Pick an exercise");
      return;
    }
    const key = `${bodyPart}::${exerciseName}`;
    const newSets: DraftSet[] = Array.from({ length: setCount }, () => ({
      reps,
      weight,
    }));
    setDraft((prev) => {
      const existing = prev.find((e) => e.key === key);
      if (existing) {
        return prev.map((e) =>
          e.key === key ? { ...e, sets: [...e.sets, ...newSets] } : e
        );
      }
      return [
        ...prev,
        {
          key,
          body_part: bodyPart,
          exercise_name: exerciseName,
          sets: newSets,
        },
      ];
    });
    toast.success(setCount === 1 ? "Set added" : `${setCount} sets added`);
  };

  const updateSet = (
    exKey: string,
    setIdx: number,
    patch: Partial<DraftSet>
  ) => {
    setDraft((prev) =>
      prev.map((ex) => {
        if (ex.key !== exKey) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, i) => (i === setIdx ? { ...s, ...patch } : s)),
        };
      })
    );
  };

  const removeSet = (exKey: string, setIdx: number) => {
    setDraft((prev) =>
      prev
        .map((ex) => {
          if (ex.key !== exKey) return ex;
          return { ...ex, sets: ex.sets.filter((_, i) => i !== setIdx) };
        })
        .filter((ex) => ex.sets.length > 0)
    );
  };

  const removeExercise = (key: string) => {
    setDraft((prev) => prev.filter((e) => e.key !== key));
  };

  const editingExercise =
    editingExerciseKey != null
      ? (draft.find((e) => e.key === editingExerciseKey) ?? null)
      : null;

  const clearLongPress = useCallback(() => {
    const ref = longPressRef.current;
    if (ref.timer != null) {
      window.clearTimeout(ref.timer);
      ref.timer = null;
    }
  }, []);

  useEffect(() => () => clearLongPress(), [clearLongPress]);

  const openExerciseEdit = useCallback((exKey: string) => {
    setEditingExerciseKey(exKey);
    navigator.vibrate?.(10);
  }, []);

  const onCardPointerDown = (e: ReactPointerEvent, exKey: string) => {
    if (mode !== "plan" || e.button !== 0) return;
    clearLongPress();
    const ref = longPressRef.current;
    ref.startX = e.clientX;
    ref.startY = e.clientY;
    ref.exKey = exKey;
    ref.fired = false;
    ref.timer = window.setTimeout(() => {
      ref.fired = true;
      openExerciseEdit(exKey);
    }, LONG_PRESS_MS);
  };

  const onCardPointerMove = (e: ReactPointerEvent) => {
    const ref = longPressRef.current;
    if (ref.timer == null) return;
    const dx = Math.abs(e.clientX - ref.startX);
    const dy = Math.abs(e.clientY - ref.startY);
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) clearLongPress();
  };

  const onCardPointerUp = () => {
    clearLongPress();
  };

  const handleMediaPick = async (files: FileList | null) => {
    if (!profile || !files?.length) return;
    setUploadingMedia(true);
    const supabase = createClient();
    try {
      for (const file of Array.from(files)) {
        await uploadWorkoutMedia(supabase, sessionId, profile.id, file);
      }
      await load();
      toast.success("Photo saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingMedia(false);
    }
  };

  const removeMedia = async (m: MediaView) => {
    setRemovingMediaId(m.id);
    const supabase = createClient();
    await removeObject({ bucket: "workouts", path: m.file_path }).catch(
      () => undefined
    );
    const { error } = await supabase.from("workout_media").delete().eq("id", m.id);
    setRemovingMediaId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMedia((prev) => prev.filter((x) => x.id !== m.id));
  };

  const finishLog = async () => {
    if (!profile) return;
    if (draft.length === 0) {
      toast.error("Add at least one set");
      return;
    }
    const minsParsed =
      minutes.trim() === "" ? null : Number.parseInt(minutes, 10);
    if (minsParsed != null && (!Number.isFinite(minsParsed) || minsParsed < 0)) {
      toast.error("Minutes must be 0 or more");
      return;
    }
    setFinishing(true);
    const supabase = createClient();
    try {
      const fields: SessionFields = { performed_at: performedAt, notes, minutes };
      const { prCount, volume } = await completeWorkoutSession(supabase, {
        sessionId,
        draft,
        priorMax,
        fields,
      });

      const { notifyPush } = await import("@/lib/push-client");
      await notifyPush({
        title: "New workout logged",
        body: `${draft.length} exercises · ${formatVolume(volume)}`,
        url: `/dashboard/workouts/${sessionId}`,
        target: "queen",
        kind: "workout_new",
      });
      if (prCount > 0) {
        await notifyPush({
          title: "Personal record!",
          body: `${prCount} PR${prCount === 1 ? "" : "s"} this session`,
          url: `/dashboard/workouts/${sessionId}`,
          target: "queen",
          kind: "workout_pr",
        });
      }

      toast.success(
        prCount
          ? `Workout complete · ${prCount} PR${prCount === 1 ? "" : "s"}!`
          : "Workout complete"
      );
      router.push(`/dashboard/workouts/${sessionId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not finish");
    } finally {
      setFinishing(false);
    }
  };

  const savePlan = async () => {
    if (draft.length === 0) {
      toast.error("Add at least one exercise");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    try {
      await savePlannedWorkout(supabase, {
        sessionId,
        draft,
        fields: { performed_at: performedAt, notes, minutes },
      });
      toast.success("Workout plan saved");
      router.push(`/dashboard/workouts/${sessionId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save plan");
    } finally {
      setSaving(false);
    }
  };

  const totalSets = draft.reduce((n, e) => n + e.sets.length, 0);
  const volume = useMemo(
    () =>
      sessionVolume(
        draft.flatMap((e) => e.sets.map((s) => ({ reps: s.reps, weight: s.weight })))
      ),
    [draft]
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading session…</p>;
  }

  if (!session) {
    return <p className="text-sm text-muted-foreground">Session not found.</p>;
  }

  const title =
    mode === "plan"
      ? "Plan workout"
      : session.status === "planned"
        ? "Log planned workout"
        : "Log workout";

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-xl text-gold">{title}</h2>
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "flex items-center gap-1 text-[11px]",
              saveState === "saving"
                ? "text-muted-foreground"
                : saveState === "saved"
                  ? "text-emerald-400"
                  : "text-muted-foreground/60"
            )}
          >
            {saveState === "saving" ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </>
            ) : saveState === "saved" ? (
              <>
                <Check className="h-3 w-3" /> Saved
              </>
            ) : (
              <>
                <Cloud className="h-3 w-3" /> Auto-save on
              </>
            )}
          </span>
          <WorkoutDeleteButton
            sessionId={sessionId}
            status={session.status}
            onDeleted={() => router.push("/dashboard/workouts")}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {mode === "plan"
          ? "Add target exercises and sets. Come back later to log what you actually did."
          : "Your progress saves automatically — safe to switch apps or add photos anytime."}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="log-performed-at">Date</Label>
          <Input
            id="log-performed-at"
            type="date"
            value={performedAt}
            onChange={(e) => setPerformedAt(e.target.value)}
            className="border-gold/20 bg-void/60"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="log-minutes">Minutes</Label>
          <Input
            id="log-minutes"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            placeholder="e.g. 45"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="border-gold/20 bg-void/60"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Notes / intensity (optional)</Label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Hard, pump day…"
          className="border-gold/20 bg-void/60"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {BODY_PARTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setBodyPart(p);
              setExercise("");
              setCustomName("");
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-colors",
              bodyPart === p
                ? "border-gold bg-gold/15 text-gold"
                : "border-gold/20 text-muted-foreground"
            )}
          >
            {BODY_PART_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <Label>Exercise</Label>
        <select
          className="w-full rounded-md border border-gold/20 bg-void/60 px-3 py-2 text-sm text-ivory"
          value={exercise}
          onChange={(e) => pickExercise(e.target.value)}
        >
          <option value="">Select exercise…</option>
          {recent.length > 0 && (
            <optgroup label="Recently used">
              {recent.map((n) => (
                <option key={`r-${n}`} value={n}>
                  {n}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Presets">
            {presets.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </optgroup>
          <option value={CUSTOM_EXERCISE_VALUE}>Custom…</option>
        </select>
        {exercise === CUSTOM_EXERCISE_VALUE && (
          <Input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Exercise name"
            className="border-gold/20 bg-void/60"
          />
        )}
      </div>

      <WorkoutWeightDial
        weight={weight}
        setLabel={`SET ${(draft.find((d) => d.key === `${bodyPart}::${exerciseName}`)?.sets.length ?? 0) + 1} · ${(exerciseName || "EXERCISE").toUpperCase()}`}
      />

      <div className="grid grid-cols-3 gap-2">
        <WorkoutWheelPicker
          label="Sets"
          value={setCount}
          options={SETS_OPTS}
          onChange={setSetCount}
        />
        <WorkoutWheelPicker
          label="Reps"
          value={reps}
          options={REPS_OPTS}
          onChange={setReps}
        />
        <WorkoutWheelPicker
          label="Weight"
          value={weight}
          options={WEIGHT_OPTS}
          onChange={setWeight}
        />
      </div>

      <Button
        type="button"
        onClick={addSets}
        className="w-full bg-gold text-void hover:bg-gold-muted"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add {setCount === 1 ? "set" : `${setCount} sets`}
      </Button>

      {draft.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-heading text-gold">
                {mode === "plan" ? "Planned exercises" : "This session"}
              </p>
              {mode === "plan" && (
                <p className="text-[11px] text-muted-foreground">
                  Long-press to edit sets
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalSets} sets · {formatVolume(volume)}
            </p>
          </div>
          <ul className="space-y-3">
            {draft.map((ex) => (
              <li
                key={ex.key}
                className={cn(
                  "space-y-2 rounded-xl border border-gold/15 bg-charcoal/70 p-3",
                  mode === "plan" && "touch-manipulation select-none"
                )}
                onPointerDown={
                  mode === "plan"
                    ? (e) => onCardPointerDown(e, ex.key)
                    : undefined
                }
                onPointerMove={mode === "plan" ? onCardPointerMove : undefined}
                onPointerUp={mode === "plan" ? onCardPointerUp : undefined}
                onPointerLeave={mode === "plan" ? onCardPointerUp : undefined}
                onPointerCancel={mode === "plan" ? onCardPointerUp : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm text-ivory">{ex.exercise_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {BODY_PART_LABELS[ex.body_part]}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeExercise(ex.key)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="text-muted-foreground hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {mode === "log" && (
                  <ul className="space-y-2">
                    {ex.sets.map((s, idx) => (
                      <li
                        key={`${ex.key}-${idx}`}
                        className="grid grid-cols-[auto_1fr_1fr_auto] items-end gap-2"
                      >
                        <span className="pb-2 text-xs text-muted-foreground">
                          #{idx + 1}
                        </span>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Reps</Label>
                          <Input
                            type="number"
                            min={1}
                            value={s.reps}
                            onChange={(e) =>
                              updateSet(ex.key, idx, {
                                reps: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="h-9 border-gold/20 bg-void/60"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">kg</Label>
                          <Input
                            type="number"
                            min={0}
                            step={0.5}
                            value={s.weight}
                            onChange={(e) =>
                              updateSet(ex.key, idx, {
                                weight: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="h-9 border-gold/20 bg-void/60"
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeSet(ex.key, idx)}
                          className="h-9 w-9 p-0 text-muted-foreground hover:text-red-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {mode === "plan" && (
                  <p className="text-xs text-gold/80">
                    {ex.sets.map((s) => `${s.reps}×${s.weight}`).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog
        open={editingExercise != null}
        onOpenChange={(open) => {
          if (!open) setEditingExerciseKey(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto border-gold/20 bg-charcoal sm:max-w-md">
          {editingExercise && (
            <>
              <DialogHeader>
                <DialogTitle className="text-gold">
                  {editingExercise.exercise_name}
                </DialogTitle>
                <DialogDescription>
                  {BODY_PART_LABELS[editingExercise.body_part]} · Edit reps and
                  weight for each set
                </DialogDescription>
              </DialogHeader>
              <ul className="space-y-2">
                {editingExercise.sets.map((s, idx) => (
                  <li
                    key={`${editingExercise.key}-${idx}`}
                    className="grid grid-cols-[auto_1fr_1fr_auto] items-end gap-2"
                  >
                    <span className="pb-2 text-xs text-muted-foreground">
                      #{idx + 1}
                    </span>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Reps</Label>
                      <Input
                        type="number"
                        min={1}
                        value={s.reps}
                        onChange={(e) =>
                          updateSet(editingExercise.key, idx, {
                            reps: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="h-9 border-gold/20 bg-void/60"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">kg</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        value={s.weight}
                        onChange={(e) =>
                          updateSet(editingExercise.key, idx, {
                            weight: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="h-9 border-gold/20 bg-void/60"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        removeSet(editingExercise.key, idx);
                        if (editingExercise.sets.length <= 1) {
                          setEditingExerciseKey(null);
                        }
                      }}
                      className="h-9 w-9 p-0 text-muted-foreground hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="space-y-3">
        <p className="font-heading text-gold">Photos / video</p>
        {media.length > 0 && (
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
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={removingMediaId === m.id}
                  onClick={() => void removeMedia(m)}
                  className="absolute right-2 top-2 h-8 w-8 bg-void/70 p-0 text-ivory hover:text-red-300"
                >
                  {removingMediaId === m.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
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
              Photo / video
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleMediaPick(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </Button>
        </div>
      </div>

      {mode === "plan" ? (
        <Button
          type="button"
          disabled={saving || draft.length === 0}
          onClick={() => void savePlan()}
          className="w-full bg-gold text-void hover:bg-gold-muted"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save plan
        </Button>
      ) : (
        <Button
          type="button"
          disabled={finishing || draft.length === 0}
          onClick={() => void finishLog()}
          className="w-full bg-gold text-void hover:bg-gold-muted"
        >
          {finishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Complete workout
        </Button>
      )}
    </div>
  );
}
