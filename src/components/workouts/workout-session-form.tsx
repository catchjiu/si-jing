"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
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
  detectPr,
  exerciseKey,
  sessionVolume,
  formatVolume,
} from "@/lib/workout-stats";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import {
  MAX_VIDEO_BYTES,
  prepareVideoForUpload,
  isAcceptedVideoUpload,
} from "@/lib/video-compress";
import { presignAndUpload } from "@/lib/storage/client";
import type { Profile } from "@/lib/types";
import { WorkoutWeightDial } from "@/components/workouts/workout-weight-dial";
import { WorkoutWheelPicker } from "@/components/workouts/workout-wheel-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type DraftSet = {
  reps: number;
  weight: number;
  is_pr?: boolean;
};

type DraftExercise = {
  key: string;
  body_part: WorkoutBodyPart;
  exercise_name: string;
  sets: DraftSet[];
};

const REPS_OPTS = Array.from({ length: 50 }, (_, i) => i + 1);
const SETS_OPTS = Array.from({ length: 20 }, (_, i) => i + 1);
const WEIGHT_OPTS = Array.from({ length: 201 }, (_, i) => i * 2.5);

export function WorkoutSessionForm({ className }: { className?: string }) {
  const { profile } = useAuth();
  const router = useRouter();
  const [queen, setQueen] = useState<Profile | null>(null);
  const [bodyPart, setBodyPart] = useState<WorkoutBodyPart>("chest");
  const [exercise, setExercise] = useState("");
  const [customName, setCustomName] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [priorMax, setPriorMax] = useState<Map<string, number>>(new Map());
  const [reps, setReps] = useState(10);
  const [weight, setWeight] = useState(20);
  const [setCount, setSetCount] = useState(1);
  const [draft, setDraft] = useState<DraftExercise[]>([]);
  const [notes, setNotes] = useState("");
  const [minutes, setMinutes] = useState("");
  const [performedAt, setPerformedAt] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [startedAt] = useState(() => new Date().toISOString());

  const exerciseName =
    exercise === CUSTOM_EXERCISE_VALUE ? customName.trim() : exercise;

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("role", "queen")
        .limit(1)
        .maybeSingle();
      setQueen((data as Profile | null) ?? null);
    })();
  }, []);

  const loadHistory = useCallback(async () => {
    if (!profile) return;
    const supabase = createClient();
    const { data: mySessions } = await supabase
      .from("workout_sessions")
      .select("id")
      .eq("created_by", profile.id)
      .limit(50);
    const sessionIds = ((mySessions ?? []) as { id: string }[]).map((s) => s.id);
    if (sessionIds.length === 0) {
      setPriorMax(new Map());
      setRecent([]);
      return;
    }

    const { data } = await supabase
      .from("workout_sets")
      .select("exercise_name, body_part, weight, reps, created_at, session_id")
      .in("session_id", sessionIds)
      .order("created_at", { ascending: false })
      .limit(200);

    const mine = (data ?? []) as {
      exercise_name: string;
      body_part: WorkoutBodyPart;
      weight: number;
      reps: number;
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
  }, [profile, bodyPart]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const presets = WORKOUT_EXERCISES[bodyPart];

  const pickExercise = (name: string) => {
    setExercise(name);
    if (name === CUSTOM_EXERCISE_VALUE) return;
    const key = exerciseKey(bodyPart, name);
    const last = priorMax.get(key);
    if (last != null) setWeight(last);
    // try last reps from draft history via a quick query-ish: keep weight only from priorMax;
    // reps stay until we load last set details — optional enhance
  };

  useEffect(() => {
    if (!profile || !exerciseName) return;
    void (async () => {
      const supabase = createClient();
      const { data: mySessions } = await supabase
        .from("workout_sessions")
        .select("id")
        .eq("created_by", profile.id)
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
    toast.success(
      setCount === 1 ? "Set added" : `${setCount} sets added`
    );
  };

  const removeExercise = (key: string) => {
    setDraft((prev) => prev.filter((e) => e.key !== key));
  };

  const totalSets = draft.reduce((n, e) => n + e.sets.length, 0);
  const volume = useMemo(
    () =>
      sessionVolume(
        draft.flatMap((e) => e.sets.map((s) => ({ reps: s.reps, weight: s.weight })))
      ),
    [draft]
  );

  const save = async () => {
    if (!profile || !queen) {
      toast.error("Queen account not found");
      return;
    }
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
    setSaving(true);
    const supabase = createClient();
    try {
      const flat = draft.flatMap((e) =>
        e.sets.map((s) => ({
          body_part: e.body_part,
          exercise_name: e.exercise_name,
          reps: s.reps,
          weight: s.weight,
        }))
      );
      const prFlags = detectPr(flat, priorMax);

      const { data: session, error: sErr } = await supabase
        .from("workout_sessions")
        .insert({
          created_by: profile.id,
          assigned_to: queen.id,
          performed_at: performedAt || new Date().toISOString().slice(0, 10),
          notes: notes.trim() || null,
          started_at: startedAt,
          ended_at: new Date().toISOString(),
          duration_minutes: minsParsed,
          status: "completed",
        })
        .select("id")
        .single();
      if (sErr) throw sErr;

      let sort = 0;
      let flatIdx = 0;
      const setRows = [];
      for (const ex of draft) {
        let setNum = 1;
        for (const s of ex.sets) {
          setRows.push({
            session_id: session.id,
            body_part: ex.body_part,
            exercise_name: ex.exercise_name,
            set_number: setNum++,
            reps: s.reps,
            weight: s.weight,
            unit: "kg",
            sort_order: sort++,
            is_pr: prFlags[flatIdx]?.isPr ?? false,
          });
          flatIdx++;
        }
      }
      const { error: setErr } = await supabase.from("workout_sets").insert(setRows);
      if (setErr) throw setErr;

      for (const file of files) {
        const isVideo = isAcceptedVideoUpload(file);
        let upload = file;
        if (isVideo) {
          if (file.size > MAX_VIDEO_BYTES) throw new Error("Video too large");
          upload = (await prepareVideoForUpload(file)).file;
        } else {
          upload = await downsizeImageIfNeeded(file);
        }
        const ext = upload.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
        const path = await presignAndUpload({
          bucket: "workouts",
          file: upload,
          contentType: upload.type || (isVideo ? "video/mp4" : "image/jpeg"),
          ext,
          relativePath: `${profile.id}/${session.id}/${Date.now()}.${ext}`,
        });
        await supabase.from("workout_media").insert({
          session_id: session.id,
          media_kind: isVideo ? "video" : "image",
          file_path: path,
        });
      }

      const prCount = prFlags.filter((p) => p.isPr).length;
      const { notifyPush } = await import("@/lib/push-client");
      await notifyPush({
        title: "New workout logged",
        body: `${draft.length} exercises · ${formatVolume(volume)}`,
        url: `/dashboard/workouts/${session.id}`,
        target: "queen",
        kind: "workout_new",
      });
      if (prCount > 0) {
        await notifyPush({
          title: "Personal record!",
          body: `${prCount} PR${prCount === 1 ? "" : "s"} this session`,
          url: `/dashboard/workouts/${session.id}`,
          target: "queen",
          kind: "workout_pr",
        });
      }

      toast.success(
        prCount
          ? `Workout saved · ${prCount} PR${prCount === 1 ? "" : "s"}!`
          : "Workout saved"
      );
      router.push(`/dashboard/workouts/${session.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("space-y-6", className)}>
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
            <p className="font-heading text-gold">This session</p>
            <p className="text-xs text-muted-foreground">
              {totalSets} sets · {formatVolume(volume)}
            </p>
          </div>
          <ul className="space-y-2">
            {draft.map((ex) => (
              <li
                key={ex.key}
                className="rounded-xl border border-gold/15 bg-charcoal/70 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm text-ivory">{ex.exercise_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {BODY_PART_LABELS[ex.body_part]} · {ex.sets.length} sets
                    </p>
                    <p className="mt-1 text-xs text-gold/80">
                      {ex.sets
                        .map((s) => `${s.reps}×${s.weight}`)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeExercise(ex.key)}
                    className="text-muted-foreground hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

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
        <Button type="button" variant="outline" size="sm" asChild>
          <label className="cursor-pointer">
            <ImagePlus className="mr-2 h-4 w-4" />
            Photo / video
            <input
              type="file"
              accept="image/*,video/*,video/hevc,video/ogg,.hevc,.h265,.ogg,.ogv"
              multiple
              className="hidden"
              onChange={(e) =>
                setFiles((prev) => [
                  ...prev,
                  ...Array.from(e.target.files ?? []),
                ])
              }
            />
          </label>
        </Button>
        {files.length > 0 && (
          <span className="text-xs text-muted-foreground self-center">
            {files.length} file{files.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <Button
        type="button"
        disabled={saving || draft.length === 0}
        onClick={() => void save()}
        className="w-full bg-gold text-void hover:bg-gold-muted"
      >
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Save workout
      </Button>
    </div>
  );
}
