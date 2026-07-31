"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { weekStartMonday } from "@/lib/workout-stats";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { presignAndUpload, signObjectUrl } from "@/lib/storage/client";
import type { WorkoutWeeklyPic } from "@/lib/types";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { Button } from "@/components/ui/button";
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

function formatWeek(weekStart: string) {
  try {
    return new Date(`${weekStart}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return weekStart;
  }
}

export function WorkoutWeeklyProgress({ className }: { className?: string }) {
  const { profile, isQueen, isSlave } = useAuth();
  const [rows, setRows] = useState<PicView[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<"before" | "after" | null>(null);
  const currentWeek = weekStartMonday();

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("workout_weekly_pics")
      .select("*")
      .order("week_start", { ascending: false })
      .limit(16);
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

  const current = rows.find((r) => r.week_start === currentWeek) ?? null;

  const uploadSide = async (side: "before" | "after", file: File | null) => {
    if (!isSlave || !profile || !file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Use a photo");
      return;
    }
    setUploading(side);
    const supabase = createClient();
    try {
      const prepared = await downsizeImageIfNeeded(file);
      const ext = prepared.name.split(".").pop() || "jpg";
      const path = await presignAndUpload({
        bucket: "workouts",
        file: prepared,
        contentType: prepared.type || "image/jpeg",
        ext,
        relativePath: `${profile.id}/weekly/${currentWeek}/${side}-${Date.now()}.${ext}`,
      });

      const patch =
        side === "before" ? { before_path: path } : { after_path: path };

      if (current) {
        const { error } = await supabase
          .from("workout_weekly_pics")
          .update(patch)
          .eq("id", current.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("workout_weekly_pics").insert({
          created_by: profile.id,
          week_start: currentWeek,
          ...patch,
        });
        if (error) throw error;
      }

      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Weekly progress pic",
          body: `${side === "before" ? "Before" : "After"} photo · week of ${formatWeek(currentWeek)}`,
          url: "/dashboard/workouts",
          target: "queen",
          kind: "workout_weekly_pic",
        })
      );
      toast.success(`${side === "before" ? "Before" : "After"} photo saved`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
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
        <p className="font-heading text-lg text-ivory">Weekly before / after</p>
        <p className="text-xs text-muted-foreground">
          Week of {formatWeek(currentWeek)}
        </p>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["before", "after"] as const).map((side) => {
              const url =
                side === "before" ? current?.beforeUrl : current?.afterUrl;
              const path =
                side === "before" ? current?.before_path : current?.after_path;
              return (
                <div
                  key={side}
                  className="space-y-2 rounded-xl border border-gold/15 bg-void/40 p-3"
                >
                  <p className="text-xs uppercase tracking-wider text-gold">
                    {side}
                  </p>
                  <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-gold/10 bg-charcoal">
                    {url && path ? (
                      <WatermarkedFrame
                        className="absolute inset-0"
                        mediaPath={path}
                      >
                        <Image
                          src={url}
                          alt={side}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      </WatermarkedFrame>
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <Camera className="h-8 w-8 opacity-40" />
                      </div>
                    )}
                  </div>
                  {isSlave && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={uploading === side}
                      className="w-full border-gold/30"
                      asChild
                    >
                      <label className="cursor-pointer">
                        {uploading === side ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        {url ? "Replace" : "Upload"} {side}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            void uploadSide(side, e.target.files?.[0] ?? null)
                          }
                        />
                      </label>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {rows.filter((r) => r.week_start !== currentWeek).length > 0 && (
            <div className="space-y-2 border-t border-gold/10 pt-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Past weeks
              </p>
              <ul className="space-y-3">
                {rows
                  .filter((r) => r.week_start !== currentWeek)
                  .map((r) => (
                    <li
                      key={r.id}
                      className="rounded-xl border border-gold/10 bg-void/30 p-3"
                    >
                      <p className="mb-2 text-xs text-gold">
                        Week of {formatWeek(r.week_start)}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {[r.beforeUrl, r.afterUrl].map((url, i) => (
                          <div
                            key={i}
                            className="relative aspect-[3/4] overflow-hidden rounded-md border border-gold/10 bg-charcoal"
                          >
                            {url ? (
                              <Image
                                src={url}
                                alt=""
                                fill
                                unoptimized
                                className="object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                                —
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {isQueen && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No weekly progress pics yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}
