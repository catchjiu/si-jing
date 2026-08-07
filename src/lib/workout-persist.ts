import type { SupabaseClient } from "@supabase/supabase-js";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { presignAndUpload, removeObject } from "@/lib/storage/client";
import type { WorkoutBodyPart } from "@/lib/workout-exercises";
import {
  detectPr,
  formatVolume,
  sessionVolume,
} from "@/lib/workout-stats";
import {
  MAX_VIDEO_BYTES,
  prepareVideoForUpload,
  VIDEO_TYPES,
} from "@/lib/video-compress";
import type { WorkoutSessionStatus } from "@/lib/types";

export type DraftSet = {
  reps: number;
  weight: number;
};

export type DraftExercise = {
  key: string;
  body_part: WorkoutBodyPart;
  exercise_name: string;
  sets: DraftSet[];
};

export type SessionFields = {
  performed_at: string;
  notes: string;
  minutes: string;
};

export async function fetchQueenId(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("role", "queen")
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function createWorkoutSession(
  supabase: SupabaseClient,
  opts: {
    profileId: string;
    queenId: string;
    status: WorkoutSessionStatus;
    performedAt?: string;
    notes?: string | null;
  }
): Promise<string> {
  const now = new Date().toISOString();
  const performedAt =
    opts.performedAt ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({
      created_by: opts.profileId,
      assigned_to: opts.queenId,
      performed_at: performedAt,
      notes: opts.notes?.trim() || null,
      status: opts.status,
      started_at: opts.status === "in_progress" ? now : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export function parseMinutes(minutes: string): number | null {
  if (minutes.trim() === "") return null;
  const parsed = Number.parseInt(minutes, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export async function syncSessionFields(
  supabase: SupabaseClient,
  sessionId: string,
  fields: SessionFields
): Promise<void> {
  const minsParsed = parseMinutes(fields.minutes);
  const { error } = await supabase
    .from("workout_sessions")
    .update({
      performed_at: fields.performed_at || new Date().toISOString().slice(0, 10),
      notes: fields.notes.trim() || null,
      duration_minutes: minsParsed,
    })
    .eq("id", sessionId);
  if (error) throw error;
}

export async function syncDraftSets(
  supabase: SupabaseClient,
  sessionId: string,
  draft: DraftExercise[],
  priorMax: Map<string, number>,
  detectPersonalRecords: boolean
): Promise<void> {
  const flat = draft.flatMap((e) =>
    e.sets.map((s) => ({
      body_part: e.body_part,
      exercise_name: e.exercise_name,
      reps: s.reps,
      weight: s.weight,
    }))
  );
  const prFlags = detectPersonalRecords ? detectPr(flat, priorMax) : [];

  const { error: delErr } = await supabase
    .from("workout_sets")
    .delete()
    .eq("session_id", sessionId);
  if (delErr) throw delErr;

  if (draft.length === 0) return;

  let sort = 0;
  let flatIdx = 0;
  const setRows = [];
  for (const ex of draft) {
    let setNum = 1;
    for (const s of ex.sets) {
      setRows.push({
        session_id: sessionId,
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
}

export async function uploadWorkoutMedia(
  supabase: SupabaseClient,
  sessionId: string,
  profileId: string,
  file: File
): Promise<void> {
  const isVideo = VIDEO_TYPES.includes(
    file.type as (typeof VIDEO_TYPES)[number]
  );
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
    relativePath: `${profileId}/${sessionId}/${Date.now()}.${ext}`,
  });
  const { error } = await supabase.from("workout_media").insert({
    session_id: sessionId,
    media_kind: isVideo ? "video" : "image",
    file_path: path,
  });
  if (error) throw error;
}

export async function completeWorkoutSession(
  supabase: SupabaseClient,
  opts: {
    sessionId: string;
    draft: DraftExercise[];
    priorMax: Map<string, number>;
    fields: SessionFields;
  }
): Promise<{ prCount: number; volume: number }> {
  await syncSessionFields(supabase, opts.sessionId, opts.fields);
  await syncDraftSets(
    supabase,
    opts.sessionId,
    opts.draft,
    opts.priorMax,
    true
  );

  const volume = sessionVolume(
    opts.draft.flatMap((e) =>
      e.sets.map((s) => ({ reps: s.reps, weight: s.weight }))
    )
  );

  const flat = opts.draft.flatMap((e) =>
    e.sets.map((s) => ({
      body_part: e.body_part,
      exercise_name: e.exercise_name,
      reps: s.reps,
      weight: s.weight,
    }))
  );
  const prCount = detectPr(flat, opts.priorMax).filter((p) => p.isPr).length;

  const { error } = await supabase
    .from("workout_sessions")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
    })
    .eq("id", opts.sessionId);
  if (error) throw error;

  return { prCount, volume };
}

export async function savePlannedWorkout(
  supabase: SupabaseClient,
  opts: {
    sessionId: string;
    draft: DraftExercise[];
    fields: SessionFields;
  }
): Promise<void> {
  await syncSessionFields(supabase, opts.sessionId, opts.fields);
  await syncDraftSets(
    supabase,
    opts.sessionId,
    opts.draft,
    new Map(),
    false
  );
  const { error } = await supabase
    .from("workout_sessions")
    .update({ status: "planned" })
    .eq("id", opts.sessionId);
  if (error) throw error;
}

/** Group flat workout_sets rows into editable draft exercises (order preserved). */
export function setsToDraftExercises(
  sets: Array<{
    body_part: string;
    exercise_name: string;
    reps: number;
    weight: number | string;
    sort_order?: number;
    set_number?: number;
  }>
): DraftExercise[] {
  const ordered = [...sets].sort((a, b) => {
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (so !== 0) return so;
    return (a.set_number ?? 0) - (b.set_number ?? 0);
  });
  const map = new Map<string, DraftExercise>();
  const order: string[] = [];
  for (const s of ordered) {
    const key = `${s.body_part}::${s.exercise_name}`;
    let ex = map.get(key);
    if (!ex) {
      ex = {
        key: `${key}-${order.length}`,
        body_part: s.body_part as WorkoutBodyPart,
        exercise_name: s.exercise_name,
        sets: [],
      };
      map.set(key, ex);
      order.push(key);
    }
    ex.sets.push({
      reps: s.reps,
      weight: Number(s.weight) || 0,
    });
  }
  return order.map((k) => map.get(k)!);
}

/** Copy a session's exercises/sets into a new planned workout on targetDate. */
export async function copyWorkoutAsPlanned(
  supabase: SupabaseClient,
  opts: {
    profileId: string;
    queenId: string;
    sourceSessionId: string;
    targetDate: string;
    notes?: string | null;
  }
): Promise<string> {
  const { data: source, error: srcErr } = await supabase
    .from("workout_sessions")
    .select("id, notes, status")
    .eq("id", opts.sourceSessionId)
    .maybeSingle();
  if (srcErr) throw srcErr;
  if (!source) throw new Error("Source workout not found");
  if ((source as { status: string }).status === "skipped") {
    throw new Error("Can't copy a rest day");
  }

  const { data: setRows, error: setErr } = await supabase
    .from("workout_sets")
    .select("*")
    .eq("session_id", opts.sourceSessionId)
    .order("sort_order", { ascending: true })
    .order("set_number", { ascending: true });
  if (setErr) throw setErr;

  const draft = setsToDraftExercises(
    (setRows ?? []) as Array<{
      body_part: string;
      exercise_name: string;
      reps: number;
      weight: number | string;
      sort_order?: number;
      set_number?: number;
    }>
  );
  if (draft.length === 0) {
    throw new Error("Nothing to copy — add exercises first");
  }

  const notes =
    opts.notes !== undefined
      ? opts.notes
      : ((source as { notes: string | null }).notes ?? null);

  const newId = await createWorkoutSession(supabase, {
    profileId: opts.profileId,
    queenId: opts.queenId,
    status: "planned",
    performedAt: opts.targetDate,
    notes,
  });

  await syncDraftSets(supabase, newId, draft, new Map(), false);
  return newId;
}

export async function startPlannedSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<void> {
  const { error } = await supabase
    .from("workout_sessions")
    .update({
      status: "in_progress",
      started_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  if (error) throw error;
}

export async function saveRestDay(
  supabase: SupabaseClient,
  opts: {
    profileId: string;
    queenId: string;
    performedAt: string;
    notes: string;
  }
): Promise<string> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({
      created_by: opts.profileId,
      assigned_to: opts.queenId,
      performed_at: opts.performedAt,
      notes: opts.notes.trim() || null,
      status: "skipped",
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export function workoutStatusLabel(status: WorkoutSessionStatus): string {
  switch (status) {
    case "planned":
      return "Planned";
    case "in_progress":
      return "In progress";
    case "skipped":
      return "Rest day";
    default:
      return "Completed";
  }
}

export async function deleteWorkoutSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<void> {
  const { data: mediaRows } = await supabase
    .from("workout_media")
    .select("file_path")
    .eq("session_id", sessionId);
  for (const m of (mediaRows ?? []) as { file_path: string }[]) {
    await removeObject({ bucket: "workouts", path: m.file_path }).catch(
      () => undefined
    );
  }
  const { error } = await supabase
    .from("workout_sessions")
    .delete()
    .eq("id", sessionId);
  if (error) throw error;
}

export function formatWorkoutNotifyBody(
  exerciseCount: number,
  volume: number
): string {
  return `${exerciseCount} exercises · ${formatVolume(volume)}`;
}
