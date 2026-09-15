"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, Maximize2, Trash2, Upload, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { removeObject } from "@/lib/storage/client";
import {
  addWorkoutYoutubeMedia,
  isYoutubeWorkoutMedia,
  parseYoutubeVideoId,
  uploadWorkoutMedia,
  youtubeEmbedUrl,
  youtubeThumbUrl,
} from "@/lib/workout-persist";
import type { WorkoutBodyPart } from "@/lib/workout-exercises";
import type { WorkoutMedia } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ExerciseMediaView = WorkoutMedia & { signedUrl?: string };

export function WorkoutExerciseVideo({
  sessionId,
  bodyPart,
  exerciseName,
  videos,
  canUpload,
  onChanged,
}: {
  sessionId: string;
  bodyPart: WorkoutBodyPart;
  exerciseName: string;
  videos: ExerciseMediaView[];
  canUpload: boolean;
  onChanged: () => void;
}) {
  const { profile } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mode, setMode] = useState<"choose" | "youtube">("choose");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [watchingId, setWatchingId] = useState<string | null>(null);
  const watching = videos.find((v) => v.id === watchingId) ?? null;

  const closePicker = () => {
    setPickerOpen(false);
    setMode("choose");
    setYoutubeUrl("");
  };

  const handlePick = async (files: FileList | null) => {
    if (!profile || !files?.length) return;
    setSaving(true);
    const supabase = createClient();
    try {
      for (const file of Array.from(files)) {
        await uploadWorkoutMedia(supabase, sessionId, profile.id, file, {
          scope: "exercise",
          exerciseName,
          bodyPart,
        });
      }
      toast.success("Exercise video saved");
      closePicker();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  };

  const saveYoutube = async () => {
    if (!profile) return;
    if (!parseYoutubeVideoId(youtubeUrl)) {
      toast.error("Enter a valid YouTube link");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    try {
      await addWorkoutYoutubeMedia(supabase, {
        sessionId,
        profileId: profile.id,
        url: youtubeUrl,
        exerciseName,
        bodyPart,
      });
      toast.success("YouTube form video saved");
      closePicker();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save link");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m: ExerciseMediaView) => {
    setRemovingId(m.id);
    const supabase = createClient();
    if (m.file_path && !isYoutubeWorkoutMedia(m)) {
      await removeObject({ bucket: "workouts", path: m.file_path }).catch(
        () => undefined
      );
    }
    const { error } = await supabase.from("workout_media").delete().eq("id", m.id);
    setRemovingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    onChanged();
  };

  if (videos.length === 0 && !canUpload) return null;

  const watchingYoutubeId = watching?.external_url
    ? parseYoutubeVideoId(watching.external_url)
    : null;

  return (
    <div className="space-y-2">
      {videos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {videos.map((m) => {
            const youtubeId = m.external_url
              ? parseYoutubeVideoId(m.external_url)
              : null;
            return (
              <div key={m.id} className="relative">
                <button
                  type="button"
                  onClick={() => setWatchingId(m.id)}
                  className="relative block w-36 overflow-hidden rounded-md border border-gold/20 bg-void text-left"
                  aria-label={`Open ${exerciseName} form video fullscreen`}
                >
                  <span className="relative block aspect-video w-full">
                    {youtubeId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={youtubeThumbUrl(youtubeId)}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : m.signedUrl ? (
                      <video
                        src={m.signedUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
                        Unavailable
                      </span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-void/35">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-void/80 text-gold">
                        <Maximize2 className="h-3.5 w-3.5" />
                      </span>
                    </span>
                  </span>
                </button>
                {canUpload && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={removingId === m.id}
                    onClick={() => void remove(m)}
                    className="absolute -right-1.5 -top-1.5 h-7 w-7 bg-void/85 p-0 text-ivory hover:text-red-300"
                  >
                    {removingId === m.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {canUpload && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => {
            setMode("choose");
            setPickerOpen(true);
          }}
        >
          <Video className="mr-2 h-4 w-4" />
          {videos.length > 0 ? "Add another video" : "Add form video"}
        </Button>
      )}

      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          if (!open) closePicker();
          else setPickerOpen(true);
        }}
      >
        <DialogContent className="border-gold/20 bg-charcoal sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gold">Form video</DialogTitle>
            <DialogDescription>
              {mode === "choose"
                ? `Add a clip so Queen can see how to do ${exerciseName}.`
                : "Paste a YouTube watch, share, or shorts link."}
            </DialogDescription>
          </DialogHeader>

          {mode === "choose" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                asChild
                className="h-auto flex-col gap-2 border-gold/30 py-4 text-ivory"
              >
                <label className="cursor-pointer">
                  {saving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Upload className="h-5 w-5 text-gold" />
                  )}
                  Upload video
                  <input
                    type="file"
                    accept="video/*,video/hevc,video/ogg,.hevc,.h265,.ogg,.ogv"
                    className="hidden"
                    onChange={(e) => {
                      void handlePick(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setMode("youtube")}
                className="h-auto flex-col gap-2 border-gold/30 py-4 text-ivory"
              >
                <Link2 className="h-5 w-5 text-gold" />
                YouTube link
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="form-youtube-url">YouTube URL</Label>
                <Input
                  id="form-youtube-url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://youtu.be/…"
                  className="border-gold/20 bg-void/60"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveYoutube();
                    }
                  }}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setMode("choose")}
                  className="border-gold/30"
                >
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={saving || !youtubeUrl.trim()}
                  onClick={() => void saveYoutube()}
                  className="bg-gold text-void hover:bg-gold-muted"
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Save link
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={watching != null}
        onOpenChange={(open) => {
          if (!open) setWatchingId(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-4xl border-gold/20 bg-void p-3 sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="pr-8 text-gold">{exerciseName}</DialogTitle>
            <DialogDescription>
              Form video. Use the player fullscreen control if you need it larger.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-lg border border-gold/15 bg-black">
            {watchingYoutubeId ? (
              <iframe
                src={youtubeEmbedUrl(watchingYoutubeId, { autoplay: true })}
                title={`${exerciseName} form video`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                className="aspect-video w-full max-h-[80vh]"
              />
            ) : watching?.signedUrl ? (
              <video
                src={watching.signedUrl}
                controls
                autoPlay
                playsInline
                className="aspect-video w-full max-h-[80vh] object-contain"
              />
            ) : (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                Video unavailable
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
