"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Camera, Loader2, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { presignAndUpload, signObjectUrl, removeObject } from "@/lib/storage/client";
import type { WorkoutWeeklyPic } from "@/lib/types";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type PicView = WorkoutWeeklyPic & {
  beforeUrl?: string;
  afterUrl?: string;
};

async function withUrls(rows: WorkoutWeeklyPic[]): Promise<PicView[]> {
  return Promise.all(
    rows.map(async (r) => {
      const [beforeUrl, afterUrl] = await Promise.all([
        r.before_path
          ? signObjectUrl({ bucket: "workouts", path: r.before_path })
          : null,
        r.after_path
          ? signObjectUrl({ bucket: "workouts", path: r.after_path })
          : null,
      ]);
      return {
        ...r,
        beforeUrl: beforeUrl ?? undefined,
        afterUrl: afterUrl ?? undefined,
      };
    })
  );
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function formatEntryDate(ymd: string) {
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

export function WorkoutWeeklyProgress({ className }: { className?: string }) {
  const { profile, isQueen, isSlave } = useAuth();
  const [rows, setRows] = useState<PicView[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [newDate, setNewDate] = useState(todayYmd);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("workout_weekly_pics")
      .select("*")
      .order("entry_date", { ascending: false })
      .limit(40);
    if (isSlave) query = query.eq("created_by", profile.id);
    const { data, error } = await query;
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setRows(await withUrls((data ?? []) as WorkoutWeeklyPic[]));
    setLoading(false);
  }, [profile, isSlave]);

  useEffect(() => {
    if (profile) void load();
  }, [profile, load]);

  const createEntry = async () => {
    if (!isSlave || !profile || !newDate) return;
    if (rows.some((r) => r.entry_date === newDate)) {
      toast.error("An entry for that date already exists");
      return;
    }
    setCreating(true);
    const supabase = createClient();
    const { error } = await supabase.from("workout_weekly_pics").insert({
      created_by: profile.id,
      entry_date: newDate,
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Progress date added");
    void load();
  };

  const uploadSide = async (
    entry: PicView,
    side: "before" | "after",
    file: File | null
  ) => {
    if (!isSlave || !profile || !file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Use a photo");
      return;
    }
    const key = `${entry.id}:${side}`;
    setUploading(key);
    const supabase = createClient();
    try {
      const prepared = await downsizeImageIfNeeded(file);
      const ext = prepared.name.split(".").pop() || "jpg";
      const path = await presignAndUpload({
        bucket: "workouts",
        file: prepared,
        contentType: prepared.type || "image/jpeg",
        ext,
        relativePath: `${profile.id}/progress/${entry.entry_date}/${side}-${Date.now()}.${ext}`,
      });

      const oldPath =
        side === "before" ? entry.before_path : entry.after_path;
      const patch =
        side === "before" ? { before_path: path } : { after_path: path };

      const { error } = await supabase
        .from("workout_weekly_pics")
        .update(patch)
        .eq("id", entry.id);
      if (error) throw error;

      if (oldPath) {
        await removeObject({ bucket: "workouts", path: oldPath }).catch(
          () => undefined
        );
      }

      const { notifyPush } = await import("@/lib/push-client");
      await notifyPush({
        title: "Progress photo added",
        body: `${side === "before" ? "Before" : "After"} · ${formatEntryDate(entry.entry_date)}`,
        url: "/dashboard/workouts",
        target: "queen",
        kind: "workout_weekly_pic",
      });
      toast.success(`${side === "before" ? "Before" : "After"} photo saved`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const removeEntry = async (entry: PicView) => {
    if (!isSlave) return;
    if (!window.confirm(`Remove progress entry for ${formatEntryDate(entry.entry_date)}?`)) {
      return;
    }
    setDeletingId(entry.id);
    const supabase = createClient();
    for (const p of [entry.before_path, entry.after_path]) {
      if (p) {
        await removeObject({ bucket: "workouts", path: p }).catch(() => undefined);
      }
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
    toast.success("Entry removed");
    void load();
  };

  return (
    <div
      className={cn(
        "space-y-4 rounded-2xl border border-gold/15 bg-charcoal/80 p-5",
        className
      )}
    >
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Progress
        </p>
        <p className="font-heading text-lg text-ivory">Before / after over time</p>
        <p className="text-xs text-muted-foreground">
          Add a date, then upload before and after photos for that day
        </p>
      </div>

      {isSlave && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-gold/15 bg-void/40 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="progress-date">Date</Label>
            <Input
              id="progress-date"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="border-gold/20 bg-void/60"
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={creating || !newDate}
            onClick={() => void createEntry()}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {creating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add date
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
            : "Add a date to start tracking before/after photos."}
        </p>
      ) : (
        <ul className="space-y-4">
          {rows.map((entry) => (
            <li
              key={entry.id}
              className="space-y-3 rounded-xl border border-gold/15 bg-void/30 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-heading text-sm text-gold">
                  {formatEntryDate(entry.entry_date)}
                </p>
                {isSlave && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={deletingId === entry.id}
                    onClick={() => void removeEntry(entry)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-red-300"
                  >
                    {deletingId === entry.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["before", "after"] as const).map((side) => {
                  const url =
                    side === "before" ? entry.beforeUrl : entry.afterUrl;
                  const path =
                    side === "before" ? entry.before_path : entry.after_path;
                  const busy = uploading === `${entry.id}:${side}`;
                  return (
                    <div
                      key={side}
                      className="space-y-2 rounded-lg border border-gold/10 bg-charcoal/60 p-2"
                    >
                      <p className="text-[10px] uppercase tracking-wider text-gold/90">
                        {side}
                      </p>
                      <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-gold/10 bg-void/50">
                        {url && path ? (
                          <WatermarkedFrame
                            className="absolute inset-0"
                            mediaPath={path}
                          >
                            <Image
                              src={url}
                              alt={`${side} ${entry.entry_date}`}
                              fill
                              unoptimized
                              className="object-cover"
                            />
                          </WatermarkedFrame>
                        ) : (
                          <div className="flex h-full items-center justify-center text-muted-foreground">
                            <Camera className="h-7 w-7 opacity-40" />
                          </div>
                        )}
                      </div>
                      {isSlave && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          className="w-full border-gold/30"
                          asChild
                        >
                          <label className="cursor-pointer">
                            {busy ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            {url ? "Replace" : "Upload"} {side}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                void uploadSide(
                                  entry,
                                  side,
                                  e.target.files?.[0] ?? null
                                )
                              }
                            />
                          </label>
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
