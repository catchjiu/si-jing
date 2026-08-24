"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
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
  formatVolume,
  sessionDurationMin,
  sessionVolume,
} from "@/lib/workout-stats";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import {
  MAX_VIDEO_BYTES,
  prepareVideoForUpload,
  isAcceptedVideoUpload,
} from "@/lib/video-compress";
import { presignAndUpload, removeObject } from "@/lib/storage/client";
import type { WorkoutMedia, WorkoutSession, WorkoutSet } from "@/lib/types";
import { WorkoutWeightDial } from "@/components/workouts/workout-weight-dial";
import { WorkoutWheelPicker } from "@/components/workouts/workout-wheel-picker";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type DraftSet = {
  reps: number;
  weight: number;
};

type DraftExercise = {
  key: string;
  body_part: WorkoutBodyPart;
  exercise_name: string;
  sets: DraftSet[];
};

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

export function WorkoutSessionEditor({
  session,
  sets,
  media,
  onCancel,
  onSaved,
  className,
}: {
  session: WorkoutSession;
  sets: WorkoutSet[];
  media: MediaView[];
  onCancel: () => void;
  onSaved: () => void;
  className?: string;
}) {
  const { profile } = useAuth();
  const [performedAt, setPerformedAt] = useState(session.performed_at);
  const [notes, setNotes] = useState(session.notes ?? "");
  const [minutes, setMinutes] = useState(() => {
    const m = sessionDurationMin(session);
    return m != null ? String(m) : "";
  });
  const [draft, setDraft] = useState(() => setsToDraft(sets));
  const [existingMedia, setExistingMedia] = useState(media);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [priorMax, setPriorMax] = useState<Map<string, number>>(new Map());
  const [recent, setRecent] = useState<string[]>([]);
  const [bodyPart, setBodyPart] = useState<WorkoutBodyPart>("chest");
  const [exercise, setExercise] = useState("");
  const [customName, setCustomName] = useState("");
  const [reps, setReps] = useState(10);
  const [weight, setWeight] = useState(20);
  const [setCount, setSetCount] = useState(1);
  const [saving, setSaving] = useState(false);
  const [removingMediaId, setRemovingMediaId] = useState<string | null>(null);

  const exerciseName =
    exercise === CUSTOM_EXERCISE_VALUE ? customName.trim() : exercise;
  const presets = WORKOUT_EXERCISES[bodyPart];

  const loadHistory = useCallback(async () => {
    if (!profile) return;
    const supabase = createClient();
    const { data: mySessions } = await supabase
      .from("workout_sessions")
      .select("id")
      .eq("created_by", profile.id)
      .neq("id", session.id)
      .limit(50);
    const sessionIds = ((mySessions ?? []) as { id: string }[]).map((s) => s.id);
    if (sessionIds.length === 0) {
      setPriorMax(new Map());
      setRecent([]);
      return;
    }
    const { data } = await supabase
      .from("workout_sets")
      .select("exercise_name, body_part, weight, created_at")
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
  }, [profile, bodyPart, session.id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const volume = useMemo(
    () =>
      sessionVolume(
        draft.flatMap((e) => e.sets.map((s) => ({ reps: s.reps, weight: s.weight })))
      ),
    [draft]
  );
  const totalSets = draft.reduce((n, e) => n + e.sets.length, 0);

  const pickExercise = (name: string) => {
    setExercise(name);
    if (name === CUSTOM_EXERCISE_VALUE) return;
    const last = priorMax.get(exerciseKey(bodyPart, name));
    if (last != null) setWeight(last);
  };

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
    setExistingMedia((prev) => prev.filter((x) => x.id !== m.id));
  };

  const save = async () => {
    if (!profile) return;
    if (!performedAt) {
      toast.error("Pick a date");
      return;
    }
    if (draft.length === 0) {
      toast.error("Keep at least one set");
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

      const { error: sErr } = await supabase
        .from("workout_sessions")
        .update({
          performed_at: performedAt,
          notes: notes.trim() || null,
          duration_minutes: minsParsed,
        })
        .eq("id", session.id);
      if (sErr) throw sErr;

      const { error: delErr } = await supabase
        .from("workout_sets")
        .delete()
        .eq("session_id", session.id);
      if (delErr) throw delErr;

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

      for (const file of newFiles) {
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

      toast.success("Workout updated");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cn(
        "space-y-6 rounded-2xl border border-gold/20 bg-charcoal/80 p-5",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-xl text-gold">Edit workout</h2>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-performed-at">Date</Label>
          <Input
            id="edit-performed-at"
            type="date"
            value={performedAt}
            onChange={(e) => setPerformedAt(e.target.value)}
            className="border-gold/20 bg-void/60"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-minutes">Minutes</Label>
          <Input
            id="edit-minutes"
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

      <div className="space-y-1.5">
        <Label htmlFor="edit-notes">Notes / intensity</Label>
        <Input
          id="edit-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Hard, pump day…"
          className="border-gold/20 bg-void/60"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-heading text-gold">Exercises</p>
          <p className="text-xs text-muted-foreground">
            {totalSets} sets · {formatVolume(volume)}
          </p>
        </div>
        <ul className="space-y-3">
          {draft.map((ex) => (
            <li
              key={ex.key}
              className="space-y-2 rounded-xl border border-gold/15 bg-void/30 p-3"
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
                  className="text-muted-foreground hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
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
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3 rounded-xl border border-gold/15 bg-void/25 p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Add sets
        </p>
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
        <WorkoutWeightDial
          weight={weight}
          setLabel={`SET · ${(exerciseName || "EXERCISE").toUpperCase()}`}
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
      </div>

      <div className="space-y-3">
        <p className="font-heading text-gold">Media</p>
        {existingMedia.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {existingMedia.map((m) => (
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
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Media
                  </div>
                )}
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
          <Button type="button" variant="outline" size="sm" asChild>
            <label className="cursor-pointer">
              <ImagePlus className="mr-2 h-4 w-4" />
              Add photo / video
              <input
                type="file"
                accept="image/*,video/*,video/hevc,video/ogg,.hevc,.h265,.ogg,.ogv"
                multiple
                className="hidden"
                onChange={(e) =>
                  setNewFiles((prev) => [
                    ...prev,
                    ...Array.from(e.target.files ?? []),
                  ])
                }
              />
            </label>
          </Button>
          {newFiles.length > 0 && (
            <span className="self-center text-xs text-muted-foreground">
              {newFiles.length} new file{newFiles.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={saving || draft.length === 0}
          onClick={() => void save()}
          className="bg-gold text-void hover:bg-gold-muted"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save changes
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={onCancel}
          className="border-gold/30"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
