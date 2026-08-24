"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRoleSpeech } from "@/lib/role-speech";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { resolveImageLocation } from "@/lib/location";
import { prepareVideoForUpload, VIDEO_TYPES, VIDEO_ACCEPT_EXTS, isAcceptedVideoUpload } from "@/lib/video-compress";
import { presignAndUpload } from "@/lib/storage/client";
import { computePremiereClosesAt } from "@/lib/tease-premiere";
import { formatDeadline } from "@/lib/format";
import type { TeaseMediaKind, TeasePremiereKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MEDIA_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES, ...VIDEO_ACCEPT_EXTS];

interface InboxTeaseFormProps {
  recipientId: string;
  onSuccess?: (createdId: string, summary: string) => void;
  className?: string;
}

export function InboxTeaseForm({
  recipientId,
  onSuccess,
  className,
}: InboxTeaseFormProps) {
  const { profile, isQueen } = useAuth();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [unlockLocal, setUnlockLocal] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [startBlurred, setStartBlurred] = useState(true);
  const [premiereKind, setPremiereKind] = useState<"none" | TeasePremiereKind>(
    "none"
  );
  const [premiereWindowMinutes, setPremiereWindowMinutes] = useState("15");
  const [premiereDenialDays, setPremiereDenialDays] = useState("1");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isQueen) return;
  }, [isQueen]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isQueen || !profile) {
      toast.error("Only Queen can send teases");
      return;
    }
    if (!title.trim() && !message.trim() && !file) {
      toast.error("Add a title, message, or media");
      return;
    }
    const isPremiereCreate = premiereKind !== "none";
    if (isPremiereCreate && !file) {
      toast.error("Premieres need an image or video");
      return;
    }
    if (premiereKind === "timed" && !unlockLocal) {
      toast.error("Timed premiere needs a showtime");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    try {
      let imagePath: string | null = null;
      let mediaKind: TeaseMediaKind = "image";
      let geo: Awaited<ReturnType<typeof resolveImageLocation>> = null;
      if (file) {
        const isVideo = isAcceptedVideoUpload(file);
        mediaKind = isVideo ? "video" : "image";
        let uploadFile = file;
        if (isVideo) {
          const prepared = await prepareVideoForUpload(file);
          uploadFile = prepared.file;
        } else {
          geo = await resolveImageLocation(file);
          uploadFile = await downsizeImageIfNeeded(file);
        }
        const ext =
          uploadFile.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
        imagePath = await presignAndUpload({
          bucket: "teases",
          file: uploadFile,
          contentType:
            uploadFile.type || (isVideo ? "video/mp4" : "image/jpeg"),
          ext,
          relativePath: `${profile.id}/${Date.now()}.${ext}`,
        });
      }

      const unlocks = unlockLocal ? new Date(unlockLocal) : new Date();
      const blurred = isPremiereCreate ? false : !!imagePath && startBlurred;
      const windowMins = Math.min(
        60,
        Math.max(5, parseInt(premiereWindowMinutes, 10) || 15)
      );
      const denialDays = Math.min(
        7,
        Math.max(0, parseInt(premiereDenialDays, 10) || 0)
      );

      const speechTitle = title.trim()
        ? formatRoleSpeech(title.trim(), "queen")
        : null;
      const speechMessage = message.trim()
        ? formatRoleSpeech(message.trim(), "queen")
        : null;

      const { data: created, error } = await supabase
        .from("teases")
        .insert({
          sent_by: profile.id,
          sent_to: recipientId,
          title: speechTitle,
          message: speechMessage,
          image_path: imagePath,
          media_kind: mediaKind,
          unlocks_at: unlocks.toISOString(),
          is_blurred: blurred,
          blur_amount: blurred ? 20 : 0,
          unblurred_at: blurred ? null : new Date().toISOString(),
          latitude: geo?.latitude ?? null,
          longitude: geo?.longitude ?? null,
          accuracy_m: geo?.accuracy_m ?? null,
          location_source: geo?.source ?? null,
          premiere_kind: isPremiereCreate ? premiereKind : null,
          premiere_window_minutes:
            premiereKind === "timed" ? windowMins : null,
          premiere_closes_at:
            premiereKind === "timed"
              ? computePremiereClosesAt(unlocks, windowMins)
              : null,
          premiere_denial_days: isPremiereCreate ? denialDays : 1,
        })
        .select("id")
        .single();

      if (error) throw error;
      if (!created?.id) throw new Error("Tease was not created");

      toast.success(
        premiereKind === "timed"
          ? "Timed premiere queued"
          : premiereKind === "burned"
            ? "Burned premiere queued"
            : mediaKind === "video"
              ? "Video tease queued"
              : "Tease queued"
      );
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title:
            premiereKind === "timed"
              ? "Timed premiere"
              : premiereKind === "burned"
                ? "Burned premiere"
                : mediaKind === "video"
                  ? "New video tease"
                  : "New tease",
          body:
            premiereKind === "timed"
              ? `Premiere at ${formatDeadline(unlocks.toISOString())} — one shot`
              : speechTitle || speechMessage || "Queen sent a tease",
          url: "/dashboard/teases",
          target: "slave",
          kind: isPremiereCreate ? "premiere" : "tease",
        })
      );
      onSuccess?.(
        created.id,
        speechTitle || speechMessage || "New tease"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send tease");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <Label>Mode</Label>
        <Select
          value={premiereKind}
          onValueChange={(v) =>
            setPremiereKind(v as "none" | TeasePremiereKind)
          }
        >
          <SelectTrigger className="border-gold/20 bg-void/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Normal tease</SelectItem>
            <SelectItem value="burned">Burned premiere</SelectItem>
            <SelectItem value="timed">Timed premiere</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border-gold/20 bg-void/60"
        />
      </div>
      <div className="space-y-2">
        <Label>Message</Label>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="border-gold/20 bg-void/60"
        />
      </div>
      <div className="space-y-2">
        <Label>
          {premiereKind === "timed" ? "Showtime" : "Available from (optional)"}
        </Label>
        <Input
          type="datetime-local"
          value={unlockLocal}
          onChange={(e) => setUnlockLocal(e.target.value)}
          className="border-gold/20 bg-void/60"
          required={premiereKind === "timed"}
        />
      </div>
      {premiereKind !== "none" && (
        <div className="grid grid-cols-2 gap-3">
          {premiereKind === "timed" && (
            <div className="space-y-1">
              <Label>Window (min)</Label>
              <Input
                type="number"
                min={5}
                max={60}
                value={premiereWindowMinutes}
                onChange={(e) => setPremiereWindowMinutes(e.target.value)}
                className="border-gold/20 bg-void/60"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label>Denial days</Label>
            <Input
              type="number"
              min={0}
              max={7}
              value={premiereDenialDays}
              onChange={(e) => setPremiereDenialDays(e.target.value)}
              className="border-gold/20 bg-void/60"
            />
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Label>Image or video</Label>
        <Input
          type="file"
          accept={MEDIA_TYPES.join(",")}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="border-gold/20 bg-void/60"
        />
        <p className="text-[11px] text-muted-foreground">
          {premiereKind !== "none"
            ? "One-shot premiere — burns after play or miss."
            : "D can watch again anytime until you blur it. Each watch sends a reaction video."}
        </p>
      </div>
      {premiereKind === "none" && (
        <label className="flex items-center gap-2 text-sm text-ivory/80">
          <Checkbox
            checked={startBlurred}
            onCheckedChange={(v) => setStartBlurred(v === true)}
          />
          Start blurred
        </label>
      )}
      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-gold text-void hover:bg-gold-muted"
      >
        {submitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        {premiereKind === "timed"
          ? "Send timed premiere"
          : premiereKind === "burned"
            ? "Send burned premiere"
            : "Send tease"}
      </Button>
    </form>
  );
}
