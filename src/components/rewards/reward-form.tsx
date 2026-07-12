"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Gift, ImagePlus, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { CapturedVoice } from "@/lib/voice";
import { uploadVoiceNote } from "@/lib/voice";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { resolveImageLocation } from "@/lib/location";
import { presignAndUpload } from "@/lib/storage/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { VoiceRecorder } from "@/components/voice/voice-recorder";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface RewardFormProps {
  recipientId: string;
  taskId?: string | null;
  submissionId?: string | null;
  onSuccess?: () => void;
  className?: string;
  compact?: boolean;
}

export function RewardForm({
  recipientId,
  taskId,
  submissionId,
  onSuccess,
  className,
  compact = false,
}: RewardFormProps) {
  const { profile, isQueen } = useAuth();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [voice, setVoice] = useState<CapturedVoice | null>(null);
  const [voiceKey, setVoiceKey] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const setImage = useCallback((next: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  }, [preview]);

  const pickFile = (incoming: FileList | File[] | null) => {
    const candidate = incoming?.[0];
    if (!candidate) return;
    if (!ACCEPTED_TYPES.includes(candidate.type)) {
      toast.error("Use a JPG, PNG, WebP, or GIF image");
      return;
    }
    if (candidate.size > MAX_FILE_SIZE) {
      toast.error("Image must be under 10MB");
      return;
    }
    setImage(candidate);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isQueen || !profile) {
      toast.error("Only the Queen can send rewards");
      return;
    }
    if (!file) {
      toast.error("Attach a reward image");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();

    try {
      const geo = await resolveImageLocation(file);
      if (geo) {
        toast.message(
          geo.source === "exif"
            ? "Photo location from image metadata"
            : "Photo location from device GPS"
        );
      }
      const uploadFile = await downsizeImageIfNeeded(file);
      if (uploadFile.size < file.size) {
        toast.message(
          `Image compressed to ${(uploadFile.size / 1024 / 1024).toFixed(2)} MB`
        );
      }
      const ext = uploadFile.name.split(".").pop() || "jpg";
      const filePath = await presignAndUpload({
        bucket: "rewards",
        file: uploadFile,
        contentType: uploadFile.type || "image/jpeg",
        ext,
        relativePath: `${profile.id}/${Date.now()}.${ext}`,
      });

      const { data: reward, error: insertError } = await supabase
        .from("rewards")
        .insert({
          sent_by: profile.id,
          sent_to: recipientId,
          title: title.trim() || null,
          message: message.trim() || null,
          image_path: filePath,
          task_id: taskId ?? null,
          submission_id: submissionId ?? null,
          latitude: geo?.latitude ?? null,
          longitude: geo?.longitude ?? null,
          accuracy_m: geo?.accuracy_m ?? null,
          location_source: geo?.source ?? null,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      if (voice && reward?.id) {
        await uploadVoiceNote(supabase, {
          userId: profile.id,
          entityType: "reward",
          entityId: reward.id,
          blob: voice.blob,
          durationMs: voice.durationMs,
        });
      }

      toast.success(voice ? "Reward & voice sent" : "Reward sent");
      setTitle("");
      setMessage("");
      setImage(null);
      setVoice(null);
      setVoiceKey((k) => k + 1);
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not send reward";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isQueen) return null;

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "space-y-5 rounded-xl border border-gold/20 bg-charcoal/80 p-6",
        className
      )}
    >
      {!compact && (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-royal/30">
            <Gift className="h-5 w-5 text-gold" />
          </div>
          <div>
            <h3 className="font-heading text-xl text-ivory">Send a Reward</h3>
            <p className="text-xs text-muted-foreground">
              Usually a picture — a gift for good obedience
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="reward-title">Title (optional)</Label>
        <Input
          id="reward-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Well done…"
          className="border-gold/20 bg-void/60"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="reward-message">Note (optional)</Label>
        <Textarea
          id="reward-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="A few words with your gift…"
          rows={compact ? 2 : 3}
          className="border-gold/20 bg-void/60"
        />
      </div>

      <div className="space-y-2">
        <Label>Reward image</Label>
        {preview ? (
          <div className="relative overflow-hidden rounded-lg border border-gold/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Reward preview"
              className="max-h-80 w-full object-contain bg-void"
            />
            <button
              type="button"
              onClick={() => setImage(null)}
              className="absolute right-2 top-2 rounded-full bg-void/80 p-1.5 text-ivory hover:text-gold"
              aria-label="Remove image"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              pickFile(e.dataTransfer.files);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 transition-colors",
              dragActive
                ? "border-gold bg-gold/10"
                : "border-gold/25 bg-void/40 hover:border-gold/50"
            )}
          >
            <ImagePlus className="h-8 w-8 text-gold/70" />
            <span className="text-sm text-muted-foreground">
              Drop an image or click to choose
            </span>
            <input
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              className="sr-only"
              onChange={(e) => pickFile(e.target.files)}
            />
          </label>
        )}
      </div>

      <div className="space-y-2">
        <Label>Voice message (optional)</Label>
        <VoiceRecorder
          key={voiceKey}
          captureOnly
          compact={compact}
          onCaptured={setVoice}
        />
      </div>

      <Button
        type="submit"
        disabled={submitting || !file}
        className="w-full bg-gold text-void hover:bg-gold-muted"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <Gift className="mr-2 h-4 w-4" />
            Send reward
          </>
        )}
      </Button>
    </form>
  );
}
