"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { HandHeart, ImagePlus, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { RequestType } from "@/lib/types";
import type { CapturedVoice } from "@/lib/voice";
import { uploadVoiceNote } from "@/lib/voice";
import { desireColor, desireLabel, REQUEST_TYPE_LABELS } from "@/lib/requests";
import { hasPunishmentEffect } from "@/lib/punishments";
import { formatRoleSpeech } from "@/lib/role-speech";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { resolveImageLocation } from "@/lib/location";
import { presignAndUpload } from "@/lib/storage/client";
import { postToTopicThread } from "@/lib/inbox";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface RequestFormProps {
  onSuccess?: () => void;
  className?: string;
  defaultType?: RequestType;
}

export function RequestForm({
  onSuccess,
  className,
  defaultType = "general",
}: RequestFormProps) {
  const { profile, isSlave } = useAuth();
  const [type, setType] = useState<RequestType>(defaultType);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [desire, setDesire] = useState(50);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [voice, setVoice] = useState<CapturedVoice | null>(null);
  const [voiceKey, setVoiceKey] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [contactBlocked, setContactBlocked] = useState(false);

  const label = useMemo(() => desireLabel(desire), [desire]);

  const setImage = useCallback(
    (next: File | null) => {
      if (preview) URL.revokeObjectURL(preview);
      setFile(next);
      setPreview(next ? URL.createObjectURL(next) : null);
    },
    [preview]
  );

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

  useEffect(() => {
    if (!isSlave || !profile) return;
    void hasPunishmentEffect("contact", profile.id).then(setContactBlocked);
  }, [isSlave, profile]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSlave || !profile) {
      toast.error("Only D can send requests");
      return;
    }
    if (contactBlocked) {
      toast.error("Contact is restricted — you cannot send requests");
      return;
    }
    if (!title.trim()) {
      toast.error("Give your request a title");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();

    try {
      const { consumeAttention } = await import("@/lib/attention-budget");
      const gate = await consumeAttention(supabase, "request");
      if (!gate.ok) {
        toast.error(gate.error ?? "Daily request limit reached");
        return;
      }
      if (gate.used_token) {
        toast.message("Used a speak-freely token");
      }

      let imagePath: string | null = null;
      if (file) {
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
        imagePath = await presignAndUpload({
          bucket: "messages",
          file: uploadFile,
          contentType: uploadFile.type || "image/jpeg",
          ext,
          relativePath: `${profile.id}/requests/${Date.now()}.${ext}`,
        });
      }

      const formattedTitle = formatRoleSpeech(title.trim(), "slave");
      const formattedMessage = message.trim()
        ? formatRoleSpeech(message.trim(), "slave")
        : null;

      const { data: request, error } = await supabase
        .from("requests")
        .insert({
          requested_by: profile.id,
          request_type: type,
          title: formattedTitle,
          message: formattedMessage,
          image_path: imagePath,
          desire_level: desire,
          status: "pending",
        })
        .select("id")
        .single();

      if (error) throw error;

      let voicePath: string | null = null;
      let voiceDurationMs: number | null = null;
      if (voice && request?.id) {
        voicePath = await uploadVoiceNote(supabase, {
          userId: profile.id,
          entityType: "request",
          entityId: request.id,
          blob: voice.blob,
          durationMs: voice.durationMs,
        });
        voiceDurationMs = voice.durationMs;
      }

      if (request?.id) {
        const inboxContent = formattedMessage
          ? `${formattedTitle}\n${formattedMessage}`
          : formattedTitle;
        void postToTopicThread(supabase, {
          topic: "requests",
          senderId: profile.id,
          content: inboxContent,
          mediaPath: imagePath,
          mediaType: imagePath ? "image" : null,
          voicePath,
          voiceDurationMs,
          attachmentType: "request",
          attachmentId: request.id,
        });
      }

      const extras = [imagePath && "photo", voice && "voice"].filter(Boolean);
      toast.success(
        extras.length > 0
          ? `Request sent with ${extras.join(" & ")}`
          : "Request sent to Queen"
      );
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "New request",
          body: title.trim(),
          url: "/dashboard/requests",
          target: "queen",
        })
      );
      setTitle("");
      setMessage("");
      setDesire(50);
      setType(defaultType);
      setImage(null);
      setVoice(null);
      setVoiceKey((k) => k + 1);
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not send request";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isSlave) return null;

  if (contactBlocked) {
    return (
      <div
        className={cn(
          "rounded-xl border border-red-500/30 bg-red-950/20 p-5 text-sm text-red-200",
          className
        )}
      >
        Contact / privilege freeze is active. You cannot send new requests until
        it is lifted.
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "space-y-6 rounded-xl border border-gold/20 bg-charcoal/80 p-5 sm:p-6",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-royal/30">
          <HandHeart className="h-5 w-5 text-gold" />
        </div>
        <div>
          <h3 className="font-heading text-xl text-ivory">Make a Request</h3>
          <p className="text-xs text-muted-foreground">
            Ask, and show how badly you want it
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={type} onValueChange={(v) => setType(v as RequestType)}>
          <SelectTrigger className="w-full border-gold/20 bg-void/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(REQUEST_TYPE_LABELS) as RequestType[]).map((key) => (
              <SelectItem key={key} value={key}>
                {REQUEST_TYPE_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="request-title">What do you want?</Label>
        <Input
          id="request-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Permission to speak… a small mercy…"
          className="border-gold/20 bg-void/60"
          required
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="request-message">Why (optional)</Label>
        <Textarea
          id="request-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Explain yourself…"
          rows={3}
          className="border-gold/20 bg-void/60"
        />
      </div>

      <div className="space-y-2">
        <Label>Photo (optional)</Label>
        {preview ? (
          <div className="relative overflow-hidden rounded-lg border border-gold/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Request preview"
              className="max-h-64 w-full object-contain bg-void"
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
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 transition-colors",
              dragActive
                ? "border-gold bg-gold/10"
                : "border-gold/25 bg-void/40 hover:border-gold/50"
            )}
          >
            <ImagePlus className="h-7 w-7 text-gold/70" />
            <span className="text-sm text-muted-foreground">
              Drop a photo or click to choose
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
        <Label>Voice note (optional)</Label>
        <VoiceRecorder
          key={voiceKey}
          captureOnly
          onCaptured={setVoice}
        />
      </div>

      <div className="space-y-4 rounded-lg border border-gold/15 bg-void/50 p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <Label className="text-ivory/80">How much do you want it?</Label>
            <p className={cn("mt-1 font-heading text-2xl", desireColor(desire))}>
              {label}
            </p>
          </div>
          <p className="font-heading text-3xl tabular-nums text-gold">
            {desire}
            <span className="text-sm text-muted-foreground">/100</span>
          </p>
        </div>

        <Slider
          value={[desire]}
          onValueChange={(v) => setDesire(v[0] ?? 50)}
          min={1}
          max={100}
          step={1}
          aria-label="Desire level"
          className="py-2 **:data-[slot=slider-range]:bg-gold **:data-[slot=slider-thumb]:border-gold **:data-[slot=slider-thumb]:bg-gold"
        />

        <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Quiet</span>
          <span>Desperate</span>
        </div>
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-gold text-void hover:bg-gold-muted"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <HandHeart className="mr-2 h-4 w-4" />
            Submit request
          </>
        )}
      </Button>
    </form>
  );
}
