"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { removeObject } from "@/lib/storage/client";
import { uploadWorkoutMedia } from "@/lib/workout-persist";
import type { WorkoutBodyPart } from "@/lib/workout-exercises";
import type { WorkoutMedia } from "@/lib/types";
import { Button } from "@/components/ui/button";

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
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handlePick = async (files: FileList | null) => {
    if (!profile || !files?.length) return;
    setUploading(true);
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
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (m: ExerciseMediaView) => {
    setRemovingId(m.id);
    const supabase = createClient();
    await removeObject({ bucket: "workouts", path: m.file_path }).catch(
      () => undefined
    );
    const { error } = await supabase.from("workout_media").delete().eq("id", m.id);
    setRemovingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    onChanged();
  };

  if (videos.length === 0 && !canUpload) return null;

  return (
    <div className="space-y-2">
      {videos.map((m) => (
        <div
          key={m.id}
          className="relative overflow-hidden rounded-lg border border-gold/15 bg-void/40"
        >
          {m.signedUrl ? (
            <video
              src={m.signedUrl}
              controls
              playsInline
              className="max-h-56 w-full object-contain"
            />
          ) : (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Video unavailable
            </p>
          )}
          {canUpload && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={removingId === m.id}
              onClick={() => void remove(m)}
              className="absolute right-2 top-2 h-8 w-8 bg-void/70 p-0 text-ivory hover:text-red-300"
            >
              {removingId === m.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      ))}
      {canUpload && (
        <Button type="button" variant="outline" size="sm" disabled={uploading} asChild>
          <label className="cursor-pointer">
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Video className="mr-2 h-4 w-4" />
            )}
            {videos.length > 0 ? "Add another video" : "Add form video"}
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
      )}
    </div>
  );
}
