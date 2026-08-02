"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Camera, Loader2, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { presignAndUpload, signObjectUrl, removeObject } from "@/lib/storage/client";
import type { WorkoutWeeklyPic } from "@/lib/types";
import { weekStartMonday } from "@/lib/workout-stats";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type PicView = WorkoutWeeklyPic & {
  url?: string;
};

async function withUrls(rows: WorkoutWeeklyPic[]): Promise<PicView[]> {
  return Promise.all(
    rows.map(async (r) => {
      const url = r.file_path
        ? await signObjectUrl({ bucket: "workouts", path: r.file_path })
        : null;
      return { ...r, url: url ?? undefined };
    })
  );
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(ymd: string | null | undefined) {
  if (!ymd) return "No date";
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

function sortKey(row: Pick<WorkoutWeeklyPic, "taken_on" | "week_start">) {
  return row.taken_on || row.week_start;
}

export function WorkoutWeeklyProgress({ className }: { className?: string }) {
  const { profile, isQueen, isSlave } = useAuth();
  const [rows, setRows] = useState<PicView[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState(todayYmd);
  const [compareIds, setCompareIds] = useState<[string | null, string | null]>([
    null,
    null,
  ]);

  const selectedWeek = useMemo(
    () => weekStartMonday(new Date(`${newDate || todayYmd()}T12:00:00`)),
    [newDate]
  );
  const weekAlreadyAdded = rows.some((r) => r.week_start === selectedWeek);

  const withPhotos = useMemo(
    () =>
      [...rows]
        .filter((r) => r.file_path && r.url)
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
    [rows]
  );

  const comparePair = useMemo(() => {
    const a =
      withPhotos.find((r) => r.id === compareIds[0]) ?? withPhotos[0] ?? null;
    const b =
      withPhotos.find((r) => r.id === compareIds[1]) ??
      withPhotos[withPhotos.length - 1] ??
      null;
    if (!a || !b || a.id === b.id) return null;
    return sortKey(a) <= sortKey(b) ? [a, b] : [b, a];
  }, [withPhotos, compareIds]);
  const canCompare = Boolean(comparePair);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("workout_weekly_pics")
      .select("*")
      .order("week_start", { ascending: false })
      .limit(52);
    if (isSlave) query = query.eq("created_by", profile.id);
    const { data, error } = await query;
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const next = await withUrls((data ?? []) as WorkoutWeeklyPic[]);
    setRows(next);
    setLoading(false);
  }, [profile, isSlave]);

  useEffect(() => {
    if (profile) void load();
  }, [profile, load]);

  useEffect(() => {
    if (withPhotos.length < 2) {
      setCompareIds([null, null]);
      return;
    }
    setCompareIds((prev) => {
      const leftOk = prev[0] && withPhotos.some((r) => r.id === prev[0]);
      const rightOk = prev[1] && withPhotos.some((r) => r.id === prev[1]);
      if (leftOk && rightOk) return prev;
      return [withPhotos[0].id, withPhotos[withPhotos.length - 1].id];
    });
  }, [withPhotos]);

  const createEntry = async () => {
    if (!isSlave || !profile || !newDate) return;
    const weekStart = weekStartMonday(new Date(`${newDate}T12:00:00`));
    if (rows.some((r) => r.week_start === weekStart)) {
      toast.error("That week already has a progress photo");
      return;
    }
    setCreating(true);
    const supabase = createClient();
    const { error } = await supabase.from("workout_weekly_pics").insert({
      created_by: profile.id,
      week_start: weekStart,
      taken_on: newDate,
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Date added — upload a photo");
    void load();
  };

  const saveDate = async (entry: PicView, value: string) => {
    if (!isSlave || !value) return;
    const weekStart = weekStartMonday(new Date(`${value}T12:00:00`));
    if (
      rows.some((r) => r.id !== entry.id && r.week_start === weekStart)
    ) {
      toast.error("Another photo already uses that week");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("workout_weekly_pics")
      .update({ taken_on: value, week_start: weekStart })
      .eq("id", entry.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === entry.id ? { ...r, taken_on: value, week_start: weekStart } : r
      )
    );
  };

  const uploadPhoto = async (entry: PicView, file: File | null) => {
    if (!isSlave || !profile || !file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Use a photo");
      return;
    }
    setUploading(true);
    const supabase = createClient();
    try {
      const prepared = await downsizeImageIfNeeded(file);
      const ext = prepared.name.split(".").pop() || "jpg";
      const path = await presignAndUpload({
        bucket: "workouts",
        file: prepared,
        contentType: prepared.type || "image/jpeg",
        ext,
        relativePath: `${profile.id}/progress/${entry.week_start}/${Date.now()}.${ext}`,
      });

      const takenOn = entry.taken_on || todayYmd();
      const weekStart = weekStartMonday(new Date(`${takenOn}T12:00:00`));
      const { error } = await supabase
        .from("workout_weekly_pics")
        .update({
          file_path: path,
          taken_on: takenOn,
          week_start: weekStart,
        })
        .eq("id", entry.id);
      if (error) throw error;

      if (entry.file_path) {
        await removeObject({
          bucket: "workouts",
          path: entry.file_path,
        }).catch(() => undefined);
      }

      const { notifyPush } = await import("@/lib/push-client");
      await notifyPush({
        title: "Progress photo added",
        body: formatDate(takenOn),
        url: "/dashboard/workouts",
        target: "queen",
        kind: "workout_weekly_pic",
      });
      toast.success("Progress photo saved");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removeEntry = async (entry: PicView) => {
    if (!isSlave) return;
    if (
      !window.confirm(
        `Remove progress photo from ${formatDate(entry.taken_on || entry.week_start)}?`
      )
    ) {
      return;
    }
    setDeletingId(entry.id);
    const supabase = createClient();
    if (entry.file_path) {
      await removeObject({
        bucket: "workouts",
        path: entry.file_path,
      }).catch(() => undefined);
    }
    const { error } = await supabase
      .from("workout_weekly_pics")
      .delete()
      .eq("id", entry.id);
    setDeletingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Photo removed");
    void load();
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev[0] === id) return [null, prev[1]];
      if (prev[1] === id) return [prev[0], null];
      if (!prev[0]) return [id, prev[1]];
      if (!prev[1]) return [prev[0], id];
      return [prev[1], id];
    });
  };

  return (
    <div
      className={cn(
        "space-y-5 rounded-2xl border border-gold/15 bg-charcoal/80 p-5",
        className
      )}
    >
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Progress
        </p>
        <p className="font-heading text-lg text-ivory">Pics over time</p>
        <p className="text-xs text-muted-foreground">
          One photo a week — watch the timeline grow
        </p>
      </div>

      {isSlave && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-gold/15 bg-void/40 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="progress-taken-on">Photo date</Label>
            <Input
              id="progress-taken-on"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="border-gold/20 bg-void/60"
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={creating || weekAlreadyAdded || !newDate}
            onClick={() => void createEntry()}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {creating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            {weekAlreadyAdded ? "Week already added" : "Add date"}
          </Button>
        </div>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isQueen
            ? "No progress photos yet."
            : "Pick a date, add it, then upload a photo to start the timeline."}
        </p>
      ) : (
        <>
          {canCompare && comparePair && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Compare
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["Earlier", comparePair[0]],
                    ["Later", comparePair[1]],
                  ] as const
                ).map(([label, pic]) => (
                  <div
                    key={pic.id}
                    className="space-y-1.5 rounded-lg border border-gold/10 bg-void/30 p-2"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-gold/90">
                      {label} · {formatDate(pic.taken_on || pic.week_start)}
                    </p>
                    <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-gold/10 bg-void/50">
                      {pic.url && pic.file_path && (
                        <WatermarkedFrame
                          className="absolute inset-0"
                          mediaPath={pic.file_path}
                        >
                          <Image
                            src={pic.url}
                            alt={`${label} ${pic.taken_on}`}
                            fill
                            unoptimized
                            className="object-cover"
                          />
                        </WatermarkedFrame>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {withPhotos.length > 2 && (
                <p className="text-[11px] text-muted-foreground">
                  Tap two photos in the timeline to compare different dates
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Timeline
            </p>
            <ul className="flex gap-3 overflow-x-auto pb-1">
              {[...rows]
                .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
                .map((entry) => {
                  const selected =
                    entry.id === compareIds[0] || entry.id === compareIds[1];
                  return (
                    <li
                      key={entry.id}
                      className={cn(
                        "w-[140px] shrink-0 space-y-2 rounded-xl border p-2 transition-colors",
                        selected
                          ? "border-gold/50 bg-gold/5"
                          : "border-gold/15 bg-void/30"
                      )}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          if (entry.url) toggleCompare(entry.id);
                        }}
                      >
                        <p className="truncate text-[11px] font-medium text-ivory">
                          {formatDate(entry.taken_on || entry.week_start)}
                        </p>
                        <div className="relative mt-1.5 aspect-[3/4] overflow-hidden rounded-md border border-gold/10 bg-void/50">
                          {entry.url && entry.file_path ? (
                            <WatermarkedFrame
                              className="absolute inset-0"
                              mediaPath={entry.file_path}
                            >
                              <Image
                                src={entry.url}
                                alt={formatDate(entry.taken_on)}
                                fill
                                unoptimized
                                className="object-cover"
                              />
                            </WatermarkedFrame>
                          ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                              <Camera className="h-6 w-6 opacity-40" />
                            </div>
                          )}
                        </div>
                      </button>

                      {isSlave && (
                        <div className="space-y-1.5">
                          <Input
                            type="date"
                            value={entry.taken_on ?? ""}
                            onChange={(e) =>
                              void saveDate(entry, e.target.value)
                            }
                            className="h-7 border-gold/20 bg-void/60 px-1.5 text-[10px]"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={uploading}
                            className="h-7 w-full border-gold/30 px-1 text-[10px]"
                            asChild
                          >
                            <label className="cursor-pointer">
                              {uploading ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : null}
                              {entry.url ? "Replace" : "Upload"}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) =>
                                  void uploadPhoto(
                                    entry,
                                    e.target.files?.[0] ?? null
                                  )
                                }
                              />
                            </label>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={deletingId === entry.id}
                            onClick={() => void removeEntry(entry)}
                            className="h-7 w-full text-muted-foreground hover:text-red-300"
                          >
                            {deletingId === entry.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
